import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Download,
  Check,
  AlertCircle,
  Clock,
  ExternalLink,
  FolderOpen,
  Search,
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  GitBranch,
  Calendar,
  Filter,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import toast from 'react-hot-toast';

interface ResourceUpdate {
  name: string;
  path: string;
  repoUrl: string;
  version: string;
  folder: string;
  hasUpdate: boolean;
  latestCommitDate: string;
  installedDate: string;
}

type FilterMode = 'all' | 'updates' | 'current';

export default function ResourceUpdater() {
  const { servers, activeServerId } = useAppStore();
  const activeServer = servers.find((s) => s.id === activeServerId);

  const [resources, setResources] = useState<ResourceUpdate[]>([]);
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [updated, setUpdated] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const scanForUpdates = async () => {
    if (!activeServer) {
      toast.error('Select a server first');
      return;
    }
    setScanning(true);
    setResources([]);
    setUpdated(new Set());
    setFailed(new Set());
    try {
      const results = await window.electronAPI.updates.check(activeServer.installPath);
      setResources(results);
      const updateCount = results.filter((r) => r.hasUpdate).length;
      if (updateCount > 0) {
        toast.success(`Found ${updateCount} resource${updateCount > 1 ? 's' : ''} with updates`);
      } else {
        toast.success('All resources are up to date!');
      }
    } catch (error: any) {
      toast.error(`Scan failed: ${error.message}`);
    } finally {
      setScanning(false);
    }
  };

  const updateResource = async (resource: ResourceUpdate) => {
    if (!activeServer) return;
    setUpdating((prev) => new Set(prev).add(resource.name));
    try {
      const result = await window.electronAPI.updates.update({
        resourcePath: resource.path,
        repoUrl: resource.repoUrl,
        serverPath: activeServer.installPath,
      });
      if (result.success) {
        setUpdated((prev) => new Set(prev).add(resource.name));
        toast.success(`Updated ${resource.name}`);
      } else {
        setFailed((prev) => new Set(prev).add(resource.name));
        toast.error(`Failed to update ${resource.name}: ${result.error}`);
      }
    } catch (error: any) {
      setFailed((prev) => new Set(prev).add(resource.name));
      toast.error(`Error updating ${resource.name}: ${error.message}`);
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(resource.name);
        return next;
      });
    }
  };

  const updateAll = async () => {
    const toUpdate = resources.filter(
      (r) => r.hasUpdate && !updated.has(r.name) && !updating.has(r.name)
    );
    for (const resource of toUpdate) {
      await updateResource(resource);
    }
  };

  const filtered = resources.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.folder.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'updates' && r.hasUpdate) ||
      (filter === 'current' && !r.hasUpdate);
    return matchesSearch && matchesFilter;
  });

  const updateCount = resources.filter((r) => r.hasUpdate && !updated.has(r.name)).length;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getTimeSince = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center">
                <RefreshCw size={20} className="text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Resource Updater</h1>
                <p className="text-sm text-surface-400">
                  Check for updates and keep your resources current
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {updateCount > 0 && (
              <motion.button
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={updateAll}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-medium text-sm hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                <ArrowUpCircle size={16} />
                Update All ({updateCount})
              </motion.button>
            )}
            <button
              onClick={scanForUpdates}
              disabled={scanning || !activeServer}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-surface-200 font-medium text-sm hover:bg-white/[0.1] hover:border-white/[0.12] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {scanning ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              {scanning ? 'Scanning...' : 'Scan for Updates'}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {resources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-center gap-3"
          >
            <div className="relative flex-1 max-w-sm">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"
              />
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500/40 focus:bg-white/[0.06] transition-all"
              />
            </div>

            <div className="flex items-center bg-white/[0.04] rounded-xl border border-white/[0.06] p-0.5">
              {(['all', 'updates', 'current'] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === mode
                      ? 'bg-white/[0.1] text-white shadow-sm'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  {mode === 'all'
                    ? `All (${resources.length})`
                    : mode === 'updates'
                    ? `Updates (${resources.filter((r) => r.hasUpdate).length})`
                    : `Current (${resources.filter((r) => !r.hasUpdate).length})`}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {!activeServer ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-surface-800/50 flex items-center justify-center mb-4">
              <AlertCircle size={28} className="text-surface-500" />
            </div>
            <h3 className="text-lg font-semibold text-surface-300 mb-2">No Server Selected</h3>
            <p className="text-sm text-surface-500">Select a server from the sidebar to check for updates</p>
          </div>
        ) : resources.length === 0 && !scanning ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/10 flex items-center justify-center mb-5">
              <RefreshCw size={32} className="text-emerald-400/60" />
            </div>
            <h3 className="text-lg font-semibold text-surface-300 mb-2">Check for Updates</h3>
            <p className="text-sm text-surface-500 text-center max-w-md mb-6">
              Scan your installed resources to see if any have been updated on GitHub.
              Resources installed through the Marketplace will be checked automatically.
            </p>
            <button
              onClick={scanForUpdates}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-medium hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Search size={18} />
              Scan for Updates
            </button>
          </div>
        ) : scanning ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
              <Loader2 size={28} className="text-emerald-400 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-surface-300 mb-2">Scanning Resources...</h3>
            <p className="text-sm text-surface-500">
              Checking GitHub for latest versions. This may take a moment.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {filtered.map((resource, index) => {
                const isUpdating = updating.has(resource.name);
                const isUpdated = updated.has(resource.name);
                const isFailed = failed.has(resource.name);

                return (
                  <motion.div
                    key={resource.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`group relative rounded-xl border transition-all ${
                      resource.hasUpdate && !isUpdated
                        ? 'bg-emerald-500/[0.04] border-emerald-500/20 hover:border-emerald-500/30'
                        : isUpdated
                        ? 'bg-emerald-500/[0.06] border-emerald-500/25'
                        : isFailed
                        ? 'bg-red-500/[0.04] border-red-500/20'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'
                    }`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Status Icon */}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isUpdated
                            ? 'bg-emerald-500/15'
                            : isFailed
                            ? 'bg-red-500/15'
                            : resource.hasUpdate
                            ? 'bg-amber-500/15'
                            : 'bg-white/[0.06]'
                        }`}
                      >
                        {isUpdating ? (
                          <Loader2 size={18} className="text-emerald-400 animate-spin" />
                        ) : isUpdated ? (
                          <CheckCircle2 size={18} className="text-emerald-400" />
                        ) : isFailed ? (
                          <XCircle size={18} className="text-red-400" />
                        ) : resource.hasUpdate ? (
                          <ArrowUpCircle size={18} className="text-amber-400" />
                        ) : (
                          <Check size={18} className="text-surface-500" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-surface-100 truncate">
                            {resource.name}
                          </h3>
                          {resource.version && (
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-medium text-surface-400">
                              v{resource.version}
                            </span>
                          )}
                          {resource.folder && (
                            <span className="px-2 py-0.5 rounded-md bg-primary-500/10 text-[10px] font-medium text-primary-400">
                              {resource.folder}
                            </span>
                          )}
                          {resource.hasUpdate && !isUpdated && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-[10px] font-medium text-amber-400">
                              Update Available
                            </span>
                          )}
                          {isUpdated && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-[10px] font-medium text-emerald-400">
                              Updated
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-surface-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            Installed {getTimeSince(resource.installedDate)}
                          </span>
                          {resource.latestCommitDate && (
                            <span className="flex items-center gap-1">
                              <GitBranch size={11} />
                              Latest: {formatDate(resource.latestCommitDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() =>
                            window.electronAPI.openExternal(resource.repoUrl)
                          }
                          className="p-2 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-white/[0.06] transition-all"
                          title="View on GitHub"
                        >
                          <ExternalLink size={15} />
                        </button>

                        {resource.hasUpdate && !isUpdated && (
                          <button
                            onClick={() => updateResource(resource)}
                            disabled={isUpdating}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-600/30 hover:border-emerald-500/30 transition-all disabled:opacity-50"
                          >
                            {isUpdating ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Download size={13} />
                            )}
                            {isUpdating ? 'Updating...' : 'Update'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filtered.length === 0 && resources.length > 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-surface-500">No resources match your filter</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
