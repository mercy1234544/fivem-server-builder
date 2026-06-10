import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  FolderOpen,
  File,
  Folder,
  ArrowLeft,
  RefreshCw,
  Search,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  extension: string;
}

export default function FileExplorer() {
  const { activeServerId, servers } = useAppStore();
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const activeServer = servers.find(s => s.id === activeServerId);

  useEffect(() => {
    if (activeServer) {
      setCurrentPath(activeServer.installPath);
    }
  }, [activeServerId]);

  useEffect(() => {
    if (currentPath) loadDirectory();
  }, [currentPath]);

  const loadDirectory = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.file.readDir(currentPath);
      setEntries(result);
    } catch {
      toast.error('Failed to read directory');
    } finally {
      setLoading(false);
    }
  };

  const navigate = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      setCurrentPath(entry.path);
    }
  };

  const goUp = () => {
    const parent = currentPath.replace(/[\\/][^\\/]+$/, '');
    if (parent) setCurrentPath(parent);
  };

  const createFolder = async () => {
    const name = window.prompt('Folder name:');
    if (!name || !window.electronAPI) return;
    try {
      await window.electronAPI.file.createDir(`${currentPath}\\${name}`);
      loadDirectory();
      toast.success('Folder created');
    } catch {
      toast.error('Failed to create folder');
    }
  };

  const deleteEntry = async (entry: FileEntry) => {
    if (!window.electronAPI) return;
    const confirmed = window.confirm(`Delete "${entry.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await window.electronAPI.file.delete(entry.path);
      loadDirectory();
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filtered = entries.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!activeServer) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full">
        <FolderOpen size={48} className="text-surface-600 mb-4" />
        <p className="text-surface-400">Select a server to browse files</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-surface-100">File Explorer</h1>
        <div className="flex gap-2">
          <button onClick={createFolder} className="btn-secondary flex items-center gap-2">
            <Plus size={16} />
            New Folder
          </button>
          <button onClick={loadDirectory} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Path Bar */}
      <div className="flex items-center gap-2">
        <button onClick={goUp} className="p-2 rounded-lg hover:bg-surface-700 transition-colors">
          <ArrowLeft size={16} className="text-surface-300" />
        </button>
        <div className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-surface-300 font-mono truncate">
          {currentPath}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          className="input-field pl-9"
          placeholder="Filter files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* File List */}
      <div className="space-y-0.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {filtered.map((entry) => (
          <div
            key={entry.path}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-800/50 cursor-pointer group transition-colors"
            onDoubleClick={() => navigate(entry)}
          >
            {entry.type === 'directory' ? (
              <Folder size={18} className="text-amber-400 shrink-0" />
            ) : (
              <File size={18} className="text-surface-400 shrink-0" />
            )}
            <span className="flex-1 text-sm text-surface-200 truncate">{entry.name}</span>
            <span className="text-xs text-surface-500">
              {entry.type === 'file' ? formatSize(entry.size) : ''}
            </span>
            <span className="text-xs text-surface-500">
              {new Date(entry.modified).toLocaleDateString()}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteEntry(entry); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-all"
            >
              <Trash2 size={14} className="text-red-400" />
            </button>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="text-center py-8 text-surface-400">
            {search ? 'No matching files' : 'Empty directory'}
          </div>
        )}
      </div>
    </motion.div>
  );
}
