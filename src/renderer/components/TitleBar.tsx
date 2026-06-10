import React from 'react';
import { Minus, Square, X, Hexagon } from 'lucide-react';

export default function TitleBar() {
  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  return (
    <div
      className="h-10 bg-surface-950/80 backdrop-blur-xl border-b border-overlay-6 flex items-center justify-between select-none relative z-50"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* App title */}
      <div className="flex items-center gap-2.5 pl-4">
        <div className="relative">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-glow-sm">
            <Hexagon size={11} className="text-white" strokeWidth={2.5} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-surface-100/90 tracking-wide">FIVEM</span>
          <span className="text-xs font-medium text-surface-400 tracking-wide">Server Builder</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 bg-primary-500/10 border border-primary-500/20 rounded text-primary-400 font-medium ml-0.5">
          BETA
        </span>
      </div>

      {/* Window controls */}
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={handleMinimize}
          className="w-12 h-10 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-overlay-6 transition-all duration-150"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-10 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-overlay-6 transition-all duration-150"
        >
          <Square size={11} />
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-10 flex items-center justify-center text-surface-500 hover:text-surface-100 hover:bg-red-600/90 transition-all duration-150"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
