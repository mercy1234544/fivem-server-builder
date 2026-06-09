import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, RefreshCw, CheckCircle2, Loader2, ArrowUpCircle } from 'lucide-react';

type UpdateStatus = 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error' | null;

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>(null);
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.appUpdater) return;

    const cleanup = window.electronAPI.appUpdater.onStatus((data) => {
      setStatus(data.status);
      if (data.version) setVersion(data.version);
      if (data.percent) setPercent(data.percent);
      if (data.status === 'available') setDismissed(false);
    });

    return cleanup;
  }, []);

  const handleDownload = async () => {
    setStatus('downloading');
    await window.electronAPI.appUpdater.download();
  };

  const handleInstall = () => {
    window.electronAPI.appUpdater.install();
  };

  if (dismissed || !status || status === 'current' || status === 'checking' || status === 'error') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
          status === 'ready'
            ? 'bg-emerald-500/10 border-b border-emerald-500/20'
            : 'bg-primary-500/10 border-b border-primary-500/20'
        }`}>
          {status === 'available' && (
            <>
              <ArrowUpCircle size={16} className="text-primary-400 shrink-0" />
              <span className="text-primary-200 flex-1">
                Update <strong>v{version}</strong> is available!
              </span>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary-500/20 text-primary-300 text-xs font-medium hover:bg-primary-500/30 transition-all"
              >
                <Download size={12} />
                Download
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-white/[0.06] transition-all"
              >
                <X size={14} />
              </button>
            </>
          )}

          {status === 'downloading' && (
            <>
              <Loader2 size={16} className="text-primary-400 shrink-0 animate-spin" />
              <span className="text-primary-200 flex-1">
                Downloading update... {percent}%
              </span>
              <div className="w-32 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary-400"
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </>
          )}

          {status === 'ready' && (
            <>
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span className="text-emerald-200 flex-1">
                Update ready! Restart to apply <strong>v{version}</strong>
              </span>
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 transition-all"
              >
                <RefreshCw size={12} />
                Restart Now
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-white/[0.06] transition-all"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
