// Built-in livery asset presets. Each preset renders an SVG onto a canvas
// at the target texture resolution.

export interface LiveryAsset {
  id: string;
  name: string;
  category: 'police' | 'fire' | 'ems' | 'racing' | 'patterns' | 'badges' | 'numbers';
  thumbnail: string; // data URL for 48x48 preview
  render: (w: number, h: number) => HTMLCanvasElement;
}

export type NumberStyle = 'block' | 'outline' | 'racing' | 'badge' | 'jersey';

export interface NumberOptions {
  text: string;
  style: NumberStyle;
  fillColor: string;
  outlineColor: string;
  bgColor: string;
  posX: number; // 0-1 relative to canvas
  posY: number; // 0-1 relative to canvas
  scale: number; // 0.1-2.0, where 1.0 = default font size
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function svgToCanvas(svgStr: string, w: number, h: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.onload = () => {
      const c = makeCanvas(w, h);
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.src = url;
  });
}

// ── Stripe helpers ─────────────────────────────────────────────────────────────

function stripeCanvas(
  w: number, h: number,
  stripes: { y: number; height: number; color: string }[],
): HTMLCanvasElement {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
  for (const s of stripes) {
    const pY = Math.round(s.y * h), pH = Math.round(s.height * h);
    ctx.fillStyle = s.color; ctx.fillRect(0, pY, w, pH);
  }
  return c;
}

function checkerCanvas(w: number, h: number, color1: string, color2: string, rows: number, cols: number): HTMLCanvasElement {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    ctx.fillStyle = (r + col) % 2 === 0 ? color1 : color2;
    ctx.fillRect(col * cw, r * ch, cw, ch);
  }
  return c;
}

function diagonalStripeCanvas(w: number, h: number, color: string, bg: string, angle: number, count: number): HTMLCanvasElement {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate((angle * Math.PI) / 180);
  const step = w / count;
  ctx.fillStyle = color;
  for (let i = -count; i < count * 2; i += 2) {
    ctx.fillRect(i * step - w, -h * 2, step, h * 4);
  }
  ctx.restore();
  return c;
}

// ── All assets ─────────────────────────────────────────────────────────────────

export const LIVERY_ASSETS: Omit<LiveryAsset, 'thumbnail'>[] = [
  // ── Police ──────────────────────────────────────────────────────────────────
  {
    id: 'police_checker_blue',
    name: 'Police Checker (blue)',
    category: 'police',
    render: (w, h) => checkerCanvas(w, h, '#1a2b6b', '#ffffff', 4, 16),
  },
  {
    id: 'police_checker_battenburg',
    name: 'Battenburg Checker',
    category: 'police',
    render: (w, h) => checkerCanvas(w, h, '#ffcc00', '#202020', 4, 12),
  },
  {
    id: 'police_thin_blue_line',
    name: 'Thin Blue Line Stripe',
    category: 'police',
    render: (w, h) => stripeCanvas(w, h, [
      { y: 0.44, height: 0.04, color: '#1155cc' },
    ]),
  },
  {
    id: 'police_stripe_3',
    name: '3-Band Police Stripe',
    category: 'police',
    render: (w, h) => stripeCanvas(w, h, [
      { y: 0.40, height: 0.06, color: '#1a2b6b' },
      { y: 0.46, height: 0.06, color: '#e0e0e0' },
      { y: 0.52, height: 0.06, color: '#1a2b6b' },
    ]),
  },
  {
    id: 'police_diagonal',
    name: 'Diagonal Police',
    category: 'police',
    render: (w, h) => diagonalStripeCanvas(w, h, '#1a2b6b', '#e0e0e0', 30, 8),
  },

  // ── Fire ────────────────────────────────────────────────────────────────────
  {
    id: 'fire_red_stripe',
    name: 'Fire Engine Stripe',
    category: 'fire',
    render: (w, h) => stripeCanvas(w, h, [
      { y: 0.35, height: 0.08, color: '#ff0000' },
      { y: 0.43, height: 0.02, color: '#ffdd00' },
      { y: 0.45, height: 0.08, color: '#ff0000' },
    ]),
  },
  {
    id: 'fire_diagonal_red',
    name: 'Fire Diagonal',
    category: 'fire',
    render: (w, h) => diagonalStripeCanvas(w, h, '#cc0000', '#ff6600', 45, 6),
  },
  {
    id: 'fire_reflective',
    name: 'Fire Reflective Chevron',
    category: 'fire',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const step = w / 8;
      for (let i = 0; i < 8; i++) {
        const even = i % 2 === 0;
        // Draw a chevron shape
        ctx.fillStyle = even ? '#ffdd00' : '#cc0000';
        ctx.beginPath();
        ctx.moveTo(i * step, h);
        ctx.lineTo(i * step + step / 2, 0);
        ctx.lineTo((i + 1) * step, 0);
        ctx.lineTo((i + 1) * step - step / 2, h);
        ctx.closePath(); ctx.fill();
      }
      return c;
    },
  },

  // ── EMS ─────────────────────────────────────────────────────────────────────
  {
    id: 'ems_star_of_life',
    name: 'EMS Green Stripe',
    category: 'ems',
    render: (w, h) => stripeCanvas(w, h, [
      { y: 0.40, height: 0.04, color: '#006400' },
      { y: 0.44, height: 0.10, color: '#00aa44' },
      { y: 0.54, height: 0.04, color: '#006400' },
    ]),
  },
  {
    id: 'ems_checker',
    name: 'EMS Checker',
    category: 'ems',
    render: (w, h) => checkerCanvas(w, h, '#00aa44', '#ffffff', 3, 12),
  },
  {
    id: 'ems_diagonal',
    name: 'EMS Diagonal',
    category: 'ems',
    render: (w, h) => diagonalStripeCanvas(w, h, '#00aa44', '#005522', -30, 6),
  },

  // ── Racing ──────────────────────────────────────────────────────────────────
  {
    id: 'racing_checker_bw',
    name: 'Racing Checker B&W',
    category: 'racing',
    render: (w, h) => checkerCanvas(w, h, '#000000', '#ffffff', 4, 16),
  },
  {
    id: 'racing_side_stripe',
    name: 'Racing Side Stripe',
    category: 'racing',
    render: (w, h) => stripeCanvas(w, h, [
      { y: 0.30, height: 0.06, color: '#e60000' },
      { y: 0.36, height: 0.02, color: '#ffffff' },
      { y: 0.38, height: 0.06, color: '#e60000' },
    ]),
  },
  {
    id: 'racing_speed_lines',
    name: 'Racing Speed Lines',
    category: 'racing',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const colors = ['#e60000', '#ffffff', '#ffcc00'];
      for (let i = 0; i < 3; i++) {
        const y = h * (0.35 + i * 0.08);
        const thick = h * 0.04;
        const grd = ctx.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'transparent');
        grd.addColorStop(0.2, colors[i]);
        grd.addColorStop(1, colors[i]);
        ctx.fillStyle = grd; ctx.fillRect(0, y, w, thick);
      }
      return c;
    },
  },

  // ── Patterns ────────────────────────────────────────────────────────────────
  {
    id: 'pattern_carbon_fiber',
    name: 'Carbon Fiber',
    category: 'patterns',
    render: (w, h) => {
      const tile = 8;
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      for (let y = 0; y < h; y += tile) {
        for (let x = 0; x < w; x += tile) {
          const even = ((x / tile + y / tile) % 2) === 0;
          const g = ctx.createLinearGradient(x, y, x + tile, y + tile);
          if (even) { g.addColorStop(0, '#2a2a2a'); g.addColorStop(1, '#111'); }
          else { g.addColorStop(0, '#1a1a1a'); g.addColorStop(1, '#333'); }
          ctx.fillStyle = g; ctx.fillRect(x, y, tile, tile);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5; ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
        }
      }
      return c;
    },
  },
  {
    id: 'pattern_brushed_metal',
    name: 'Brushed Metal',
    category: 'patterns',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#c8c8c8'); grd.addColorStop(0.5, '#a0a0a0'); grd.addColorStop(1, '#c8c8c8');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.08;
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = y % 6 === 0 ? '#ffffff' : '#000000'; ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 1;
      return c;
    },
  },
  {
    id: 'pattern_hex',
    name: 'Hex Pattern',
    category: 'patterns',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, w, h);
      const size = w / 20;
      const rowH = size * Math.sqrt(3);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      for (let row = -1; row < h / rowH + 1; row++) {
        for (let col = -1; col < w / (size * 1.5) + 1; col++) {
          const cx = col * size * 1.5;
          const cy = row * rowH + (col % 2 === 0 ? 0 : rowH / 2);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const px = cx + size * Math.cos(angle);
            const py = cy + size * Math.sin(angle);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        }
      }
      return c;
    },
  },

  // ── Badges ──────────────────────────────────────────────────────────────────
  {
    id: 'badge_shield',
    name: 'Shield Shape',
    category: 'badges',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const cx = w / 2, sw = w * 0.3, sh = h * 0.4;
      const top = h * 0.3, bot = h * 0.75;
      ctx.beginPath();
      ctx.moveTo(cx - sw / 2, top);
      ctx.lineTo(cx + sw / 2, top);
      ctx.lineTo(cx + sw / 2, bot - sh * 0.3);
      ctx.quadraticCurveTo(cx + sw / 2, bot, cx, bot);
      ctx.quadraticCurveTo(cx - sw / 2, bot, cx - sw / 2, bot - sh * 0.3);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx, top, cx, bot);
      g.addColorStop(0, '#1a2b6b'); g.addColorStop(1, '#0d1a45');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#4466cc'; ctx.lineWidth = 2; ctx.stroke();
      return c;
    },
  },
  {
    id: 'badge_star',
    name: 'Sheriff Star',
    category: 'badges',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const a2 = a + Math.PI / 6;
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        ctx.lineTo(cx + r * 0.45 * Math.cos(a2), cy + r * 0.45 * Math.sin(a2));
      }
      ctx.closePath();
      ctx.fillStyle = '#ffd700'; ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
      return c;
    },
  },
];

// ── Additional presets added after initial batch ─────────────────────────────

const additionalAssets: Omit<LiveryAsset, 'thumbnail'>[] = [
  // Reflective tape stripe
  {
    id: 'pattern_reflective_tape',
    name: 'Reflective Tape',
    category: 'patterns',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const stripeH = h * 0.06; const y = h * 0.44;
      // Alternating yellow/silver stripes like DOT reflective tape
      const segW = w / 20;
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#ffee00' : '#cccccc';
        ctx.fillRect(i * segW, y, segW, stripeH);
      }
      // Thin border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(0, y, w, stripeH);
      return c;
    },
  },
  // Police door badge area
  {
    id: 'police_door_panel',
    name: 'Police Door Panel',
    category: 'police',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      // Dark blue lower body panel
      ctx.fillStyle = '#0a1628'; ctx.fillRect(0, h * 0.5, w, h * 0.5);
      // White band at split
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, h * 0.47, w, h * 0.06);
      // Gold pinstripe
      ctx.fillStyle = '#ffd700'; ctx.fillRect(0, h * 0.53, w, h * 0.01);
      return c;
    },
  },
  // EMS Star of Life overlay
  {
    id: 'ems_star_overlay',
    name: 'EMS Star of Life',
    category: 'ems',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.25;
      ctx.strokeStyle = '#00aa44'; ctx.fillStyle = '#00aa44'; ctx.lineWidth = r * 0.15;
      // 6-pointed star of life (cross + rotated cross)
      for (let angle = 0; angle < 3; angle++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((angle * Math.PI) / 3);
        const arm = r; const thick = r * 0.28;
        ctx.fillRect(-thick / 2, -arm, thick, arm * 2);
        ctx.restore();
      }
      // Center circle
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#00aa44'; ctx.lineWidth = 3; ctx.stroke();
      return c;
    },
  },
  // Racing stripe multicolor
  {
    id: 'racing_le_mans_stripe',
    name: 'Le Mans Racing Stripes',
    category: 'racing',
    render: (w, h) => stripeCanvas(w, h, [
      { y: 0.36, height: 0.04, color: '#0033aa' },
      { y: 0.40, height: 0.02, color: '#e8e8e8' },
      { y: 0.42, height: 0.04, color: '#cc0000' },
    ]),
  },
  // Warning stripes
  {
    id: 'pattern_warning_stripes',
    name: 'Warning Stripes',
    category: 'patterns',
    render: (w, h) => diagonalStripeCanvas(w, h, '#ffcc00', '#222222', 45, 8),
  },
  // Police "Thin Blue Line" flag
  {
    id: 'police_thin_blue_flag',
    name: 'Thin Blue Line Flag',
    category: 'police',
    render: (w, h) => {
      const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
      // Black-white-black with blue stripe
      const bands = [
        { y: 0, h: 0.42, color: '#111' },
        { y: 0.42, h: 0.08, color: '#1a5fb4' },
        { y: 0.50, h: 0.50, color: '#111' },
      ];
      for (const b of bands) { ctx.fillStyle = b.color; ctx.fillRect(0, b.y * h, w, b.h * h); }
      return c;
    },
  },
];

LIVERY_ASSETS.push(...additionalAssets);

// ── Number generator ──────────────────────────────────────────────────────────

export function renderNumberSticker(w: number, h: number, opts: NumberOptions): HTMLCanvasElement {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d')!;
  const cx = w * opts.posX, cy = h * opts.posY;
  const baseFontSize = Math.min(w, h) * 0.35 * opts.scale;

  switch (opts.style) {
    case 'block': {
      ctx.font = `900 ${baseFontSize}px "Arial Black", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = opts.outlineColor; ctx.lineWidth = baseFontSize * 0.12; ctx.lineJoin = 'round';
      ctx.strokeText(opts.text, cx, cy);
      ctx.fillStyle = opts.fillColor; ctx.fillText(opts.text, cx, cy);
      break;
    }
    case 'outline': {
      ctx.font = `900 ${baseFontSize}px "Arial Black", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = opts.fillColor; ctx.lineWidth = baseFontSize * 0.08; ctx.lineJoin = 'round';
      ctx.strokeText(opts.text, cx, cy);
      break;
    }
    case 'racing': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.08);
      ctx.font = `italic 900 ${baseFontSize}px "Arial Black", Impact, Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = opts.outlineColor; ctx.lineWidth = baseFontSize * 0.1; ctx.lineJoin = 'round';
      ctx.strokeText(opts.text, 0, 0);
      ctx.fillStyle = opts.fillColor; ctx.fillText(opts.text, 0, 0);
      ctx.restore();
      break;
    }
    case 'badge': {
      // Circle or rounded rect background
      const pad = baseFontSize * 0.3;
      ctx.font = `900 ${baseFontSize}px "Arial Black", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const metrics = ctx.measureText(opts.text);
      const bw = metrics.width + pad * 2, bh = baseFontSize + pad * 2;
      const rx = bw / 2 * 0.6;
      const bx = cx - bw / 2, by = cy - bh / 2;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, rx);
      ctx.fillStyle = opts.bgColor; ctx.fill();
      ctx.strokeStyle = opts.outlineColor; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = opts.fillColor; ctx.fillText(opts.text, cx, cy);
      break;
    }
    case 'jersey': {
      ctx.font = `900 ${baseFontSize}px "Arial Black", Impact, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const metrics = ctx.measureText(opts.text);
      const pad = baseFontSize * 0.2;
      const bw = metrics.width + pad * 2, bh = baseFontSize + pad * 2;
      // Background swatch
      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      // Number
      ctx.fillStyle = opts.fillColor; ctx.fillText(opts.text, cx, cy);
      // Bottom stripe accent
      ctx.fillStyle = opts.outlineColor;
      ctx.fillRect(cx - bw / 2, cy + bh / 2 - 6, bw, 6);
      break;
    }
  }
  return c;
}

// Generate a small thumbnail for the asset picker
export function assetThumbnail(asset: Omit<LiveryAsset, 'thumbnail'>): string {
  const c = asset.render(64, 64); return c.toDataURL();
}

export function applyAsset(asset: Omit<LiveryAsset, 'thumbnail'>, targetW: number, targetH: number): HTMLCanvasElement {
  return asset.render(targetW, targetH);
}
