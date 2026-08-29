package main

import (
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// ==========================================
// 1. OS LAYER: WORKER POOL & MUTEX LOCKS
// ==========================================

type Job struct {
	InstanceID int
	Name       string
}

type WorkerPool struct {
	DB            *sql.DB
	JobQueue      chan Job
	WorkerCount   int
	MutexMap      sync.Mutex
	InstanceLocks map[int]*sync.Mutex
}

func NewWorkerPool(db *sql.DB, workerCount int, queueSize int) *WorkerPool {
	return &WorkerPool{
		DB:            db,
		JobQueue:      make(chan Job, queueSize),
		WorkerCount:   workerCount,
		InstanceLocks: make(map[int]*sync.Mutex),
	}
}

func (wp *WorkerPool) GetInstanceLock(instanceID int) *sync.Mutex {
	wp.MutexMap.Lock()
	defer wp.MutexMap.Unlock()

	if _, exists := wp.InstanceLocks[instanceID]; !exists {
		wp.InstanceLocks[instanceID] = &sync.Mutex{}
	}
	return wp.InstanceLocks[instanceID]
}

func (wp *WorkerPool) Start() {
	for i := 1; i <= wp.WorkerCount; i++ {
		go wp.workerRoutine(i)
	}
	fmt.Printf("[OS Engine] Started %d Worker Threads\n", wp.WorkerCount)
}

func (wp *WorkerPool) workerRoutine(workerID int) {
	for job := range wp.JobQueue {
		fmt.Printf("[Worker %d] Processing Provisioning for Instance ID: %d (%s)\n", workerID, job.InstanceID, job.Name)

		lock := wp.GetInstanceLock(job.InstanceID)
		lock.Lock()

		// Update State -> PROVISIONING
		_, _ = wp.DB.Exec("UPDATE instances SET status = 'PROVISIONING' WHERE id = ?", job.InstanceID)

		// Simulate OS allocation / boot delay
		time.Sleep(3 * time.Second)

		// Update State -> RUNNING
		_, _ = wp.DB.Exec("UPDATE instances SET status = 'RUNNING' WHERE id = ?", job.InstanceID)

		fmt.Printf("[Worker %d] Finished Provisioning Instance ID: %d!\n", workerID, job.InstanceID)
		lock.Unlock()
	}
}

// ==========================================
// 2. NETWORKING LAYER: CIDR & SOCKET CHECKS
// ==========================================

type SubnetInfo struct {
	CIDR             string `json:"cidr"`
	NetworkAddress   string `json:"network_address"`
	BroadcastAddress string `json:"broadcast_address"`
	TotalHosts       uint32 `json:"total_hosts"`
	UsableHosts      uint32 `json:"usable_hosts"`
}

// CalculateCIDR parses a string like "10.0.1.0/24" using bitwise operations
func CalculateCIDR(cidrStr string) (*SubnetInfo, error) {
	parts := strings.Split(cidrStr, "/")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid CIDR format")
	}

	ipStr := parts[0]
	prefixLen, err := strconv.Atoi(parts[1])
	if err != nil || prefixLen < 0 || prefixLen > 32 {
		return nil, fmt.Errorf("invalid prefix length")
	}

	ip := net.ParseIP(ipStr).To4()
	if ip == nil {
		return nil, fmt.Errorf("invalid IPv4 address")
	}

	ipUint := binary.BigEndian.Uint32(ip)
	mask := uint32(0xFFFFFFFF) << (32 - prefixLen)

	networkUint := ipUint & mask
	broadcastUint := networkUint | ^mask

	netIP := make(net.IP, 4)
	broadIP := make(net.IP, 4)
	binary.BigEndian.PutUint32(netIP, networkUint)
	binary.BigEndian.PutUint32(broadIP, broadcastUint)

	totalHosts := uint32(1) << (32 - prefixLen)
	usableHosts := totalHosts - 2
	if prefixLen >= 31 {
		usableHosts = 0
	}

	return &SubnetInfo{
		CIDR:             cidrStr,
		NetworkAddress:   netIP.String(),
		BroadcastAddress: broadIP.String(),
		TotalHosts:       totalHosts,
		UsableHosts:      usableHosts,
	}, nil
}

// TCPPing checks if a port is reachable over Layer 4 TCP
func TCPPing(ip string, port int, timeout time.Duration) bool {
	target := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("tcp", target, timeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// ==========================================
// 3. HTTP REST API HANDLERS
// ==========================================

type Server struct {
	DB   *sql.DB
	Pool *WorkerPool
}

type Instance struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	SubnetID  int    `json:"subnet_id"`
	Name      string `json:"name"`
	VCPUs     int    `json:"vcpus"`
	RAMMB     int    `json:"ram_mb"`
	IPAddress string `json:"ip_address"`
	Status    string `json:"status"`
}

func (s *Server) handleInstances(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodGet {
		rows, err := s.DB.Query("SELECT id, user_id, subnet_id, name, vcpus, ram_mb, IFNULL(ip_address, ''), status FROM instances")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var instances []Instance
		for rows.Next() {
			var inst Instance
			_ = rows.Scan(&inst.ID, &inst.UserID, &inst.SubnetID, &inst.Name, &inst.VCPUs, &inst.RAMMB, &inst.IPAddress, &inst.Status)
			instances = append(instances, inst)
		}
		json.NewEncoder(w).Encode(instances)
		return
	}

	if r.Method == http.MethodPost {
		var req struct {
			Name  string `json:"name"`
			VCPUs int    `json:"vcpus"`
			RAMMB int    `json:"ram_mb"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid body", http.StatusBadRequest)
			return
		}

		result, err := s.DB.Exec(
			"INSERT INTO instances (user_id, subnet_id, name, vcpus, ram_mb, status, ip_address) VALUES (1, 1, ?, ?, ?, 'PENDING', '10.0.1.10')",
			req.Name, req.VCPUs, req.RAMMB,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		instanceID, _ := result.LastInsertId()

		// Enqueue job to OS Worker Pool
		s.Pool.JobQueue <- Job{
			InstanceID: int(instanceID),
			Name:       req.Name,
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":     "Provisioning job enqueued",
			"instance_id": instanceID,
			"status":      "PENDING",
		})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (s *Server) handleSubnetCalc(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	cidr := r.URL.Query().Get("cidr")
	if cidr == "" {
		cidr = "10.0.1.0/24"
	}

	info, err := CalculateCIDR(cidr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(info)
}

// ==========================================
// 4. MAIN ENTRY POINT
// ==========================================

func main() {
	// UPDATED WITH YOUR PASSWORD: Sagar@2006
	dsn := "root:Sagar@2006@tcp(127.0.0.1:3306)/cloud_manager?parseTime=true"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("DB Connection Error: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping MySQL: %v", err)
	}

	fmt.Println("[DBMS Engine] Connected to MySQL Successfully!")

	// Start OS Worker Pool (3 Threads, Queue capacity 10)
	pool := NewWorkerPool(db, 3, 10)
	pool.Start()

	server := &Server{
		DB:   db,
		Pool: pool,
	}

	// Register REST HTTP Routes
	http.HandleFunc("/api/instances", server.handleInstances)
	http.HandleFunc("/api/subnet-calc", server.handleSubnetCalc)

	fmt.Println("[HTTP API Gateway] Server running at http://localhost:8080")
	fmt.Println("  - GET  http://localhost:8080/api/instances")
	fmt.Println("  - POST http://localhost:8080/api/instances")
	fmt.Println("  - GET  http://localhost:8080/api/subnet-calc?cidr=10.0.1.0/24")

	log.Fatal(http.ListenAndServe(":8080", nil))
}