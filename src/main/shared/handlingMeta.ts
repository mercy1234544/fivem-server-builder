// ─────────────────────────────────────────────────────────────────────────────
// Shared handling-metadata engine (PURE — no fs / electron / node imports).
//
// Single source of truth for the Vehicle Studio tuning experience, imported by
// BOTH the main-process service (src/main/services/VehicleStudio.ts) and the
// renderer UI (src/renderer/...). Because it is pure data + math it bundles into
// the renderer via Vite and compiles under the main tsconfig unchanged.
//
// Everything here operates on plain field maps (Record<string, number>) using the
// REAL handling.meta field names the project's parser already extracts. Nothing
// invents metadata fields — a field only matters if it exists in the vehicle.
//
// The derived characteristics are HEURISTIC comparison indices (0–100), not real
// physics measurements. They are labelled `estimate` so the UI never presents
// them as exact. Weight is a real value; top speed is a documented estimate.
// ─────────────────────────────────────────────────────────────────────────────

export const clampN = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const round = (n: number, dp = 6) => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};
const num = (f: Record<string, number>, k: string, d = 0) => (Number.isFinite(f[k]) ? f[k] : d);

// ── Field metadata registry ──────────────────────────────────────────────────
export interface FieldTip {
  what: string;      // what the value controls
  higher?: string;   // what increasing it does
  lower?: string;    // what decreasing it does
  extreme?: string;  // what extreme values can cause
}
export interface FieldMeta {
  friendly: string;
  group: GroupId;
  tip: FieldTip;
  safeMin?: number;  // typical lower bound (soft — warns outside, never blocks)
  safeMax?: number;  // typical upper bound
  hardMin?: number;  // clearly-broken below this
  hardMax?: number;  // clearly-broken above this
  decimals?: number; // display precision (ints use 0)
  unit?: string;
}

export type GroupId =
  | 'core' | 'engine' | 'transmission' | 'braking'
  | 'traction' | 'suspension' | 'steering' | 'damage';

export interface HandlingGroup { id: GroupId; title: string; fields: string[]; }

// Logical grouping of the raw handling fields (requirement #4). The editor only
// renders fields that actually exist in the vehicle; unlisted fields fall into an
// "Other" bucket so nothing is ever hidden.
export const HANDLING_GROUPS: HandlingGroup[] = [
  { id: 'core', title: 'Core Physics', fields: [
    'fMass', 'fInitialDragCoeff', 'fDownforceModifier', 'fPercentSubmerged', 'vecCentreOfMassOffset', 'vecInertiaMultiplier' ] },
  { id: 'engine', title: 'Engine', fields: [
    'fInitialDriveForce', 'fDriveInertia', 'fInitialDriveMaxFlatVel', 'fDriveBiasFront' ] },
  { id: 'transmission', title: 'Transmission', fields: [
    'nInitialDriveGears', 'fClutchChangeRateScaleUpShift', 'fClutchChangeRateScaleDownShift' ] },
  { id: 'braking', title: 'Braking', fields: [
    'fBrakeForce', 'fBrakeBiasFront', 'fHandBrakeForce' ] },
  { id: 'traction', title: 'Traction', fields: [
    'fTractionCurveMax', 'fTractionCurveMin', 'fTractionCurveLateral', 'fTractionSpringDeltaMax',
    'fLowSpeedTractionLossMult', 'fTractionLossMult', 'fCamberStiffnesss', 'fTractionBiasFront' ] },
  { id: 'suspension', title: 'Suspension', fields: [
    'fSuspensionForce', 'fSuspensionCompDamp', 'fSuspensionReboundDamp', 'fSuspensionUpperLimit',
    'fSuspensionLowerLimit', 'fSuspensionRaise', 'fSuspensionBiasFront', 'fAntiRollBarForce',
    'fAntiRollBarBiasFront', 'fRollCentreHeightFront', 'fRollCentreHeightRear' ] },
  { id: 'steering', title: 'Steering', fields: ['fSteeringLock'] },
  { id: 'damage', title: 'Damage', fields: [
    'fCollisionDamageMult', 'fDeformationDamageMult', 'fEngineDamageMult', 'fWeaponDamageMult' ] },
];

export const FIELD_META: Record<string, FieldMeta> = {
  // Core
  fMass: { friendly: 'Mass', group: 'core', unit: 'kg', decimals: 0, safeMin: 400, safeMax: 8000, hardMin: 1, hardMax: 100000,
    tip: { what: 'Vehicle weight in kilograms.', higher: 'More momentum and stability, slower to accelerate and stop.', lower: 'Nimbler and quicker, but easier to unsettle.', extreme: 'Very low mass can make the car flip or fly on small bumps.' } },
  fInitialDragCoeff: { friendly: 'Drag coefficient', group: 'core', decimals: 3, safeMin: 3, safeMax: 20, hardMin: 0.01, hardMax: 200,
    tip: { what: 'Aerodynamic drag holding the car back at speed.', higher: 'Lower top speed.', lower: 'Higher top speed.', extreme: 'Extremely low drag produces unrealistic top speeds.' } },
  fDownforceModifier: { friendly: 'Downforce', group: 'core', decimals: 3, safeMin: 0, safeMax: 5,
    tip: { what: 'Extra grip pressing the car down as it goes faster (when present).', higher: 'More high-speed grip and stability.', lower: 'Looser at speed.' } },
  fPercentSubmerged: { friendly: 'Percent submerged', group: 'core', decimals: 2, safeMin: 50, safeMax: 90, hardMin: 1, hardMax: 100,
    tip: { what: 'How deep the vehicle sits in water before it floats/sinks.', higher: 'Floats less (sinks sooner).', lower: 'Floats more.' } },
  vecCentreOfMassOffset: { friendly: 'Centre of mass', group: 'core', decimals: 3,
    tip: { what: 'Where the weight sits (x=side, y=front/back, z=height).', higher: 'Shifts balance toward that axis.', lower: 'Shifts balance the other way.', extreme: 'A high centre of mass makes the car tip over easily.' } },
  vecInertiaMultiplier: { friendly: 'Inertia multiplier', group: 'core', decimals: 3,
    tip: { what: 'How resistant the body is to rotating on each axis.', higher: 'Feels heavier to rotate / more planted.', lower: 'Rotates more freely (twitchier).' } },
  // Engine
  fInitialDriveForce: { friendly: 'Drive force', group: 'engine', decimals: 3, safeMin: 0.1, safeMax: 0.5, hardMin: 0.01, hardMax: 1,
    tip: { what: 'Engine power delivered to the wheels.', higher: 'Faster acceleration and higher top speed.', lower: 'Slower, gentler power.', extreme: 'Very high drive force causes constant wheelspin and loss of control.' } },
  fDriveInertia: { friendly: 'Drive inertia', group: 'engine', decimals: 3, safeMin: 0.1, safeMax: 2, hardMin: 0.01, hardMax: 5,
    tip: { what: 'How quickly the engine revs up.', higher: 'Revs and responds faster.', lower: 'Slower, lazier revs.' } },
  fInitialDriveMaxFlatVel: { friendly: 'Top-speed cap', group: 'engine', unit: 'game', decimals: 2, safeMin: 80, safeMax: 220, hardMin: 5, hardMax: 400,
    tip: { what: 'Drivetrain speed limiter (game units ≈ 0.92 → mph).', higher: 'Raises top speed.', lower: 'Lowers top speed.', extreme: 'Extremely high caps make the car uncontrollable at speed.' } },
  fDriveBiasFront: { friendly: 'Drive bias (front)', group: 'engine', decimals: 3, safeMin: 0, safeMax: 1, hardMin: 0, hardMax: 1,
    tip: { what: 'Where engine power goes: 0 = RWD, 1 = FWD, ~0.5 = AWD.', higher: 'More power to the front (toward FWD).', lower: 'More power to the rear (toward RWD).' } },
  // Transmission
  nInitialDriveGears: { friendly: 'Gears', group: 'transmission', decimals: 0, safeMin: 1, safeMax: 8, hardMin: 1, hardMax: 12,
    tip: { what: 'Number of forward gears.', higher: 'More gears — smoother spread of power.', lower: 'Fewer gears — snappier but coarser.' } },
  fClutchChangeRateScaleUpShift: { friendly: 'Up-shift speed', group: 'transmission', decimals: 3, safeMin: 0.5, safeMax: 5, hardMin: 0.01, hardMax: 20,
    tip: { what: 'How fast the car shifts up.', higher: 'Snappier up-shifts.', lower: 'Slower up-shifts.', extreme: 'Very high values feel instant / arcade-like.' } },
  fClutchChangeRateScaleDownShift: { friendly: 'Down-shift speed', group: 'transmission', decimals: 3, safeMin: 0.5, safeMax: 5, hardMin: 0.01, hardMax: 20,
    tip: { what: 'How fast the car shifts down.', higher: 'Snappier down-shifts.', lower: 'Slower down-shifts.' } },
  // Braking
  fBrakeForce: { friendly: 'Brake force', group: 'braking', decimals: 3, safeMin: 0.3, safeMax: 1.5, hardMin: 0.01, hardMax: 3,
    tip: { what: 'Overall braking power.', higher: 'Shorter stops.', lower: 'Longer stops.', extreme: 'Excessive brake force locks the wheels and makes stopping unstable.' } },
  fBrakeBiasFront: { friendly: 'Brake bias (front)', group: 'braking', decimals: 3, safeMin: 0.3, safeMax: 0.7, hardMin: 0, hardMax: 1,
    tip: { what: 'Front/rear brake balance: 0.5 = even.', higher: 'More front braking (safer, understeers).', lower: 'More rear braking (can spin under braking).', extreme: 'Extreme bias makes the car spin or refuse to slow.' } },
  fHandBrakeForce: { friendly: 'Handbrake force', group: 'braking', decimals: 3, safeMin: 0.3, safeMax: 3, hardMin: 0.01, hardMax: 10,
    tip: { what: 'Handbrake strength.', higher: 'Locks the rear harder (easier slides).', lower: 'Weaker handbrake.' } },
  // Traction
  fTractionCurveMax: { friendly: 'Traction curve max', group: 'traction', decimals: 3, safeMin: 1.0, safeMax: 3.0, hardMin: 0.1, hardMax: 10,
    tip: { what: 'Maximum available tyre grip.', higher: 'More grip — corners harder.', lower: 'Less grip — slides sooner.', extreme: 'Too high feels unnaturally glued to the road.' } },
  fTractionCurveMin: { friendly: 'Traction curve min', group: 'traction', decimals: 3, safeMin: 0.8, safeMax: 3.0, hardMin: 0.1, hardMax: 10,
    tip: { what: 'Grip once the tyres break away (sliding).', higher: 'Recovers grip sooner after a slide.', lower: 'Stays loose once sliding.' } },
  fTractionCurveLateral: { friendly: 'Lateral traction', group: 'traction', decimals: 3, safeMin: 10, safeMax: 30, hardMin: 1, hardMax: 100,
    tip: { what: 'Sideways grip response.', higher: 'Sharper cornering bite.', lower: 'Softer, vaguer steering.' } },
  fTractionSpringDeltaMax: { friendly: 'Traction spring delta', group: 'traction', decimals: 3, safeMin: 0.5, safeMax: 3, hardMin: 0.01, hardMax: 20,
    tip: { what: 'How far a tyre can flex before losing grip.', higher: 'More forgiving over bumps.', lower: 'Loses grip more abruptly.' } },
  fLowSpeedTractionLossMult: { friendly: 'Low-speed traction loss', group: 'traction', decimals: 3, safeMin: 0, safeMax: 2, hardMin: 0, hardMax: 10,
    tip: { what: 'Wheelspin when pulling away from low speed.', higher: 'More launch wheelspin.', lower: 'Cleaner launches.' } },
  fTractionLossMult: { friendly: 'Traction loss (surface)', group: 'traction', decimals: 3, safeMin: 0, safeMax: 2.5, hardMin: 0, hardMax: 10,
    tip: { what: 'Grip lost on poor surfaces (dirt, wet).', higher: 'Loses more grip off-tarmac.', lower: 'Keeps grip off-tarmac.' } },
  fCamberStiffnesss: { friendly: 'Camber stiffness', group: 'traction', decimals: 3, safeMin: -1, safeMax: 1,
    tip: { what: 'How wheel camber affects grip.', higher: 'More camber effect.', lower: 'Less camber effect.' } },
  fTractionBiasFront: { friendly: 'Traction bias (front)', group: 'traction', decimals: 3, safeMin: 0.35, safeMax: 0.65, hardMin: 0.01, hardMax: 0.99,
    tip: { what: 'Grip balance front/rear: 0.5 = even.', higher: 'More front grip (understeer).', lower: 'More rear grip (oversteer).', extreme: 'Extreme bias makes the car push wide or spin.' } },
  // Suspension
  fSuspensionForce: { friendly: 'Suspension force', group: 'suspension', decimals: 3, safeMin: 1.0, safeMax: 5, hardMin: 0.1, hardMax: 20,
    tip: { what: 'Spring stiffness holding the car up.', higher: 'Firmer, flatter cornering.', lower: 'Softer, more body roll.', extreme: 'Too stiff makes the car skip over bumps and lose grip.' } },
  fSuspensionCompDamp: { friendly: 'Compression damping', group: 'suspension', decimals: 3, safeMin: 0.5, safeMax: 3, hardMin: 0.01, hardMax: 10,
    tip: { what: 'How bumps are absorbed on compression.', higher: 'Tighter over bumps.', lower: 'Softer, floatier.' } },
  fSuspensionReboundDamp: { friendly: 'Rebound damping', group: 'suspension', decimals: 3, safeMin: 0.5, safeMax: 4, hardMin: 0.01, hardMax: 10,
    tip: { what: 'How the suspension settles after a bump.', higher: 'Settles quicker (firmer).', lower: 'Bounces more.' } },
  fSuspensionUpperLimit: { friendly: 'Suspension upper limit', group: 'suspension', decimals: 3, safeMin: 0.05, safeMax: 0.5,
    tip: { what: 'Max upward suspension travel.', higher: 'More upward travel.', lower: 'Less travel.' } },
  fSuspensionLowerLimit: { friendly: 'Suspension lower limit', group: 'suspension', decimals: 3, safeMin: -0.5, safeMax: -0.02,
    tip: { what: 'Max downward suspension travel.', higher: 'Less droop.', lower: 'More droop.' } },
  fSuspensionRaise: { friendly: 'Ride height', group: 'suspension', decimals: 3, safeMin: -0.1, safeMax: 0.4, hardMin: -1, hardMax: 2,
    tip: { what: 'Raises or lowers the body.', higher: 'Lifts the vehicle (off-road).', lower: 'Lowers it (track/stance).', extreme: 'Extreme raise can make the car unstable or clip the ground.' } },
  fSuspensionBiasFront: { friendly: 'Suspension bias (front)', group: 'suspension', decimals: 3, safeMin: 0.3, safeMax: 0.7, hardMin: 0.01, hardMax: 0.99,
    tip: { what: 'Front/rear suspension balance: 0.5 = even.', higher: 'Stiffer front.', lower: 'Stiffer rear.' } },
  fAntiRollBarForce: { friendly: 'Anti-roll bar', group: 'suspension', decimals: 3, safeMin: 0, safeMax: 3, hardMin: 0, hardMax: 10,
    tip: { what: 'Resistance to body roll in corners.', higher: 'Flatter, sharper cornering.', lower: 'More lean, softer turn-in.' } },
  fAntiRollBarBiasFront: { friendly: 'Anti-roll bias (front)', group: 'suspension', decimals: 3, safeMin: 0.3, safeMax: 0.7, hardMin: 0.01, hardMax: 0.99,
    tip: { what: 'Front/rear anti-roll balance.', higher: 'Tighter front (more understeer).', lower: 'Tighter rear (more oversteer).' } },
  fRollCentreHeightFront: { friendly: 'Roll centre (front)', group: 'suspension', decimals: 3,
    tip: { what: 'Front roll-centre height.', higher: 'Less front roll.', lower: 'More front roll.' } },
  fRollCentreHeightRear: { friendly: 'Roll centre (rear)', group: 'suspension', decimals: 3,
    tip: { what: 'Rear roll-centre height.', higher: 'Less rear roll.', lower: 'More rear roll.' } },
  // Steering
  fSteeringLock: { friendly: 'Steering lock', group: 'steering', unit: '°', decimals: 2, safeMin: 25, safeMax: 50, hardMin: 5, hardMax: 90,
    tip: { what: 'Maximum steering angle in degrees.', higher: 'Turns sharper (good for drift).', lower: 'Gentler steering.', extreme: 'Very high lock makes the car twitchy and hard to hold straight.' } },
  // Damage
  fCollisionDamageMult: { friendly: 'Collision damage', group: 'damage', decimals: 3, safeMin: 0, safeMax: 3, hardMin: 0, hardMax: 10,
    tip: { what: 'How much crashes damage the vehicle.', higher: 'More fragile.', lower: 'Tougher.', extreme: '0 makes the vehicle indestructible from impacts.' } },
  fDeformationDamageMult: { friendly: 'Deformation damage', group: 'damage', decimals: 3, safeMin: 0, safeMax: 3, hardMin: 0, hardMax: 10,
    tip: { what: 'How much the body visually deforms.', higher: 'Deforms more.', lower: 'Keeps its shape.' } },
  fEngineDamageMult: { friendly: 'Engine damage', group: 'damage', decimals: 3, safeMin: 0, safeMax: 3, hardMin: 0, hardMax: 10,
    tip: { what: 'How fast the engine takes damage.', higher: 'Engine fails sooner.', lower: 'Engine lasts longer.' } },
  fWeaponDamageMult: { friendly: 'Weapon damage', group: 'damage', decimals: 3, safeMin: 0, safeMax: 3, hardMin: 0, hardMax: 10,
    tip: { what: 'Damage taken from weapons.', higher: 'More vulnerable to gunfire.', lower: 'More bullet-resistant.' } },
};

/** Friendly label for any field, falling back to a de-camelCased name. */
export function fieldLabel(name: string): string {
  return FIELD_META[name]?.friendly
    || name.replace(/^(f|n|vec|str)/, '').replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim();
}
export function groupOf(name: string): GroupId | 'other' {
  return FIELD_META[name]?.group ?? 'other';
}
export const isIntField = (name: string) => name.startsWith('n');
export function decimalsOf(name: string): number {
  return FIELD_META[name]?.decimals ?? (isIntField(name) ? 0 : 6);
}
/** Format a numeric target the way it must be written back to handling.meta. */
export function formatValue(name: string, v: number): string {
  return isIntField(name) ? String(Math.round(v)) : v.toFixed(6);
}

// ── Extreme-value detection (requirement #10) ────────────────────────────────
export type WarnLevel = 'ok' | 'warn' | 'extreme';
export interface FieldWarning { level: WarnLevel; message?: string; }

/** Classify a single field value against its safe/hard ranges. Never blocks — the
 *  file format still accepts any parseable number; this only advises. */
export function fieldWarning(name: string, value: number): FieldWarning {
  const m = FIELD_META[name];
  if (!m || !Number.isFinite(value)) return { level: 'ok' };
  if ((m.hardMin !== undefined && value < m.hardMin) || (m.hardMax !== undefined && value > m.hardMax))
    return { level: 'extreme', message: `This value is far outside the workable range and may produce broken or unusual behaviour.` };
  if ((m.safeMin !== undefined && value < m.safeMin) || (m.safeMax !== undefined && value > m.safeMax))
    return { level: 'warn', message: `Outside the typical range${m.safeMin !== undefined && m.safeMax !== undefined ? ` (${m.safeMin}–${m.safeMax})` : ''} — unusual but allowed.` };
  return { level: 'ok' };
}

// ── Configuration health per category (requirement #11) ──────────────────────
export type Health = 'good' | 'warning' | 'extreme';
export interface CategoryHealth { health: Health; issues: string[]; }

/** Health of one handling group from its fields' values + a few cross-checks.
 *  This is a consistency heuristic ("Configuration Health"), NOT a physics score. */
export function groupHealth(groupId: GroupId, f: Record<string, number>): CategoryHealth {
  const fields = HANDLING_GROUPS.find((g) => g.id === groupId)?.fields ?? [];
  const issues: string[] = [];
  let worst: Health = 'good';
  const bump = (h: Health) => { if (h === 'extreme') worst = 'extreme'; else if (h === 'warning' && worst === 'good') worst = 'warning'; };
  for (const name of fields) {
    if (!(name in f)) continue;
    const w = fieldWarning(name, f[name]);
    if (w.level === 'extreme') { issues.push(`${fieldLabel(name)}: extreme value`); bump('extreme'); }
    else if (w.level === 'warn') { issues.push(`${fieldLabel(name)}: outside typical range`); bump('warning'); }
  }
  // Cross-field sanity checks.
  if (groupId === 'traction' && 'fTractionCurveMax' in f && 'fTractionCurveMin' in f && f.fTractionCurveMin > f.fTractionCurveMax + 0.001) {
    issues.push('Traction min is higher than max (inconsistent)'); bump('extreme');
  }
  if (groupId === 'suspension' && 'fSuspensionUpperLimit' in f && 'fSuspensionLowerLimit' in f && f.fSuspensionLowerLimit >= f.fSuspensionUpperLimit) {
    issues.push('Suspension lower limit is not below the upper limit'); bump('extreme');
  }
  return { health: worst, issues };
}

// ── Derived performance characteristics (requirement #2) ─────────────────────
// Heuristic comparison indices (0–100) unless marked otherwise. NOT real physics.
export type MetricKind = 'estimate' | 'measured' | 'label';
export interface Metric { key: string; label: string; kind: MetricKind; value: number; display: string; note?: string; }

const idx = (v: number) => Math.round(clampN(v, 0, 100));

export function computeMetrics(f: Record<string, number>): Metric[] {
  const mass = num(f, 'fMass', 1500);
  const drive = num(f, 'fInitialDriveForce', 0.3);
  const flatVel = num(f, 'fInitialDriveMaxFlatVel', 150);
  const drag = num(f, 'fInitialDragCoeff', 8.5);
  const inertia = num(f, 'fDriveInertia', 1);
  const brake = num(f, 'fBrakeForce', 0.7);
  const tMax = num(f, 'fTractionCurveMax', 2.0);
  const tLat = num(f, 'fTractionCurveLateral', 20);
  const antiRoll = num(f, 'fAntiRollBarForce', 0.5);
  const bias = num(f, 'fDriveBiasFront', 0.5);
  const collision = num(f, 'fCollisionDamageMult', 1);
  const deform = num(f, 'fDeformationDamageMult', 1);
  const engineDmg = num(f, 'fEngineDamageMult', 1);
  const susp = num(f, 'fSuspensionForce', 2);

  // Top speed: documented estimate (game units → mph ≈ ×0.92), lightly reduced by drag.
  const dragFactor = clampN(1 - (drag - 8.5) * 0.01, 0.85, 1.1);
  const topMph = Math.round(flatVel * 0.92 * dragFactor);
  // Acceleration index: power-to-weight, quicker revs help, wheelspin-prone power hurts a little.
  const pw = (drive * 1_000_000) / Math.max(mass, 300); // arbitrary but monotonic in power/weight
  const accel = idx((pw / 260) * 100 * clampN(0.85 + inertia * 0.1, 0.7, 1.2));
  // Braking index.
  const braking = idx((brake / 1.2) * 100);
  // Traction index (grip available).
  const traction = idx(((tMax - 0.8) / (2.8 - 0.8)) * 100);
  // Cornering index: lateral grip + anti-roll.
  const cornering = idx(((tLat / 26) * 0.7 + clampN(antiRoll / 2, 0, 1) * 0.3) * 100);
  // Stability index: heavier + balanced grip + anti-roll + not-too-stiff suspension.
  const balancePenalty = Math.abs(num(f, 'fTractionBiasFront', 0.5) - 0.5) * 120;
  const stability = idx(clampN((mass - 700) / (2600 - 700), 0, 1) * 55 + clampN(antiRoll / 2, 0, 1) * 20 + clampN(susp / 4, 0, 1) * 15 + 10 - balancePenalty);
  // Damage resistance index: lower damage mults = tougher.
  const dmgAvg = (collision + deform + engineDmg) / 3;
  const damageRes = idx((1 - clampN(dmgAvg / 2, 0, 1)) * 100);

  const drivetrain = bias <= 0.1 ? 'RWD' : bias >= 0.9 ? 'FWD' : 'AWD';
  const drivePct = Math.round(bias * 100);

  return [
    { key: 'topSpeed', label: 'Top Speed', kind: 'estimate', value: topMph, display: `${topMph} mph`, note: 'estimate from top-speed cap & drag' },
    { key: 'acceleration', label: 'Acceleration', kind: 'estimate', value: accel, display: `${accel}/100`, note: 'power-to-weight estimate' },
    { key: 'braking', label: 'Braking', kind: 'estimate', value: braking, display: `${braking}/100` },
    { key: 'traction', label: 'Traction', kind: 'estimate', value: traction, display: `${traction}/100` },
    { key: 'cornering', label: 'Cornering', kind: 'estimate', value: cornering, display: `${cornering}/100` },
    { key: 'stability', label: 'Stability', kind: 'estimate', value: stability, display: `${stability}/100` },
    { key: 'drivetrain', label: 'Drivetrain', kind: 'label', value: bias, display: drivetrain, note: `${drivePct}% front` },
    { key: 'driveBias', label: 'Drive Bias', kind: 'label', value: drivePct, display: `${drivePct}% front` },
    { key: 'weight', label: 'Weight', kind: 'measured', value: mass, display: `${Math.round(mass)} kg` },
    { key: 'damageResistance', label: 'Damage Resistance', kind: 'estimate', value: damageRes, display: `${damageRes}/100` },
  ];
}

// ── Compute helpers shared by presets & smart tune ───────────────────────────
export type ComputeFn = (f: Record<string, number>) => Record<string, number>;

/** Turn a compute(current)→targets into an exact diff vs the supplied values,
 *  keeping only fields that exist in `present` and actually change. Pure — the
 *  service reuses this against real file values; the UI previews with edits. */
export function diffTargets(current: Record<string, number>, targets: Record<string, number>, present: Set<string>): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = [];
  for (const [name, raw] of Object.entries(targets)) {
    if (!present.has(name)) continue;
    const from = current[name];
    if (!Number.isFinite(from)) continue;
    const to = isIntField(name) ? Math.round(raw) : round(raw);
    if (Number.isFinite(from) && parseFloat(from.toFixed(6)) === parseFloat(to.toFixed(6))) continue;
    out.push({ name, from, to });
  }
  return out;
}

// ── Full-handling presets (requirement #5) ───────────────────────────────────
// Each modifies REAL handling fields; only fields the vehicle already has are
// written (surgical). Deterministic and, where noted, mass/vehicle-aware. `stock`
// is special — the service restores the imported baseline for it.
export interface PresetDef { id: string; name: string; desc: string; special?: 'stock'; compute: ComputeFn; }

export const HANDLING_PRESETS: PresetDef[] = [
  { id: 'stock', name: 'Stock', desc: 'Restore the originally imported values.', special: 'stock', compute: () => ({}) },
  { id: 'balanced', name: 'Balanced', desc: 'A sensible, grippy all-round setup.', compute: (f) => ({
    fInitialDriveForce: clampN((f.fInitialDriveForce ?? 0.3) + 0.02, 0.24, 0.4), fTractionCurveMax: 2.1, fTractionCurveMin: 1.9,
    fBrakeForce: 0.9, fBrakeBiasFront: 0.5, fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.02, 1.4, 4), fAntiRollBarForce: 1.0, fSteeringLock: 40 }) },
  { id: 'street', name: 'Street', desc: 'Daily-driver: responsive but forgiving.', compute: (f) => ({
    fInitialDriveForce: clampN((f.fInitialDriveForce ?? 0.3) + 0.03, 0.26, 0.42), fTractionCurveMax: 2.15, fTractionCurveMin: 1.9,
    fBrakeForce: 0.95, fClutchChangeRateScaleUpShift: 2.5, fClutchChangeRateScaleDownShift: 2.5, fSteeringLock: 42 }) },
  { id: 'sport', name: 'Sport', desc: 'Sharper, quicker, more grip.', compute: (f) => ({
    fInitialDriveForce: 0.35, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 150, 155), fTractionCurveMax: 2.3, fTractionCurveMin: 2.0,
    fBrakeForce: 1.05, fClutchChangeRateScaleUpShift: 3, fClutchChangeRateScaleDownShift: 3, fAntiRollBarForce: 1.2, fSteeringLock: 43,
    nInitialDriveGears: Math.max(f.nInitialDriveGears ?? 5, 6) }) },
  { id: 'performance', name: 'Performance', desc: 'Strong power, brakes and grip.', compute: (f) => ({
    fInitialDriveForce: 0.38, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 150, 165), fInitialDragCoeff: clampN((f.fInitialDragCoeff ?? 8.5) - 0.5, 5, 20),
    fTractionCurveMax: 2.45, fTractionCurveMin: 2.1, fBrakeForce: 1.15, fBrakeBiasFront: 0.52, fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.1, 1.6, 5), fAntiRollBarForce: 1.4, fSteeringLock: 44 }) },
  { id: 'super', name: 'Super', desc: 'Hypercar-level pace and grip.', compute: (f) => ({
    fInitialDriveForce: 0.41, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 160, 180), fInitialDragCoeff: clampN((f.fInitialDragCoeff ?? 8) - 1, 5, 20),
    fTractionCurveMax: 2.6, fTractionCurveMin: 2.2, fBrakeForce: 1.25, fBrakeBiasFront: 0.52, fAntiRollBarForce: 1.5, fSteeringLock: 44,
    nInitialDriveGears: Math.max(f.nInitialDriveGears ?? 6, 7) }) },
  { id: 'track', name: 'Track', desc: 'Max grip + braking, stiff and flat.', compute: (f) => ({
    fInitialDriveForce: 0.39, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 160, 170), fTractionCurveMax: 2.7, fTractionCurveMin: 2.35, fTractionCurveLateral: 24,
    fBrakeForce: 1.3, fBrakeBiasFront: 0.55, fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.2, 2, 6), fAntiRollBarForce: 1.7, fTractionBiasFront: 0.49, fSteeringLock: 45 }) },
  { id: 'race', name: 'Race', desc: 'All-out competition setup.', compute: (f) => ({
    fInitialDriveForce: 0.43, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 165, 185), fInitialDragCoeff: clampN((f.fInitialDragCoeff ?? 8) - 1.3, 5, 20),
    fTractionCurveMax: 2.85, fTractionCurveMin: 2.45, fTractionCurveLateral: 25, fBrakeForce: 1.4, fBrakeBiasFront: 0.55, fAntiRollBarForce: 1.9,
    fClutchChangeRateScaleUpShift: 4, fClutchChangeRateScaleDownShift: 4, fSteeringLock: 45 }) },
  { id: 'drift', name: 'Drift', desc: 'Loose rear, RWD, big steering lock.', compute: () => ({
    fDriveBiasFront: 0, fTractionCurveMax: 1.7, fTractionCurveMin: 1.1, fTractionBiasFront: 0.56, fLowSpeedTractionLossMult: 1.4,
    fBrakeForce: 0.9, fHandBrakeForce: 1.2, fSteeringLock: 50, fAntiRollBarForce: 0.7 }) },
  { id: 'drag', name: 'Drag', desc: 'Straight-line launch monster.', compute: (f) => ({
    fInitialDriveForce: 0.46, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 160, 190), fInitialDragCoeff: clampN((f.fInitialDragCoeff ?? 8) - 1.5, 5, 20),
    nInitialDriveGears: Math.max(f.nInitialDriveGears ?? 4, 5), fTractionCurveMax: 2.5, fLowSpeedTractionLossMult: 0.7, fBrakeForce: 0.85, fSteeringLock: 32 }) },
  { id: 'rally', name: 'Rally', desc: 'AWD, long travel, loose-surface grip.', compute: (f) => ({
    fDriveBiasFront: 0.4, fTractionCurveMax: 2.1, fTractionCurveMin: 1.8, fTractionLossMult: clampN((f.fTractionLossMult ?? 1) * 0.7, 0.2, 2),
    fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.05, 1.5, 5), fSuspensionRaise: 0.05, fAntiRollBarForce: 0.9, fBrakeForce: 1.0, fSteeringLock: 44 }) },
  { id: 'offroad', name: 'Off-Road', desc: 'Raised, soft, traction on rough ground.', compute: (f) => ({
    fDriveBiasFront: 0.5, fTractionCurveMax: 1.8, fTractionLossMult: clampN((f.fTractionLossMult ?? 1) * 0.6, 0.2, 2), fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.15, 1.5, 6),
    fSuspensionRaise: 0.12, fSuspensionUpperLimit: Math.max(f.fSuspensionUpperLimit ?? 0.15, 0.2), fBrakeForce: 0.95, fSteeringLock: 40 }) },
  { id: 'grip', name: 'Grip', desc: 'Glued to the road for cornering.', compute: () => ({
    fTractionCurveMax: 2.8, fTractionCurveMin: 2.4, fTractionCurveLateral: 24, fLowSpeedTractionLossMult: 0.8, fAntiRollBarForce: 1.6, fBrakeForce: 1.1, fSteeringLock: 44 }) },
  { id: 'police', name: 'Police', desc: 'Fast, planted pursuit setup.', compute: (f) => ({
    fInitialDriveForce: 0.37, fInitialDriveMaxFlatVel: Math.max(f.fInitialDriveMaxFlatVel ?? 150, 165), fTractionCurveMax: 2.4, fTractionCurveMin: 2.1,
    fBrakeForce: 1.15, fBrakeBiasFront: 0.5, fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.05, 1.6, 5), fAntiRollBarForce: 1.3, fSteeringLock: 42 }) },
  { id: 'heavy', name: 'Heavy Duty', desc: 'Tuned around a heavy chassis.', compute: (f) => ({
    fInitialDriveForce: clampN(0.18 + (f.fMass ?? 2000) / 20000, 0.22, 0.36), fTractionCurveMax: 1.7, fTractionCurveMin: 1.5,
    fBrakeForce: clampN(0.75 + (f.fMass ?? 2000) / 30000, 0.75, 1.2), fSuspensionForce: clampN((f.fSuspensionForce ?? 2) * 1.1, 1.6, 6),
    nInitialDriveGears: Math.max(f.nInitialDriveGears ?? 5, 6), fSteeringLock: 38 }) },
];
export const getPreset = (id: string) => HANDLING_PRESETS.find((p) => p.id === id);

// ── Vehicle-aware Smart Tune (requirements #6 & #7) ──────────────────────────
export type TuneGoal =
  | 'balanced' | 'faster' | 'acceleration' | 'topspeed' | 'braking'
  | 'cornering' | 'grip' | 'drift' | 'drag' | 'track' | 'offroad' | 'stable' | 'oem';
export type DriveStyle = 'casual' | 'aggressive' | 'competitive' | 'arcade' | 'realistic';
export interface TunePriorities { topSpeed: number; acceleration: number; braking: number; cornering: number; stability: number; grip: number; }
export interface SmartTuneRequest { goal: TuneGoal; style: DriveStyle; priorities: Partial<TunePriorities>; }

export const TUNE_GOALS: { id: TuneGoal; name: string; desc: string }[] = [
  { id: 'balanced', name: 'Balanced', desc: 'Well-rounded improvement.' },
  { id: 'faster', name: 'Faster', desc: 'More pace overall.' },
  { id: 'acceleration', name: 'Better acceleration', desc: 'Quicker off the line.' },
  { id: 'topspeed', name: 'Higher top speed', desc: 'Raise the ceiling.' },
  { id: 'braking', name: 'Better braking', desc: 'Shorter, stabler stops.' },
  { id: 'cornering', name: 'Better cornering', desc: 'Sharper turn-in, flatter.' },
  { id: 'grip', name: 'More grip', desc: 'Maximise available traction.' },
  { id: 'drift', name: 'Drift', desc: 'Controllable oversteer.' },
  { id: 'drag', name: 'Drag', desc: 'Straight-line launch.' },
  { id: 'track', name: 'Track', desc: 'Balanced competition pace.' },
  { id: 'offroad', name: 'Off-road', desc: 'Grip on rough ground.' },
  { id: 'stable', name: 'Stable', desc: 'Planted and predictable.' },
  { id: 'oem', name: 'Realistic OEM-style', desc: 'Sensible factory-like values.' },
];
export const DRIVE_STYLES: { id: DriveStyle; name: string }[] = [
  { id: 'casual', name: 'Casual' }, { id: 'aggressive', name: 'Aggressive' },
  { id: 'competitive', name: 'Competitive' }, { id: 'arcade', name: 'Arcade' }, { id: 'realistic', name: 'Realistic' },
];

const styleGain: Record<DriveStyle, number> = { casual: 0.5, realistic: 0.6, aggressive: 1.0, competitive: 1.15, arcade: 1.4 };

/**
 * Vehicle-aware Smart Tune. Reasons from the vehicle's EXISTING values (mass,
 * drive force, gears, drivetrain, drive bias, traction, suspension, brake force,
 * top-speed cap) and nudges them toward the chosen goal — scaled by driving style
 * and per-axis priorities (0–2, 1 = neutral). It never slams every car to the
 * same numbers: a heavy SUV keeps more of its mass-appropriate values than a
 * light sports car, and FWD/AWD/RWD are respected.
 */
export function smartTuneCompute(f: Record<string, number>, req: SmartTuneRequest): Record<string, number> {
  const g = styleGain[req.style] ?? 1;
  const P = (k: keyof TunePriorities) => clampN(req.priorities?.[k] ?? 1, 0, 2);
  const mass = num(f, 'fMass', 1500);
  const heavy = clampN((mass - 1200) / 2000, 0, 1);          // 0 = light, 1 = very heavy
  const light = 1 - heavy;
  const bias = num(f, 'fDriveBiasFront', 0.5);
  const isFwd = bias >= 0.85, isRwd = bias <= 0.15;
  const out: Record<string, number> = {};

  const drive0 = num(f, 'fInitialDriveForce', 0.3);
  const flat0 = num(f, 'fInitialDriveMaxFlatVel', 150);
  const drag0 = num(f, 'fInitialDragCoeff', 8.5);
  const tMax0 = num(f, 'fTractionCurveMax', 2.0);
  const tMin0 = num(f, 'fTractionCurveMin', tMax0 - 0.3);
  const brake0 = num(f, 'fBrakeForce', 0.7);
  const susp0 = num(f, 'fSuspensionForce', 2);
  const arb0 = num(f, 'fAntiRollBarForce', 0.6);
  const lock0 = num(f, 'fSteeringLock', 40);

  // Relative bump helpers — scaled by style gain and, for power, by how heavy the car is.
  const addPower = (base: number) => { out.fInitialDriveForce = clampN(drive0 + base * g * (0.7 + light * 0.5) * P('acceleration'), 0.12, 0.5); };
  const addTop = (base: number) => {
    out.fInitialDriveMaxFlatVel = clampN(flat0 * (1 + base * g * 0.12 * P('topSpeed')), flat0, 260);
    out.fInitialDragCoeff = clampN(drag0 * (1 - base * g * 0.06), 5, drag0);
  };
  const addGrip = (base: number) => {
    out.fTractionCurveMax = clampN(tMax0 + base * g * 0.5 * P('grip'), 0.8, 3.0);
    out.fTractionCurveMin = clampN(Math.min(tMin0 + base * g * 0.45, (out.fTractionCurveMax ?? tMax0) - 0.05), 0.6, 3.0);
  };
  const addBrakes = (base: number) => { out.fBrakeForce = clampN(brake0 + base * g * 0.35 * P('braking'), 0.4, 2.0); };
  const addCorner = (base: number) => {
    out.fAntiRollBarForce = clampN(arb0 + base * g * 0.8 * P('cornering'), 0, 3);
    out.fSuspensionForce = clampN(susp0 * (1 + base * g * 0.12), 1.2, 6);
  };
  const addStability = (base: number) => {
    out.fTractionBiasFront = clampN(0.5 + (isRwd ? 0.005 : 0) , 0.47, 0.52); // gently centre balance
    out.fAntiRollBarForce = clampN(arb0 + base * g * 0.5 * P('stability'), 0, 3);
    if ('fSuspensionForce' in f) out.fSuspensionForce = clampN(susp0 * (1 + base * g * 0.08), 1.2, 6);
  };

  switch (req.goal) {
    case 'balanced': addPower(0.03); addGrip(0.25); addBrakes(0.2); addCorner(0.3); break;
    case 'faster': addPower(0.05); addTop(0.6); addGrip(0.2); addBrakes(0.2); break;
    case 'acceleration': addPower(0.07); if ('nInitialDriveGears' in f) out.nInitialDriveGears = Math.max(num(f, 'nInitialDriveGears', 5), heavy > 0.6 ? 6 : 5); addGrip(0.15); break;
    case 'topspeed': addTop(1.0); addPower(0.02); break;
    case 'braking': addBrakes(0.6); out.fBrakeBiasFront = clampN(0.52, 0.5, 0.55); break;
    case 'cornering': addCorner(0.6); addGrip(0.2); out.fSteeringLock = clampN(lock0 + 2, 30, 48); break;
    case 'grip': addGrip(0.7); out.fLowSpeedTractionLossMult = clampN(num(f, 'fLowSpeedTractionLossMult', 1) * 0.85, 0.4, 2); addCorner(0.3); break;
    case 'drift':
      out.fTractionCurveMax = clampN(tMax0 - 0.3 * g, 1.2, tMax0);
      out.fTractionBiasFront = clampN(0.54, 0.5, 0.58);
      out.fLowSpeedTractionLossMult = clampN(num(f, 'fLowSpeedTractionLossMult', 1) * (1 + 0.4 * g), 0.5, 2.5);
      out.fSteeringLock = clampN(lock0 + 8 * g, 40, 55);
      out.fHandBrakeForce = clampN(num(f, 'fHandBrakeForce', 0.7) + 0.3, 0.5, 3);
      if (isFwd) out.fDriveBiasFront = 0.3; // a drift car shouldn't stay FWD
      break;
    case 'drag':
      addPower(0.08); addTop(0.7);
      out.fLowSpeedTractionLossMult = clampN(num(f, 'fLowSpeedTractionLossMult', 1) * 0.6, 0.3, 2);
      out.fSteeringLock = clampN(lock0 - 6, 25, 45);
      break;
    case 'track': addPower(0.04); addGrip(0.5); addBrakes(0.5); addCorner(0.6); break;
    case 'offroad':
      out.fTractionLossMult = clampN(num(f, 'fTractionLossMult', 1) * 0.6, 0.2, 2);
      out.fSuspensionForce = clampN(susp0 * (1 + 0.12 * g), 1.4, 6);
      out.fSuspensionRaise = clampN(num(f, 'fSuspensionRaise', 0) + 0.08, -0.1, 0.4);
      if (!isRwd && !isFwd) out.fDriveBiasFront = clampN(bias, 0.4, 0.6); else out.fDriveBiasFront = 0.45;
      break;
    case 'stable': addStability(0.6); addBrakes(0.2); break;
    case 'oem':
      // Pull outliers gently back toward sensible factory-like values.
      out.fInitialDriveForce = clampN(drive0 * 0.5 + 0.3 * 0.5, 0.2, 0.36);
      out.fTractionCurveMax = clampN(tMax0 * 0.6 + 2.0 * 0.4, 1.6, 2.4);
      out.fBrakeForce = clampN(brake0 * 0.6 + 0.8 * 0.4, 0.6, 1.1);
      out.fSteeringLock = clampN(lock0 * 0.6 + 40 * 0.4, 35, 45);
      break;
  }
  // Round everything to the field's precision.
  for (const k of Object.keys(out)) out[k] = isIntField(k) ? Math.round(out[k]) : round(out[k]);
  return out;
}
