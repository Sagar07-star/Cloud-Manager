# Cloud Manager

A mini cloud-management platform that simulates how a real cloud provider provisions virtual machines. It combines a **Go backend** (concurrent worker pool, REST API, bitwise subnet calculator) with a **MySQL** database and a **React + Tailwind** dashboard.

The project is built around three core computer-science ideas:

| Layer | Concept | Where |
|-------|---------|-------|
| **Operating Systems** | Worker pool (threads/goroutines), job queue, per-instance mutex locks | `CLOUD/main.go` |
| **Networking** | CIDR / subnet math using bitwise operations, TCP port checks | `CLOUD/main.go` |
| **DBMS** | MySQL-backed persistence of instances and their lifecycle state | `CLOUD/main.go`, `CLOUD/db/` |

---

## Features

- **Provision virtual machines** with a chosen name, vCPU count (1–8) and RAM (1–8 GB).
- **Asynchronous provisioning** – requests are placed on a job queue and handled by a pool of 3 worker goroutines.
- **Live status tracking** – instances move through `PENDING → PROVISIONING → RUNNING`; the dashboard auto-refreshes every 2 seconds.
- **Per-instance mutex locks** so two workers never operate on the same instance at once.
- **Subnet (CIDR) calculator** – returns network address, broadcast address, total hosts and usable hosts, computed with bitwise operations.
- **TCP ping utility** (`TCPPing`) for Layer-4 reachability checks.
- **Dark-themed React dashboard** built with Vite, Tailwind CSS and Lucide icons.

---

##  Architecture

```
┌──────────────────────┐   HTTP /api/*   ┌───────────────────────────────┐
│  React Dashboard     │ ──────────────► │  Go HTTP API  (:8080)         │
│  (Vite dev :5173)    │ ◄────────────── │                               │
└──────────────────────┘                 │   ┌───────────────────────┐   │
                                         │   │ Job Queue (cap 10)    │   │
                                         │   └──────────┬────────────┘   │
                                         │      ┌───────┴───────┐        │
                                         │   Worker 1  Worker 2  Worker 3│
                                         │      └───────┬───────┘        │
                                         └──────────────┼────────────────┘
                                                        ▼
                                              ┌──────────────────┐
                                              │ MySQL            │
                                              │ cloud_manager DB │
                                              └──────────────────┘
```

**Provisioning flow**

1. The client sends `POST /api/instances`.
2. The API inserts a row with status `PENDING` and pushes a `Job` onto the queue.
3. A free worker acquires the instance's mutex, sets the status to `PROVISIONING`, simulates a 3-second boot delay, then sets it to `RUNNING`.
4. The dashboard polls `GET /api/instances` and shows the new state.

---

##  Tech Stack

**Backend:** Go, `database/sql`, `go-sql-driver/mysql`, `net/http`
**Database:** MySQL
**Frontend:** React 19, Vite, Tailwind CSS 4, Lucide React, Oxlint

---

## Project Structure

```
Cloud-Manager/
├── CLOUD/                    # Go backend
│   ├── main.go               # Worker pool, CIDR calculator, REST handlers, entry point
│   ├── worker/pool.go        # Worker package
│   ├── db/database.go        # MySQL connection helper
│   ├── go.mod
│   └── go.sum
└── cloud-frontend/           # React dashboard
    ├── src/
    │   ├── App.jsx           # Dashboard UI
    │   ├── main.jsx
    │   └── index.css
    ├── vite.config.js        # Dev server + /api proxy to :8080
    └── package.json
```

---

## Prerequisites

- [Go](https://go.dev/dl/) (the module targets the version in `CLOUD/go.mod`)
- [Node.js](https://nodejs.org/) 18+ and npm
- [MySQL](https://dev.mysql.com/downloads/) 8+ running locally on port `3306`

---

##  Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Sagar07-star/Cloud-Manager.git
cd Cloud-Manager
```

### 2. Set up the database

Create the database and the `instances` table (schema inferred from the API code):

```sql
CREATE DATABASE IF NOT EXISTS cloud_manager;
USE cloud_manager;

CREATE TABLE IF NOT EXISTS instances (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    subnet_id   INT NOT NULL,
    name        VARCHAR(255) NOT NULL,
    vcpus       INT NOT NULL,
    ram_mb      INT NOT NULL,
    ip_address  VARCHAR(45),
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING'
);
```

### 3. Configure the database connection

In `CLOUD/main.go`, update the DSN in `main()` with your own MySQL credentials:

```go
dsn := "<user>:<password>@tcp(127.0.0.1:3306)/cloud_manager?parseTime=true"
```

>  **Do not commit real passwords.** Consider reading credentials from environment variables (e.g. `os.Getenv("DB_PASSWORD")`) instead of hard-coding them.

### 4. Run the backend

```bash
cd CLOUD
go mod tidy
go run main.go
```

You should see:

```
[DBMS Engine] Connected to MySQL Successfully!
[OS Engine] Started 3 Worker Threads
[HTTP API Gateway] Server running at http://localhost:8080
```

### 5. Run the frontend

In a second terminal:

```bash
cd cloud-frontend
npm install
npm run dev
```

Open the URL Vite prints (usually <http://localhost:5173>). Requests to `/api/*` are proxied to the Go server on port `8080`.

---

## 📡 API Reference

Base URL: `http://localhost:8080`

### `GET /api/instances`

Returns all instances.

```json
[
  {
    "id": 1,
    "user_id": 1,
    "subnet_id": 1,
    "name": "web-server-node-1",
    "vcpus": 2,
    "ram_mb": 2048,
    "ip_address": "10.0.1.10",
    "status": "RUNNING"
  }
]
```

### `POST /api/instances`

Creates an instance and enqueues a provisioning job.

**Request body**

```json
{ "name": "web-server-node-1", "vcpus": 2, "ram_mb": 2048 }
```

**Response – `201 Created`**

```json
{
  "message": "Provisioning job enqueued",
  "instance_id": 1,
  "status": "PENDING"
}
```

### `GET /api/subnet-calc?cidr=10.0.1.0/24`

Calculates subnet details. Defaults to `10.0.1.0/24` if `cidr` is omitted.

```json
{
  "cidr": "10.0.1.0/24",
  "network_address": "10.0.1.0",
  "broadcast_address": "10.0.1.255",
  "total_hosts": 256,
  "usable_hosts": 254
}
```

Returns `400 Bad Request` for an invalid CIDR.

---

## 🔬 How the Subnet Calculator Works

For a CIDR such as `10.0.1.0/24`:

```
mask      = 0xFFFFFFFF << (32 - prefix)
network   = ip & mask
broadcast = network | ^mask
total     = 1 << (32 - prefix)
usable    = total - 2          (0 for /31 and /32)
```

---

##  Quick Test with cURL

```bash
# Create an instance
curl -X POST http://localhost:8080/api/instances \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-vm","vcpus":2,"ram_mb":2048}'

# List instances (status changes PENDING → PROVISIONING → RUNNING)
curl http://localhost:8080/api/instances

# Subnet calculation
curl "http://localhost:8080/api/subnet-calc?cidr=192.168.0.0/16"
```

---

## 🗺️ Roadmap / Ideas

- Move DB credentials to environment variables / a config file
- User authentication and multi-user support (currently hard-coded `user_id = 1`)
- Dynamic IP allocation from subnets (currently `10.0.1.10`)
- Start / stop / delete instance endpoints
- Subnet management and persistence
- Dockerfile and `docker-compose.yml` for one-command startup

---

##  Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

##  Author

**Sagar** – [@Sagar07-star](https://github.com/Sagar07-star)
