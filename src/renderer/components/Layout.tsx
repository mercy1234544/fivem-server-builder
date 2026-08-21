import React from 'react';
import TitleBar from './TitleBar';
import UpdateBanner from './UpdateBanner';
import AppAccessGate from './AppAccessGate';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-950 relative">
      {/* Background gradient mesh — only visible in dark mode */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ opacity: 'var(--mesh-opacity)' }}>
        <div className="absolute -top-[40%] -left-[20%] w-[70%] h-[70%] rounded-full bg-primary-950/30 blur-[120px]" />
        <div className="absolute -bottom-[30%] -right-[20%] w-[60%] h-[60%] rounded-full bg-indigo-950/20 blur-[120px]" />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-purple-950/15 blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <TitleBar />
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto">
          {/* App-wide Discord access gate — protects all routed pages. */}
          <AppAccessGate>{children}</AppAccessGate>
        </main>
      </div>
    </div>
  );
}
