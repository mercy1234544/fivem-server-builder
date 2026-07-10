import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Moon, Sun, Monitor, HardDrive, Cpu, MemoryStick, Activity, Info, Database, Server,
  Shield, KeyRound, LogOut,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useLocalAccess } from '../stores/useLocalAccess';
import { isSupabaseConfigured } from '../lib/supabase';

interface SysInfo {
  cpuModel: string; cpuCores: number; cpuUsage: number;
  totalMem: number; freeMem: number;
  platform: string; hostname: string;
  disk: { total: number; free: number } | null;
  appVersion: string; electron: string;
}

const gb = (n: number) => (n / 1024 / 1024 / 1024).toFixed(1);

function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-overlay-6 rounded-full overflow-hidden mt-3">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export default function Settings() {
  const { theme, toggleTheme, servers } = useAppStore();
  const [sys, setSys] = useState<SysInfo | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();
  const adminUnlocked = useLocalAccess((s) => s.unlocked);
  const adminHasPin = useLocalAccess((s) => s.hasPin);
  const adminLock = useLocalAccess((s) => s.lock);

  useEffect(() => {
    const poll = () => window.electronAPI?.system?.getInfo().then(setSys).catch(() => {});
    poll();
    timer.current = setInterval(poll, 2500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const running = servers.filter((s) => s.status === 'running').length;
  const memUsedPct = sys ? ((sys.totalMem - sys.freeMem) / sys.totalMem) * 100 : 0;
  const diskUsed = sys?.disk ? sys.disk.total - sys.disk.free : 0;
  const diskPct = sys?.disk ? (diskUsed / sys.disk.total) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-7 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-surface-100">Settings</h1>
        <p className="text-sm text-surface-400 mt-1">Manage your storage, system resources, and configuration</p>
      </div>

      {/* ═══ Storage Management ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-surface-200">Storage Management</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
                <HardDrive size={17} className="text-blue-400" />
              </div>
              <div>
                <p className="text-[11px] text-surface-500">Total Disk Usage</p>
                <p className="text-xl font-extrabold text-surface-100">{sys?.disk ? `${gb(diskUsed)} GB` : '—'}</p>
              </div>
            </div>
            <UsageBar pct={diskPct} color="bg-gradient-to-r from-blue-600 to-blue-400" />
            <p className="text-[10px] text-surface-500 mt-2">
              {sys?.disk ? `${gb(diskUsed)} GB of ${gb(sys.disk.total)} GB used · ${gb(sys.disk.free)} GB free` : 'Reading disk…'}
            </p>
          </div>
          <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/20 flex items-center justify-center">
                <Database size={17} className="text-purple-400" />
              </div>
              <div>
                <p className="text-[11px] text-surface-500">Servers Registered</p>
                <p className="text-xl font-extrabold text-surface-100">{servers.length}</p>
              </div>
            </div>
            <UsageBar pct={servers.length > 0 ? 100 : 0} color="bg-gradient-to-r from-purple-600 to-purple-400" />
            <p className="text-[10px] text-surface-500 mt-2">{servers.length} server{servers.length !== 1 ? 's' : ''} managed by this app</p>
          </div>
        </div>
      </section>

      {/* ═══ System Resources ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-surface-200">System Resources</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/20 flex items-center justify-center">
                <Cpu size={17} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] text-surface-500">CPU Usage</p>
                <p className="text-xl font-extrabold text-surface-100">{sys ? `${sys.cpuUsage.toFixed(1)}%` : '—'}</p>
              </div>
            </div>
            <UsageBar pct={sys?.cpuUsage ?? 0} color="bg-gradient-to-r from-emerald-600 to-emerald-400" />
          </div>
          <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/20 flex items-center justify-center">
                <MemoryStick size={17} className="text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] text-surface-500">RAM Usage</p>
                <p className="text-xl font-extrabold text-surface-100">{sys ? `${memUsedPct.toFixed(1)}%` : '—'}</p>
              </div>
            </div>
            <UsageBar pct={memUsedPct} color="bg-gradient-to-r from-amber-600 to-orange-400" />
          </div>
          <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600/20 border border-sky-500/20 flex items-center justify-center">
                <Activity size={17} className="text-sky-400" />
              </div>
              <div>
                <p className="text-[11px] text-surface-500">Active Servers</p>
                <p className="text-xl font-extrabold text-surface-100">{running}</p>
              </div>
            </div>
            <UsageBar pct={servers.length ? (running / servers.length) * 100 : 0} color="bg-gradient-to-r from-sky-600 to-sky-400" />
          </div>
        </div>

        {/* System Specifications */}
        <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
          <h3 className="text-sm font-bold text-surface-100 mb-4">System Specifications</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              { label: 'Processor', value: sys ? `${sys.cpuModel} (${sys.cpuCores} threads)` : '—' },
              { label: 'Memory', value: sys ? `${gb(sys.totalMem)} GB RAM · ${gb(sys.freeMem)} GB free` : '—' },
              { label: 'Operating System', value: sys?.platform ?? '—' },
              { label: 'Computer Name', value: sys?.hostname ?? '—' },
            ].map((row) => (
              <div key={row.label}>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-0.5">{row.label}</p>
                <p className="text-sm text-surface-200 font-medium">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Appearance ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-surface-200">Appearance</h2>
        <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600/20 border border-primary-500/20 flex items-center justify-center">
              <Monitor size={17} className="text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-100">Theme</p>
              <p className="text-xs text-surface-500">Switch between dark and light mode</p>
            </div>
          </div>
          <button onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 bg-overlay-6 rounded-xl hover:bg-overlay-10 border border-overlay-8 transition-colors">
            {theme === 'dark' ? <Moon size={15} className="text-blue-400" /> : <Sun size={15} className="text-amber-400" />}
            <span className="text-sm capitalize text-surface-200">{theme} Mode</span>
          </button>
        </div>
      </section>

      {/* ═══ Admin Access (local, no-database mode only) ═══ */}
      {!isSupabaseConfigured() && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-surface-200">Admin Access</h2>
          <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-600/20 border border-primary-500/25 flex items-center justify-center shrink-0">
              <Shield size={17} className="text-primary-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-surface-100">
                {adminUnlocked ? 'You have admin access on this computer' : adminHasPin ? 'Enter your admin code to manage access' : 'Set up admin access'}
              </p>
              <p className="text-xs text-surface-500 mt-0.5">
                {adminUnlocked
                  ? 'The Admin tab is available in the top bar. You can hand out script unlock codes there.'
                  : 'Protected by a 4-digit code. Only people with the code can see the Admin tab.'}
              </p>
            </div>
            {adminUnlocked ? (
              <button onClick={() => { adminLock(); }} className="flex items-center gap-1.5 btn-secondary text-xs py-2 shrink-0">
                <LogOut size={13} /> Sign out
              </button>
            ) : (
              <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 btn-primary text-xs py-2 shrink-0">
                <KeyRound size={13} /> {adminHasPin ? 'Enter code' : 'Set up'}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ═══ About ═══ */}
      <section className="space-y-3 pb-6">
        <h2 className="text-sm font-bold text-surface-200">About</h2>
        <div className="rounded-2xl border border-overlay-6 bg-surface-900/40 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-600/25 border border-primary-500/25 flex items-center justify-center">
              <Server size={17} className="text-primary-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-surface-100">FiveM Server Builder</p>
              <p className="text-xs text-surface-500">Local Game Server Management</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'App Version', value: sys?.appVersion ?? '…' },
              { label: 'Electron', value: sys?.electron ?? '…' },
              { label: 'Games Supported', value: 'FiveM · more coming soon' },
            ].map((r) => (
              <div key={r.label}>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-0.5">{r.label}</p>
                <p className="text-sm text-surface-200 font-medium flex items-center gap-1.5"><Info size={11} className="text-surface-600" /> {r.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
