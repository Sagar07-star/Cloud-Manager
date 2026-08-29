import React, { useState, useEffect } from 'react';
import { Server, Cpu, HardDrive, Network, RefreshCw, PlusCircle, CheckCircle2, Clock } from 'lucide-react';

export default function App() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [vmName, setVmName] = useState('');
  const [vcpus, setVcpus] = useState(2);
  const [ramMb, setRamMb] = useState(2048);

  // Subnet Calc State
  const [cidrInput, setCidrInput] = useState('10.0.1.0/24');
  const [subnetData, setSubnetData] = useState(null);

  // Fetch Instances from Go API
  const fetchInstances = async () => {
    try {
      const res = await fetch('/api/instances');
      const data = await res.json();
      setInstances(data || []);
    } catch (err) {
      console.error('Failed to fetch instances:', err);
    }
  };

  // Fetch CIDR calculation
  const calculateSubnet = async () => {
    try {
      const res = await fetch(`/api/subnet-calc?cidr=${encodeURIComponent(cidrInput)}`);
      const data = await res.json();
      setSubnetData(data);
    } catch (err) {
      console.error('Failed to calculate subnet:', err);
    }
  };

  // Create Instance (Triggers Go OS Worker Pool)
  const handleProvision = async (e) => {
    e.preventDefault();
    if (!vmName) return;

    setLoading(true);
    try {
      await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: vmName, vcpus: parseInt(vcpus), ram_mb: parseInt(ramMb) }),
      });
      setVmName('');
      fetchInstances();
    } catch (err) {
      console.error('Failed to provision instance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    calculateSubnet();
    const interval = setInterval(fetchInstances, 2000); // Auto-refresh status
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      {/* Top Header */}
      <header className="max-w-7xl mx-auto flex items-center justify-between pb-6 border-b border-slate-800 mb-8">
        <div className="flex items-center gap-3">
          <Server className="w-8 h-8 text-cyan-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cloud Manager Dashboard</h1>
            <p className="text-sm text-slate-400">Go Thread Pool Engine • MySQL Storage • Bitwise CIDR Calculator</p>
          </div>
        </div>
        <button 
          onClick={fetchInstances}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg border border-slate-700 text-sm font-medium transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4 text-cyan-400" /> Refresh Data
        </button>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form & CIDR Tool */}
        <div className="space-y-6">
          
          {/* Provision VM Form */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-100 mb-4">
              <PlusCircle className="w-5 h-5 text-cyan-400" /> Provision Virtual Machine
            </h2>
            <form onSubmit={handleProvision} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Instance Name</label>
                <input 
                  type="text"
                  placeholder="e.g. web-server-node-1"
                  value={vmName}
                  onChange={(e) => setVmName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">vCPUs</label>
                  <select 
                    value={vcpus} 
                    onChange={(e) => setVcpus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="1">1 vCPU</option>
                    <option value="2">2 vCPUs</option>
                    <option value="4">4 vCPUs</option>
                    <option value="8">8 vCPUs</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">RAM (MB)</label>
                  <select 
                    value={ramMb} 
                    onChange={(e) => setRamMb(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="1024">1024 MB (1GB)</option>
                    <option value="2048">2048 MB (2GB)</option>
                    <option value="4096">4096 MB (4GB)</option>
                    <option value="8192">8192 MB (8GB)</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold py-2.5 rounded-lg transition text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? 'Submitting Job...' : 'Launch Instance'}
              </button>
            </form>
          </div>

          {/* Subnet Calculator Widget */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-100 mb-4">
              <Network className="w-5 h-5 text-cyan-400" /> Computer Networks CIDR Engine
            </h2>
            <div className="flex gap-2 mb-4">
              <input 
                type="text"
                value={cidrInput}
                onChange={(e) => setCidrInput(e.target.value)}
                placeholder="10.0.1.0/24"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              <button 
                onClick={calculateSubnet}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 transition cursor-pointer"
              >
                Calculate
              </button>
            </div>

            {subnetData && (
              <div className="bg-slate-900 p-4 rounded-lg space-y-2 text-xs border border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">Network Addr:</span>
                  <span className="font-mono text-cyan-400">{subnetData.network_address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Broadcast Addr:</span>
                  <span className="font-mono text-cyan-400">{subnetData.broadcast_address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Capacity:</span>
                  <span className="font-mono text-slate-200">{subnetData.total_hosts} IPs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Usable Hosts:</span>
                  <span className="font-mono text-emerald-400">{subnetData.usable_hosts} Host IPs</span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Active Cloud Instances List */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-100 mb-6">
            <Cpu className="w-5 h-5 text-cyan-400" /> Active Cloud Instances ({instances.length})
          </h2>

          {instances.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-lg">
              No instances created yet. Use the form on the left to launch one!
            </div>
          ) : (
            <div className="space-y-4">
              {instances.map((inst) => (
                <div key={inst.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-100">{inst.name}</span>
                      <span className="text-xs text-slate-500 font-mono">ID: #{inst.id}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-slate-500" /> {inst.vcpus} vCPU</span>
                      <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5 text-slate-500" /> {inst.ram_mb} MB</span>
                      <span className="flex items-center gap-1 font-mono text-cyan-400/80"><Network className="w-3.5 h-3.5 text-slate-500" /> {inst.ip_address || 'Unassigned'}</span>
                    </div>
                  </div>

                  {/* Dynamic Status Badge */}
                  <div>
                    {inst.status === 'RUNNING' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> RUNNING
                      </span>
                    )}
                    {inst.status === 'PROVISIONING' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                        <Clock className="w-3.5 h-3.5" /> PROVISIONING
                      </span>
                    )}
                    {inst.status === 'PENDING' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        <Clock className="w-3.5 h-3.5" /> PENDING
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}