import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    // Phase timing: enter animation -> hold -> exit animation -> done
    const holdTimer = setTimeout(() => setPhase('hold'), 600);
    const exitTimer = setTimeout(() => setPhase('exit'), 2400);
    const doneTimer = setTimeout(() => onComplete(), 3200);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'exit' ? null : null}
      <motion.div
        key="splash"
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === 'exit' ? 0 : 1 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
        style={{ background: '#0a0a12' }}
      >
        {/* Animated background gradients */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.4, scale: 1.2 }}
          transition={{ duration: 2, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          {/* Primary glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 40%, transparent 70%)',
            }}
          />
          {/* Secondary glow */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]"
          >
            <div
              className="absolute top-0 left-1/4 w-[300px] h-[300px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute bottom-0 right-1/4 w-[250px] h-[250px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(34, 211, 238, 0.08) 0%, transparent 70%)',
              }}
            />
          </motion.div>
        </motion.div>

        {/* Grid lines */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.03 }}
          transition={{ duration: 1.5, delay: 0.3 }}
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Center content */}
        <div className="relative flex flex-col items-center">
          {/* Hexagon logo */}
          <motion.div
            initial={{ scale: 0, rotate: -180, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 }}
            className="relative mb-8"
          >
            {/* Outer glow ring */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.15, 1], opacity: [0, 0.6, 0.3] }}
              transition={{ duration: 1.2, delay: 0.4 }}
              className="absolute inset-[-20px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
              }}
            />

            {/* Hexagon */}
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-full h-full">
                <defs>
                  <linearGradient id="splash-hex-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4f46e5" />
                  </linearGradient>
                  <filter id="splash-glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <motion.polygon
                  points="40,4 74,22 74,58 40,76 6,58 6,22"
                  fill="url(#splash-hex-grad)"
                  stroke="rgba(129, 140, 248, 0.5)"
                  strokeWidth="1.5"
                  filter="url(#splash-glow)"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                />
                {/* Server icon inside */}
                <motion.g
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                >
                  <rect x="28" y="26" width="24" height="6" rx="1.5" fill="white" opacity="0.9" />
                  <circle cx="34" cy="29" r="1.2" fill="#6366f1" />
                  <rect x="28" y="35" width="24" height="6" rx="1.5" fill="white" opacity="0.7" />
                  <circle cx="34" cy="38" r="1.2" fill="#6366f1" />
                  <rect x="28" y="44" width="24" height="6" rx="1.5" fill="white" opacity="0.5" />
                  <circle cx="34" cy="47" r="1.2" fill="#6366f1" />
                </motion.g>
              </svg>
            </div>
          </motion.div>

          {/* Title */}
          <div className="relative">
            {/* FIVEM */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center justify-center gap-1"
            >
              {'FIVEM'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 + i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                  className="text-4xl font-black tracking-wider"
                  style={{
                    background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 30%, #818cf8 70%, #6366f1 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: 'none',
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.div>

            {/* Server Builder */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7, ease: [0.4, 0, 0.2, 1] }}
              className="text-center text-sm font-medium tracking-[0.35em] uppercase mt-2"
              style={{ color: 'rgba(148, 163, 184, 0.8)' }}
            >
              Server Builder
            </motion.p>

            {/* Underline accent */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.9, ease: [0.4, 0, 0.2, 1] }}
              className="mx-auto mt-4 h-px w-32 origin-center"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.5), transparent)',
              }}
            />
          </div>

          {/* Version badge */}
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 1.1 }}
            className="mt-5 px-3 py-1 rounded-full border"
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              borderColor: 'rgba(99, 102, 241, 0.15)',
            }}
          >
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(129, 140, 248, 0.7)' }}>
              Beta v1.0
            </span>
          </motion.div>

          {/* Loading dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
            className="flex items-center gap-1.5 mt-8"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: 'easeInOut',
                }}
                className="w-1.5 h-1.5 rounded-full bg-indigo-400"
              />
            ))}
          </motion.div>
        </div>

        {/* Corner accents */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute top-8 left-8"
        >
          <div className="w-12 h-px bg-gradient-to-r from-indigo-500 to-transparent" />
          <div className="w-px h-12 bg-gradient-to-b from-indigo-500 to-transparent" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute bottom-8 right-8"
        >
          <div className="w-12 h-px bg-gradient-to-l from-indigo-500 to-transparent ml-auto" />
          <div className="w-px h-12 bg-gradient-to-t from-indigo-500 to-transparent ml-auto" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
