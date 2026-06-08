import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Server,
  Monitor,
  Database,
  Download,
  FolderOpen,
  Loader2,
  Zap,
  Shield,
  Globe,
  Box,
  Package,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

const STEPS = [
  { title: 'Framework', description: 'Choose your server framework' },
  { title: 'Operating System', description: 'Select target OS' },
  { title: 'Database', description: 'Choose database engine' },
  { title: 'Artifacts', description: 'Select artifact version' },
  { title: 'Details', description: 'Name and install location' },
  { title: 'Build', description: 'Create your server' },
];

const FRAMEWORKS = [
  { id: 'esx', name: 'ESX Legacy', description: 'Full server: framework, jobs (police/EMS/mechanic), inventory, housing, vehicles, voice, HUD & more — 17+ resources', icon: Globe, color: 'from-blue-600 to-blue-800', border: 'border-blue-500/30' },
  { id: 'qbcore', name: 'QBCore', description: 'Full server: framework, 30+ resources — phone, inventory, jobs, banking, vehicles, housing, gangs, HUD & more', icon: Zap, color: 'from-purple-600 to-purple-800', border: 'border-purple-500/30' },
  { id: 'custom', name: 'Custom Framework', description: 'Core libs + voice + utilities installed. Pick your own framework and resources from the Marketplace', icon: Box, color: 'from-amber-600 to-amber-800', border: 'border-amber-500/30' },
  { id: 'blank', name: 'Blank Server', description: 'Start with a clean slate — no framework, just default FiveM resources. Full control.', icon: Server, color: 'from-surface-600 to-surface-800', border: 'border-surface-500/30' },
];

export default function ServerWizard() {
  const navigate = useNavigate();
  const { addServer, logAction } = useAppStore();
  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildStep, setBuildStep] = useState('');
  const [buildComplete, setBuildComplete] = useState(false);

  const [config, setConfig] = useState({
    name: '',
    framework: '',
    os: 'windows' as 'windows' | 'linux',
    database: 'mariadb' as 'mariadb' | 'mysql',
    artifactVersion: 'recommended',
    installPath: '',
  });

  const canProceed = () => {
    switch (step) {
      case 0: return !!config.framework;
      case 1: return !!config.os;
      case 2: return !!config.database;
      case 3: return !!config.artifactVersion;
      case 4: return !!config.installPath && !!config.name;
      default: return true;
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleBuild = async () => {
    setBuilding(true);
    setBuildProgress(0);
    setBuildStep('Preparing build...');

    // Listen for real-time progress from the Electron backend
    let progressCleanup: (() => void) | null = null;
    if (window.electronAPI?.onBuildProgress) {
      progressCleanup = window.electronAPI.onBuildProgress((data: { current: number; total: number; resource: string; message: string }) => {
        const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
        setBuildProgress(pct);
        setBuildStep(data.message);
      });
    }

    try {
      let server;
      if (window.electronAPI) {
        // Real Electron build — backend clones all resources and sends progress events
        setBuildStep('Creating directory structure...');
        setBuildProgress(5);
        server = await window.electronAPI.server.create(config);
      } else {
        // Demo mode — simulate the build with fake progress
        const resourceCounts: Record<string, number> = { esx: 19, qbcore: 35, custom: 9, blank: 0 };
        const total = resourceCounts[config.framework] || 0;
        const demoNames = config.framework === 'qbcore'
          ? ['oxmysql', 'ox_lib', 'qb-core', 'qb-multicharacter', 'qb-spawn', 'qb-clothing', 'qb-policejob', 'qb-ambulancejob', 'qb-inventory', 'qb-hud', 'qb-target', 'qb-phone', 'qb-banking', 'qb-vehicleshop', 'qb-garages', 'qb-houses', 'pma-voice', 'ox_target', 'ox_inventory', 'dpemotes']
          : config.framework === 'esx'
          ? ['oxmysql', 'ox_lib', 'es_extended', 'esx_multicharacter', 'esx_identity', 'esx_skin', 'esx_policejob', 'esx_ambulancejob', 'esx_mechanicjob', 'esx_vehicleshop', 'pma-voice', 'ox_target', 'ox_inventory', 'dpemotes']
          : ['oxmysql', 'ox_lib', 'pma-voice', 'ox_target', 'ox_inventory', 'dpemotes'];

        for (let i = 0; i < demoNames.length; i++) {
          setBuildStep(`Cloning ${demoNames[i]} (${i + 1}/${demoNames.length})...`);
          setBuildProgress(Math.round(((i + 1) / demoNames.length) * 100));
          await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
        }

        server = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
          ...config,
          resourceCount: total,
          status: 'stopped' as const,
          lastBackup: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      addServer(server);
      logAction('Server Created', `${config.name} (${config.framework}) — fully built with resources`, 'success');
      setBuildComplete(true);
      toast.success('Server created successfully!');
    } catch (error: any) {
      toast.error(`Build failed: ${error.message}`);
      logAction('Build Failed', error.message, 'error');
    } finally {
      setBuilding(false);
      if (progressCleanup) progressCleanup();
    }
  };

  const selectDirectory = async () => {
    if (window.electronAPI) {
      const dir = await window.electronAPI.openDirectory();
      if (dir) setConfig({ ...config, installPath: dir });
    } else {
      const name = config.name || 'my-server';
      setConfig({ ...config, installPath: `C:\\FiveM\\servers\\${name.toLowerCase().replace(/\s+/g, '-')}` });
    }
  };

  if (buildComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto text-center py-16"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center mx-auto mb-6"
        >
          <Check size={36} className="text-green-400" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white mb-2">Server Created!</h2>
        <p className="text-surface-400 mb-8">
          {config.name} is ready. Head to the dashboard to manage your server.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/')} className="btn-primary flex items-center gap-2">
            Go to Dashboard
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => { setBuildComplete(false); setStep(0); setConfig({ name: '', framework: '', os: 'windows', database: 'mariadb', artifactVersion: 'recommended', installPath: '' }); }}
            className="btn-secondary"
          >
            Create Another
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Create New Server</h1>
        <p className="text-sm text-surface-400 mt-1">Follow the wizard to set up your FiveM server</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                i < step ? 'bg-primary-600 border-primary-600 text-white' :
                i === step ? 'border-primary-500 text-primary-400' :
                'border-surface-600 text-surface-500'
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className="text-xs font-medium hidden md:inline text-surface-400">{s.title}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 rounded transition-all duration-300 ${i < step ? 'bg-primary-600' : 'bg-surface-700'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <div className="glass-panel p-6 min-h-[340px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Choose Framework</h2>
                <p className="text-sm text-surface-400">Select the base framework for your server</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {FRAMEWORKS.map((fw) => {
                    const Icon = fw.icon;
                    return (
                      <motion.button
                        key={fw.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setConfig({ ...config, framework: fw.id })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          config.framework === fw.id
                            ? `border-primary-500 bg-primary-500/10`
                            : `${fw.border} hover:border-surface-500 bg-surface-800/30`
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${fw.color} flex items-center justify-center mb-3`}>
                          <Icon size={18} className="text-white" />
                        </div>
                        <h3 className="font-semibold text-white">{fw.name}</h3>
                        <p className="text-xs text-surface-400 mt-1">{fw.description}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Operating System</h2>
                <p className="text-sm text-surface-400">Select the OS your server will run on</p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {[
                    { id: 'windows', name: 'Windows', icon: Monitor, desc: 'Windows Server / Desktop' },
                    { id: 'linux', name: 'Linux', icon: Server, desc: 'Ubuntu / Debian / CentOS' },
                  ].map((os) => (
                    <motion.button
                      key={os.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setConfig({ ...config, os: os.id as any })}
                      className={`p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${
                        config.os === os.id
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-surface-700 hover:border-surface-500'
                      }`}
                    >
                      <os.icon size={36} className={config.os === os.id ? 'text-primary-400' : 'text-surface-400'} />
                      <span className="font-semibold text-white">{os.name}</span>
                      <span className="text-xs text-surface-400">{os.desc}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Database Engine</h2>
                <p className="text-sm text-surface-400">Choose your database server</p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {[
                    { id: 'mariadb', name: 'MariaDB', desc: 'Recommended — fast and compatible', tag: 'Recommended' },
                    { id: 'mysql', name: 'MySQL', desc: 'Traditional and widely supported', tag: null },
                  ].map((db) => (
                    <motion.button
                      key={db.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setConfig({ ...config, database: db.id as any })}
                      className={`p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all relative ${
                        config.database === db.id
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-surface-700 hover:border-surface-500'
                      }`}
                    >
                      {db.tag && (
                        <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                          {db.tag}
                        </span>
                      )}
                      <Database size={36} className={config.database === db.id ? 'text-primary-400' : 'text-surface-400'} />
                      <span className="font-semibold text-white">{db.name}</span>
                      <span className="text-xs text-surface-400 text-center">{db.desc}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Artifact Version</h2>
                <p className="text-sm text-surface-400">Select the FiveM server artifact build</p>
                <div className="space-y-3 mt-4">
                  {[
                    { id: 'recommended', name: 'Latest Recommended', desc: 'Stable version recommended for production servers', icon: Shield, color: 'text-green-400' },
                    { id: 'experimental', name: 'Latest Experimental', desc: 'Newest features, may be unstable — for testing only', icon: Zap, color: 'text-amber-400' },
                    { id: 'custom', name: 'Custom Version', desc: 'Specify a custom artifact build number', icon: Download, color: 'text-blue-400' },
                  ].map((v) => (
                    <motion.button
                      key={v.id}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => setConfig({ ...config, artifactVersion: v.id })}
                      className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-4 transition-all ${
                        config.artifactVersion === v.id
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-surface-700 hover:border-surface-500'
                      }`}
                    >
                      <v.icon size={22} className={v.color} />
                      <div>
                        <span className="font-semibold text-white">{v.name}</span>
                        <p className="text-xs text-surface-400 mt-0.5">{v.desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold">Server Details</h2>
                <p className="text-sm text-surface-400">Give your server a name and choose where to install it</p>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1.5">Server Name</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. My RP Server"
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1.5">Installation Directory</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input-field font-mono text-sm"
                        placeholder="Click Browse to select..."
                        value={config.installPath}
                        onChange={(e) => setConfig({ ...config, installPath: e.target.value })}
                      />
                      <button onClick={selectDirectory} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
                        <FolderOpen size={16} />
                        Browse
                      </button>
                    </div>
                    <p className="text-xs text-surface-500 mt-1.5">This is where your server files will be stored</p>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold">Build Summary</h2>
                <div className="space-y-2.5">
                  <SummaryRow label="Server Name" value={config.name || 'Unnamed'} />
                  <SummaryRow label="Framework" value={FRAMEWORKS.find(f => f.id === config.framework)?.name || config.framework} />
                  <SummaryRow label="Operating System" value={config.os === 'windows' ? 'Windows' : 'Linux'} />
                  <SummaryRow label="Database" value={config.database === 'mariadb' ? 'MariaDB' : 'MySQL'} />
                  <SummaryRow label="Artifacts" value={config.artifactVersion === 'recommended' ? 'Latest Recommended' : config.artifactVersion === 'experimental' ? 'Latest Experimental' : 'Custom'} />
                  <SummaryRow label="Install Path" value={config.installPath || 'Not set'} mono />
                </div>

                {building && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3 pt-2"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-300">{buildStep}</span>
                      <span className="text-primary-400 font-medium">{Math.round(buildProgress)}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-surface-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${buildProgress}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      />
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav Buttons */}
      <div className="flex justify-between">
        <button
          onClick={step === 0 ? () => navigate('/') : handleBack}
          disabled={building}
          className="btn-secondary flex items-center gap-2 disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleBuild}
            disabled={building || !canProceed()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {building ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {building ? 'Building...' : 'Build Server'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-surface-800/50">
      <span className="text-sm text-surface-400">{label}</span>
      <span className={`text-sm font-medium text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
