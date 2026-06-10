import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Play, Square, Trash2, ArrowDown, Copy, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '../stores/useAppStore';

interface ParsedLine {
  raw: string;
  source: string;
  message: string;
  type: 'error' | 'warning' | 'success' | 'info' | 'system' | 'normal';
}

function parseLine(raw: string): ParsedLine {
  const trimmed = raw.replace(/\r?\n$/, '');

  // System messages from our app
  if (trimmed.startsWith('>') || trimmed.startsWith('---')) {
    return { raw: trimmed, source: '', message: trimmed, type: 'system' };
  }

  // FXServer bracket format: [           resources] Started resource chat
  const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  let source = '';
  let message = trimmed;

  if (bracketMatch) {
    source = bracketMatch[1].trim();
    message = bracketMatch[2];
  }

  // Determine type
  let type: ParsedLine['type'] = 'normal';

  // Errors
  if (
    trimmed.startsWith('[ERROR]') ||
    message.toLowerCase().includes('error') ||
    message.toLowerCase().includes("couldn't start resource") ||
    message.toLowerCase().includes('could not start') ||
    message.toLowerCase().includes('failed') ||
    message.includes('SCRIPT ERROR') ||
    message.includes('ECONNREFUSED') ||
    message.includes('Unable to establish')
  ) {
    type = 'error';
  }
  // Warnings
  else if (
    message.toLowerCase().includes('warning') ||
    message.toLowerCase().includes('warn') ||
    message.includes('is currently busy') ||
    message.includes('should start before') ||
    message.includes('not loaded') ||
    message.includes('no compatible framework')
  ) {
    type = 'warning';
  }
  // Success
  else if (
    message.includes('Started resource') ||
    message.includes('license key authentication succeeded') ||
    message.includes('Authenticated with') ||
    message.includes('All Ready')
  ) {
    type = 'success';
  }
  // Info / system
  else if (
    message.includes('Scanning resources') ||
    message.includes('Found') ||
    message.includes('FXServer Starting') ||
    message.includes('Running build tasks') ||
    source === 'yarn'
  ) {
    type = 'info';
  }

  return { raw: trimmed, source, message, type };
}

const typeStyles: Record<ParsedLine['type'], string> = {
  error: 'text-red-400',
  warning: 'text-amber-400',
  success: 'text-emerald-400',
  info: 'text-blue-300/70',
  system: 'text-primary-400 font-semibold',
  normal: 'text-surface-300',
};

const sourceStyles: Record<string, string> = {
  error: 'text-red-500/60',
  warning: 'text-amber-500/60',
  success: 'text-emerald-500/60',
  info: 'text-blue-400/50',
  system: 'text-primary-500/60',
  normal: 'text-surface-600',
};

type FilterType = 'all' | 'errors' | 'warnings' | 'resources';

export default function ServerConsole() {
  const activeServer = useAppStore(state => state.getActiveServer());
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [serverStatus, setServerStatus] = useState<string>('stopped');
  const [filter, setFilter] = useState<FilterType>('all');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.electronAPI || !activeServer) return;

    window.electronAPI.server.get(activeServer.id).then((s: any) => {
      if (s) setServerStatus(s.status);
    });

    const cleanupConsole = window.electronAPI.onServerConsole((data: { serverId: string; line: string }) => {
      if (data.serverId === activeServer.id) {
        // Split multi-line chunks into individual lines
        const rawLines = data.line.split('\n').filter(l => l.trim());
        const parsed = rawLines.map(parseLine);
        setLines(prev => {
          const next = [...prev, ...parsed];
          if (next.length > 5000) return next.slice(-4000);
          return next;
        });
      }
    });

    const cleanupStatus = window.electronAPI.onServerStatusChange((data: { serverId: string; status: string }) => {
      if (data.serverId === activeServer.id) {
        setServerStatus(data.status);
        if (data.status === 'running') {
          setLines(prev => [...prev, parseLine('--- Server Started ---')]);
        } else if (data.status === 'stopped') {
          setLines(prev => [...prev, parseLine('--- Server Stopped ---')]);
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
    setLines(prev => [...prev, parseLine('> Starting server...')]);
    const result = await window.electronAPI.server.start(activeServer.id);
    if (!result.success) {
      setLines(prev => [...prev, parseLine(`> ERROR: ${result.error}`)]);
      toast.error(result.error || 'Failed to start');
    }
  };

  const handleStop = async () => {
    if (!activeServer) return;
    setLines(prev => [...prev, parseLine('> Stopping server...')]);
    await window.electronAPI.server.stop(activeServer.id);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(lines.map(l => l.raw).join('\n'));
    toast.success('Console output copied');
  };

  const filteredLines = lines.filter(line => {
    if (filter === 'all') return true;
    if (filter === 'errors') return line.type === 'error';
    if (filter === 'warnings') return line.type === 'error' || line.type === 'warning';
    if (filter === 'resources') return line.message.includes('Started resource') || line.message.includes("Couldn't start") || line.message.includes('Could not start');
    return true;
  });

  const errorCount = lines.filter(l => l.type === 'error').length;
  const warnCount = lines.filter(l => l.type === 'warning').length;

  if (!activeServer) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full text-center py-20"
      >
        <Terminal size={48} className="text-surface-600 mb-4" />
        <h2 className="text-xl font-semibold text-surface-100 mb-2">No Server Selected</h2>
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
            <h1 className="text-lg font-bold text-surface-100">Server Console</h1>
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

      {/* Filter bar + stats */}
      {lines.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-surface-500" />
            {(['all', 'errors', 'warnings', 'resources'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${
                  filter === f
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-overlay-4'
                }`}
              >
                {f === 'all' ? 'All' : f === 'errors' ? 'Errors' : f === 'warnings' ? 'Errors & Warnings' : 'Resources'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            {errorCount > 0 && (
              <span className="text-red-400">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
            )}
            {warnCount > 0 && (
              <span className="text-amber-400">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>
            )}
            <span className="text-surface-500">{lines.length} lines</span>
          </div>
        </div>
      )}

      {/* Console */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-[#0d1117] rounded-xl border border-surface-700/50 p-4 overflow-y-auto font-mono text-[11px] leading-[1.6] min-h-0"
      >
        {lines.length === 0 ? (
          <div className="text-surface-600 text-center py-12">
            {serverStatus === 'running'
              ? 'Waiting for output...'
              : 'Start the server to see console output'}
          </div>
        ) : (
          filteredLines.map((line, i) => (
            <div key={i} className="flex gap-0 hover:bg-white/[0.02] -mx-2 px-2 rounded">
              {line.source ? (
                <>
                  <span className={`shrink-0 w-[180px] truncate text-right pr-3 select-none ${sourceStyles[line.type]}`}>
                    {line.source}
                  </span>
                  <span className="shrink-0 text-surface-700 select-none mr-2">|</span>
                  <span className={`${typeStyles[line.type]} break-words min-w-0`}>{line.message}</span>
                </>
              ) : (
                <span className={`${typeStyles[line.type]} break-words min-w-0`}>{line.message}</span>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}
