import React from 'react';
import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  return (
    <div className="h-9 bg-surface-950 border-b border-surface-800 flex items-center justify-between select-none"
         style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="flex items-center gap-2 pl-4">
        <div className="w-4 h-4 rounded bg-primary-500 flex items-center justify-center">
          <span className="text-[8px] font-bold text-white">F</span>
        </div>
        <span className="text-xs font-medium text-surface-300">FiveM Server Builder</span>
      </div>
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={handleMinimize}
          className="w-11 h-9 flex items-center justify-center hover:bg-surface-800 transition-colors"
        >
          <Minus size={14} className="text-surface-400" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-9 flex items-center justify-center hover:bg-surface-800 transition-colors"
        >
          <Square size={12} className="text-surface-400" />
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-9 flex items-center justify-center hover:bg-red-600 transition-colors"
        >
          <X size={14} className="text-surface-400 hover:text-white" />
        </button>
      </div>
    </div>
  );
}
