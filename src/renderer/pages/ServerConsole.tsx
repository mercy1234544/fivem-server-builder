import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Play, Square, Trash2, ArrowDown, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '../stores/useAppStore';

export default function ServerConsole() {
  const { activeServer } = useAppStore();
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [serverStatus, setServerStatus] = useState<string>('stopped');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.electronAPI || !activeServer) return;

    // Get initial status
    window.electronAPI.server.get(activeServer.id).then((s: any) => {
      if (s) setServerStatus(s.status);
    });

    const cleanupConsole = window.electronAPI.onServerConsole((data: { serverId: string; line: string }) => {
      if (data.serverId === activeServer.id) {
        setLines(prev => {
          const next = [...prev, data.line];
          if (next.length > 5000) return next.slice(-4000);
          return next;
        });
      }
    });

    const cleanupStatus = window.electronAPI.onServerStatusChange((data: { serverId: string; status: string }) => {
      if (data.serverId === activeServer.id) {
        setServerStatus(data.status);
        if (data.status === 'running') {
          setLines(prev => [...prev, '\n--- Server Started ---\n']);
        } else if (data.status === 'stopped') {
          setLines(prev => [...prev, '\n--- Server Stopped ---\n']);
        }
      }
    });

    return () => {
      cleanupConsole();
      cleanupStatus();
    };
  }, [activeServer?.id]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const handleStart = async () => {
    if (!activeServer) return;
    setLines(prev => [...prev, '> Starting server...\n']);
    const result = await window.electronAPI.server.start(activeServer.id);
    if (!result.success) {
      setLines(prev => [...prev, `> ERROR: ${result.error}\n`]);
      toast.error(result.error || 'Failed to start');
    }
  };

  const handleStop = async () => {
    if (!activeServer) return;
    setLines(prev => [...prev, '> Stopping server...\n']);
    await window.electronAPI.server.stop(activeServer.id);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Console output copied');
  };

  const colorLine = (line: string) => {
    if (line.startsWith('[ERROR]') || line.includes('error') || line.includes('Error')) {
      return 'text-red-400';
    }
    if (line.includes('warn') || line.includes('Warning') || line.includes('WARN')) {
      return 'text-yellow-400';
    }
    if (line.startsWith('>') || line.startsWith('---')) {
      return 'text-primary-400 font-semibold';
    }
    if (line.includes('Started resource') || line.includes('ensure')) {
      return 'text-green-400';
    }
    return 'text-surface-300';
  };

  if (!activeServer) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full text-center py-20"
      >
        <Terminal size={48} className="text-surface-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Server Selected</h2>
        <p className="text-surface-400 text-sm">Select a server from the Dashboard to view its console</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal size={20} className="text-primary-400" />
          <div>
            <h1 className="text-lg font-bold text-white">Server Console</h1>
            <p className="text-xs text-surface-400">{activeServer.name}</p>
          </div>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            serverStatus === 'running'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : serverStatus === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-surface-700 text-surface-400 border border-surface-600'
          }`}>
            {serverStatus}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {serverStatus !== 'running' ? (
            <button onClick={handleStart} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
              <Play size={14} /> Start
            </button>
          ) : (
            <button onClick={handleStop} className="flex items-center gap-1.5 text-sm py-1.5 px-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors">
              <Square size={14} /> Stop
            </button>
          )}
          <button onClick={handleCopy} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3" title="Copy log">
            <Copy size={14} />
          </button>
          <button onClick={() => setLines([])} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3" title="Clear console">
            <Trash2 size={14} />
          </button>
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
              className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3 text-primary-400"
              title="Scroll to bottom"
            >
              <ArrowDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Console */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-[#0d1117] rounded-xl border border-surface-700/50 p-4 overflow-y-auto font-mono text-xs leading-5 min-h-0"
      >
        {lines.length === 0 ? (
          <div className="text-surface-600 text-center py-12">
            {serverStatus === 'running'
              ? 'Waiting for output...'
              : 'Start the server to see console output'}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${colorLine(line)}`}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}
