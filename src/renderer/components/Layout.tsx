import React from 'react';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
