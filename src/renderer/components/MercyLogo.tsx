import React from 'react';

// Mercy Launcher brand mark — a stylized purple "M" tile, used everywhere the
// app shows its identity (sidebar, auth gate, splash). One component so the
// mark stays pixel-identical across every surface.
export default function MercyLogo({ size = 32, glow = false }: { size?: number; glow?: boolean }) {
  const gid = React.useId();
  return (
    <div
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-[10px] flex items-center justify-center ${glow ? 'shadow-glow-sm' : ''}`}
    >
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill={`url(#${gid}-bg)`} />
        <path
          d="M10 29V13.5a1.5 1.5 0 0 1 2.7-.9l6.8 9 .5.6.5-.6 6.8-9a1.5 1.5 0 0 1 2.7.9V29"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9d7bff" />
            <stop offset="1" stopColor="#5b3ee0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
