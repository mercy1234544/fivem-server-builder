import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import Layout from './components/Layout';
import SplashScreen from './components/SplashScreen';
import Dashboard from './pages/Dashboard';
import ServerWizard from './pages/ServerWizard';
import ResourceManager from './pages/ResourceManager';
import ResourceOrganizer from './pages/ResourceOrganizer';
import StartupManager from './pages/StartupManager';
import HealthScanner from './pages/HealthScanner';
import BackupManager from './pages/BackupManager';
import FileExplorer from './pages/FileExplorer';
import ServerCfgEditor from './pages/ServerCfgEditor';
import Marketplace from './pages/Marketplace';
import ImportResources from './pages/ImportResources';
import ResourceUpdater from './pages/ResourceUpdater';
import VehiclePackManager from './pages/VehiclePackManager';
import ServerConsole from './pages/ServerConsole';
import Settings from './pages/Settings';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'bg-surface-800 text-surface-100 border border-surface-700',
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
          },
        }}
      />
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      </AnimatePresence>
      {!showSplash && (
        <Layout>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/create" element={<ServerWizard />} />
              <Route path="/resources" element={<ResourceManager />} />
              <Route path="/organizer" element={<ResourceOrganizer />} />
              <Route path="/startup" element={<StartupManager />} />
              <Route path="/health" element={<HealthScanner />} />
              <Route path="/backups" element={<BackupManager />} />
              <Route path="/files" element={<FileExplorer />} />
              <Route path="/editor" element={<ServerCfgEditor />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/import" element={<ImportResources />} />
              <Route path="/updater" element={<ResourceUpdater />} />
              <Route path="/vehicles" element={<VehiclePackManager />} />
              <Route path="/console" element={<ServerConsole />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </AnimatePresence>
        </Layout>
      )}
    </>
  );
}
