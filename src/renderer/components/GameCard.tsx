import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getGameAssets } from './gameAssets';
import { LOGO_STYLES } from './GameArt';

// The one place a Home game card is assembled. Real licensed art (see
// gameAssets.ts for the exact file paths) always wins over the illustrated
// fallback — nothing here needs to change when files are dropped in.
export interface GameCardProps {
  id: string;
  label: string;
  path: string;
  tagline: string;
  Art: React.ComponentType;
}

// Cinematic grading applied to every card — vignette + a faint film-grain
// texture — so real photos and the illustrated fallback both read as
// "graded footage" rather than a flat image, matching a launcher's
// promotional-card look.
function CinematicGrade() {
  const id = React.useId();
  return (
    <>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(0,0,0,0.5) 100%)' }} />
      <svg className="absolute inset-0 w-full h-full pointer-events-none mix-blend-overlay opacity-[0.06]">
        <filter id={`grain-${id}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
      </svg>
    </>
  );
}

export default function GameCard({ id, label, path, tagline, Art }: GameCardProps) {
  const navigate = useNavigate();
  const assets = getGameAssets(id);
  const logo = LOGO_STYLES[id];

  return (
    <button onClick={() => navigate(path)}
      className="group relative h-56 rounded-2xl overflow-hidden border border-overlay-6 hover:border-primary-500/50 transition-all text-left shadow-lg hover:shadow-glow">
      {/* Background — real asset if present (assets/games/{id}/background.*), else the illustrated fallback */}
      <div className="absolute inset-0 transition-all duration-500 group-hover:scale-110 group-hover:brightness-110">
        {assets.background ? <img src={assets.background} alt="" className="w-full h-full object-cover" /> : <Art />}
      </div>

      {/* Optional extra image layer (assets/games/{id}/overlay.*) */}
      {assets.overlay && <img src={assets.overlay} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />}

      <CinematicGrade />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/50 to-transparent" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ring-1 ring-inset ring-primary-500/30 rounded-2xl" />

      <div className="relative h-full flex flex-col justify-end p-4">
        {/* Logo — real asset if present (assets/games/{id}/logo.*), else the designed badge/plaque fallback */}
        <div className="mb-2 h-9 flex items-end">
          {assets.logo ? (
            <img src={assets.logo} alt={label} className="max-h-9 max-w-[75%] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
          ) : (
            <span className={`relative inline-block px-3 py-1.5 rounded-md overflow-hidden ${logo.badgeClass}`} style={{ boxShadow: '0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.25)' }}>
              {/* gloss highlight */}
              <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent pointer-events-none" />
              <span className={`relative inline-block text-base leading-none drop-shadow ${logo.textClass}`}>{label}</span>
            </span>
          )}
        </div>
        <p className="text-xs text-surface-200/90 mb-3 drop-shadow">{tagline}</p>
        <div className="inline-flex items-center gap-1.5 self-start text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white group-hover:bg-primary-500 group-hover:px-3.5 transition-all">
          Open {label} <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  );
}
