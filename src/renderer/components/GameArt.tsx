import React from 'react';

// Hero-card art + logo treatment for the Home game cards.
//
// IMPORTANT — why these are custom illustrations, not real game art: bundling
// actual FiveM/Minecraft/Assetto Corsa/BeamNG.drive screenshots or official
// trademarked logos into a redistributed installer requires a license Mercy
// Launcher does not have; doing so is a real trademark/copyright risk for the
// shipped product. These are built as detailed, cinematic "in the style of"
// scenes with a designed logotype treatment (badge/plaque + styled type), not
// a redrawn copy of any official asset. To drop in real licensed key art
// later, replace the <Art/> node for that game below with
// `<img src={realArt} className="w-full h-full object-cover" />` — the card
// component (Home.tsx) doesn't need to change.
export function FiveMArt() {
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
      <defs>
        <radialGradient id="fivem-moon-glow" cx="80%" cy="26%" r="42%">
          <stop offset="0%" stopColor="#ffb37a" stopOpacity="0.95" /><stop offset="100%" stopColor="#ffb37a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fivem-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#150a26" /><stop offset="40%" stopColor="#3d1a45" /><stop offset="75%" stopColor="#9c3f63" /><stop offset="100%" stopColor="#e2803f" />
        </linearGradient>
        <linearGradient id="fivem-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1030" /><stop offset="100%" stopColor="#0a0610" />
        </linearGradient>
        <filter id="fivem-blur"><feGaussianBlur stdDeviation="1.4" /></filter>
      </defs>
      <rect width="400" height="240" fill="url(#fivem-sky)" />
      <rect width="400" height="240" fill="url(#fivem-moon-glow)" />
      {/* stars */}
      <g fill="#ffffff" opacity="0.5">
        {[[18,20],[46,12],[80,26],[130,10],[160,30],[20,45],[60,55]].map(([x,y],i)=>(<circle key={i} cx={x} cy={y} r="1" />))}
      </g>
      <circle cx="316" cy="58" r="26" fill="#fff1d8" />
      {/* far skyline */}
      <g fill="#20112a" opacity="0.85">
        <rect x="0" y="118" width="24" height="82" /><rect x="26" y="100" width="18" height="100" /><rect x="46" y="130" width="16" height="70" />
        <rect x="190" y="112" width="20" height="88" /><rect x="212" y="94" width="16" height="106" /><rect x="230" y="124" width="22" height="76" />
      </g>
      {/* near skyline, lit windows */}
      <g fill="#120a1a">
        <rect x="64" y="88" width="32" height="112" /><rect x="100" y="64" width="24" height="136" /><rect x="128" y="104" width="28" height="96" />
        <rect x="256" y="82" width="28" height="118" /><rect x="288" y="52" width="26" height="148" /><rect x="318" y="98" width="30" height="102" /><rect x="352" y="120" width="22" height="80" />
      </g>
      <g fill="#ffcf7a" opacity="0.9">
        <rect x="70" y="98" width="4" height="6" /><rect x="80" y="112" width="4" height="6" /><rect x="88" y="132" width="4" height="6" />
        <rect x="106" y="78" width="4" height="6" /><rect x="106" y="98" width="4" height="6" /><rect x="114" y="122" width="4" height="6" /><rect x="106" y="146" width="4" height="6" />
        <rect x="136" y="118" width="4" height="6" /><rect x="144" y="140" width="4" height="6" />
        <rect x="262" y="98" width="4" height="6" /><rect x="272" y="112" width="4" height="6" /><rect x="296" y="70" width="4" height="6" />
        <rect x="296" y="92" width="4" height="6" /><rect x="296" y="114" width="4" height="6" /><rect x="326" y="112" width="4" height="6" /><rect x="336" y="134" width="4" height="6" />
      </g>
      {/* palm trees */}
      <g fill="#0d0714">
        <rect x="16" y="150" width="3" height="34" />
        <path d="M17 152 Q 4 144 -2 152 M17 152 Q 30 142 36 150 M17 152 Q 8 158 0 166 M17 152 Q 26 160 32 168" stroke="#0d0714" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="374" y="146" width="3" height="38" />
        <path d="M375 148 Q 362 140 355 148 M375 148 Q 388 138 395 146 M375 148 Q 366 154 358 162" stroke="#0d0714" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      {/* road */}
      <path d="M0 240 L140 192 L260 192 L400 240 Z" fill="url(#fivem-road)" />
      <line x1="200" y1="240" x2="200" y2="195" stroke="#ffd9a8" strokeWidth="2" strokeDasharray="8 8" opacity="0.55" />
      {/* wet-road reflection of the skyline, mirrored + blurred */}
      <g opacity="0.22" filter="url(#fivem-blur)" transform="translate(0,388) scale(1,-1)">
        <rect x="64" y="88" width="32" height="60" fill="#120a1a" /><rect x="100" y="64" width="24" height="60" fill="#120a1a" /><rect x="256" y="82" width="28" height="60" fill="#120a1a" /><rect x="288" y="52" width="26" height="60" fill="#120a1a" />
        <circle cx="316" cy="58" r="20" fill="#fff1d8" />
      </g>
      {/* a car, headlamp cone + taillight streak */}
      <g transform="translate(150,206)">
        <path d="M0 12 h58 l-6 -10 h-16 l-5 -6 h-16 l-5 6 h-10 z" fill="#0c0611" />
        <circle cx="10" cy="14" r="4" fill="#0c0611" /><circle cx="48" cy="14" r="4" fill="#0c0611" />
        <rect x="52" y="4" width="4" height="3" fill="#ffe6b3" /><rect x="0" y="4" width="4" height="3" fill="#ff5c5c" />
      </g>
      <path d="M204 214 L232 200 L232 206 L208 218 Z" fill="#ffe6b3" opacity="0.35" />
      <rect x="96" y="216" width="46" height="2.5" rx="1.2" fill="#ff5c5c" opacity="0.55" />
    </svg>
  );
}

export function MinecraftArt() {
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
      <defs>
        <linearGradient id="mc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f7ab0" /><stop offset="55%" stopColor="#6fae7a" /><stop offset="100%" stopColor="#bfe08c" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#mc-sky)" />
      <g fill="#fff3b0"><rect x="284" y="26" width="10" height="10" /><rect x="294" y="26" width="10" height="10" /><rect x="284" y="36" width="10" height="10" /><rect x="294" y="36" width="10" height="10" /></g>
      <g fill="#ffffff" opacity="0.7">
        <rect x="36" y="34" width="16" height="9" /><rect x="52" y="34" width="16" height="9" /><rect x="44" y="25" width="16" height="9" />
        <rect x="220" y="46" width="14" height="8" /><rect x="234" y="46" width="14" height="8" />
      </g>
      {/* stepped pixel mountains, two-tone */}
      <g fill="#3f6b34">
        <rect x="0" y="150" width="18" height="20" /><rect x="18" y="132" width="18" height="38" /><rect x="36" y="114" width="18" height="56" /><rect x="54" y="96" width="18" height="74" /><rect x="72" y="114" width="18" height="56" /><rect x="90" y="132" width="18" height="38" /><rect x="108" y="150" width="18" height="20" />
        <rect x="300" y="140" width="18" height="30" /><rect x="318" y="118" width="18" height="52" /><rect x="336" y="98" width="18" height="72" /><rect x="354" y="122" width="18" height="48" /><rect x="372" y="145" width="18" height="25" />
      </g>
      <g fill="#2c5027">
        <rect x="54" y="96" width="6" height="12" /><rect x="336" y="98" width="6" height="12" />
      </g>
      {/* grass + dirt ground with a pixel texture band */}
      <rect x="0" y="170" width="400" height="18" fill="#5c8a3c" />
      <g fill="#4a7530">{Array.from({ length: 40 }).map((_, i) => <rect key={i} x={i * 10} y="170" width="5" height="5" />)}</g>
      <rect x="0" y="188" width="400" height="52" fill="#6b4a2c" />
      <g fill="#5c3f24">{Array.from({ length: 40 }).map((_, i) => <rect key={i} x={i * 10 + (i % 2) * 3} y="200" width="6" height="6" />)}</g>
      {/* trees */}
      <g><rect x="330" y="148" width="12" height="20" fill="#6b4a2c" /><g fill="#3a6f2a"><rect x="320" y="122" width="10" height="10" /><rect x="330" y="122" width="10" height="10" /><rect x="340" y="122" width="10" height="10" /><rect x="320" y="132" width="10" height="10" /><rect x="330" y="132" width="10" height="10" /><rect x="340" y="132" width="10" height="10" /></g></g>
      <g><rect x="52" y="156" width="10" height="16" fill="#6b4a2c" /><g fill="#3a6f2a"><rect x="44" y="136" width="9" height="9" /><rect x="53" y="136" width="9" height="9" /><rect x="62" y="136" width="9" height="9" /><rect x="53" y="145" width="9" height="9" /></g></g>
      {/* simple blocky character */}
      <g transform="translate(200,150)">
        <rect x="0" y="0" width="14" height="14" fill="#c98a5e" /> {/* head */}
        <rect x="0" y="14" width="14" height="20" fill="#3a6f9c" /> {/* torso */}
        <rect x="-6" y="14" width="6" height="18" fill="#c98a5e" /> {/* arm */}
        <rect x="14" y="14" width="6" height="18" fill="#c98a5e" />
        <rect x="1" y="34" width="6" height="16" fill="#4a4a4a" /> {/* legs */}
        <rect x="8" y="34" width="6" height="16" fill="#3a3a3a" />
        <rect x="16" y="10" width="4" height="14" fill="#8a8a8a" transform="rotate(30 16 10)" /> {/* pickaxe handle */}
      </g>
    </svg>
  );
}

export function AssettoCorsaArt() {
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
      <defs>
        <linearGradient id="ac-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06050a" /><stop offset="55%" stopColor="#1c0b13" /><stop offset="100%" stopColor="#3f0d18" />
        </linearGradient>
        <linearGradient id="ac-glow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff2d4d" stopOpacity="0" /><stop offset="100%" stopColor="#ff2d4d" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="ac-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" /><stop offset="100%" stopColor="#ffe8ec" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#ac-sky)" />
      <rect x="0" y="118" width="400" height="30" fill="url(#ac-glow)" />
      {/* grandstand silhouette */}
      <g fill="#0f0a10"><rect x="0" y="95" width="130" height="30" /><rect x="270" y="95" width="130" height="30" /></g>
      <g fill="#ffb84d" opacity="0.5">{Array.from({length:10}).map((_,i)=><rect key={i} x={i*13+3} y="102" width="4" height="4" />)}</g>
      {/* track converging to a vanishing point, with curbs */}
      <path d="M0 240 L165 118 L235 118 L400 240 Z" fill="#0a0910" />
      <path d="M0 240 L180 118 L220 118 L400 240 L340 240 L215 128 L185 128 L60 240 Z" fill="#17131a" />
      <g>{Array.from({length:8}).map((_,i)=>(<rect key={i} x={168+i*8.2} y="116" width="4" height="3" fill={i%2?'#ff2d4d':'#f2f2f2'} transform={`skewX(${(i-4)*1.2})`} />))}</g>
      <line x1="200" y1="240" x2="200" y2="122" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="9 11" opacity="0.6" />
      <path d="M40 230 L220 128 L228 128 L60 232 Z" fill="url(#ac-beam)" opacity="0.5" />
      <path d="M360 230 L200 132 L195 132 L345 232 Z" fill="url(#ac-beam)" opacity="0.3" />
      {/* car silhouette, low sporty profile, on the straight */}
      <g transform="translate(178,176) scale(0.85)">
        <path d="M0 26 Q2 14 16 12 L30 6 Q42 2 54 6 L66 12 Q76 14 78 26 Z" fill="#0c0a0e" />
        <path d="M28 8 Q40 2 52 8 L48 14 L32 14 Z" fill="#1c1820" />
        <circle cx="16" cy="27" r="7" fill="#050405" /><circle cx="62" cy="27" r="7" fill="#050405" />
        <rect x="-4" y="16" width="4" height="3" fill="#ffe8ec" /><rect x="78" y="16" width="4" height="3" fill="#ff2d4d" />
      </g>
      <path d="M100 200 Q140 190 178 190" stroke="#ff2d4d" strokeWidth="3" fill="none" opacity="0.55" strokeLinecap="round" />
      <path d="M100 206 Q140 197 178 196" stroke="#ff2d4d" strokeWidth="2" fill="none" opacity="0.3" strokeLinecap="round" />
      {/* checkered flag corner accent */}
      <g opacity="0.9">
        {Array.from({ length: 4 }).map((_, r) => Array.from({ length: 4 }).map((_, c) => (
          ((r + c) % 2 === 0) && <rect key={`${r}-${c}`} x={c * 10} y={r * 10} width="10" height="10" fill="#f2f2f2" />
        )))}
      </g>
    </svg>
  );
}

export function BeamNGArt() {
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
      <defs>
        <linearGradient id="bng-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141a20" /><stop offset="45%" stopColor="#3a2f2a" /><stop offset="100%" stopColor="#cf823f" />
        </linearGradient>
        <radialGradient id="bng-sun" cx="18%" cy="28%" r="30%">
          <stop offset="0%" stopColor="#ffcf8a" stopOpacity="0.95" /><stop offset="100%" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#bng-sky)" />
      <rect width="400" height="240" fill="url(#bng-sun)" />
      <circle cx="76" cy="60" r="24" fill="#ffe3b0" />
      <path d="M0 172 L40 138 L90 162 L150 118 L210 155 L270 126 L330 160 L400 138 L400 240 L0 240 Z" fill="#221810" />
      <path d="M0 202 L70 176 L140 198 L220 172 L300 196 L400 180 L400 240 L0 240 Z" fill="#160f08" />
      {/* dirt jump ramp */}
      <path d="M60 240 L160 240 L210 180 L170 178 Z" fill="#3a2a1c" />
      <path d="M170 178 L210 180 L206 186 L172 184 Z" fill="#4a3624" />
      {/* truck mid-air over the ramp, angled with visible suspension */}
      <g transform="translate(232,150) rotate(-14)">
        <path d="M0 30 L4 12 L18 10 L24 0 L52 0 L58 10 L70 12 L70 30 Z" fill="#0d0a08" />
        <rect x="26" y="2" width="24" height="10" fill="#1c1712" />
        <circle cx="14" cy="33" r="10" fill="#050403" /><circle cx="58" cy="33" r="10" fill="#050403" />
        <circle cx="14" cy="33" r="3.5" fill="#3a3a3a" /><circle cx="58" cy="33" r="3.5" fill="#3a3a3a" />
        <rect x="70" y="14" width="3" height="4" fill="#ff8a3d" /><rect x="-3" y="14" width="3" height="4" fill="#ffcf8a" />
      </g>
      {/* dust burst under the jump */}
      <g fill="#d9a066" opacity="0.55"><circle cx="200" cy="205" r="10" /><circle cx="182" cy="212" r="7" /><circle cx="218" cy="214" r="8" /><circle cx="196" cy="220" r="6" /></g>
      <g fill="#b6835a" opacity="0.4"><circle cx="245" cy="204" r="3" /><circle cx="255" cy="196" r="2.2" /><circle cx="238" cy="196" r="1.8" /></g>
    </svg>
  );
}

// Per-game logo treatment: a designed badge/plaque behind styled type — reads
// as intentional branding rather than plain text, without redrawing any
// official trademarked logo.
export interface LogoStyle { badgeClass: string; textClass: string; }
export const LOGO_STYLES: Record<string, LogoStyle> = {
  // Badge shape is angled; textClass carries the exact opposite skew so the
  // lettering itself reads upright and legible over the angled plaque.
  fivem: { badgeClass: 'bg-gradient-to-r from-orange-500 to-orange-400 -skew-x-12', textClass: 'skew-x-12 text-white font-extrabold italic tracking-tight' },
  minecraft: { badgeClass: 'bg-[#3a2a1c] border border-[#5c3f24]', textClass: 'text-[#d9ffb0] font-black tracking-tight' },
  assettocorsa: { badgeClass: 'bg-gradient-to-r from-red-600 to-red-500 skew-x-12', textClass: '-skew-x-12 text-white font-extrabold tracking-wide uppercase text-[0.85em]' },
  beamng: { badgeClass: 'bg-[#2a1f16] border border-[#4a3624]', textClass: 'text-amber-300 font-extrabold tracking-tight uppercase text-[0.85em]' },
};
