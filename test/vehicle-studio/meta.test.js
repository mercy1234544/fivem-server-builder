// Unit tests for the pure handling-metadata engine (dist/main/shared/handlingMeta.js).
const M = require(require('path').resolve(__dirname, '../../dist/main/shared/handlingMeta.js'));
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  \u2717', name); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// Sample vehicles.
const sports = { fMass: 1400, fInitialDriveForce: 0.30, fInitialDriveMaxFlatVel: 150, fInitialDragCoeff: 8.5, fDriveInertia: 1.0,
  fBrakeForce: 0.8, fBrakeBiasFront: 0.5, fTractionCurveMax: 2.2, fTractionCurveMin: 1.9, fTractionCurveLateral: 20, fTractionBiasFront: 0.5,
  fLowSpeedTractionLossMult: 1.0, fDriveBiasFront: 0.0, nInitialDriveGears: 6, fSuspensionForce: 2.2, fAntiRollBarForce: 0.6,
  fSteeringLock: 40, fHandBrakeForce: 0.7, fCollisionDamageMult: 1, fDeformationDamageMult: 1, fEngineDamageMult: 1.5,
  fSuspensionUpperLimit: 0.12, fSuspensionLowerLimit: -0.14, fSuspensionRaise: 0, fTractionLossMult: 1 };
const suv = { ...sports, fMass: 2800, fInitialDriveForce: 0.24, fDriveBiasFront: 0.5, nInitialDriveGears: 6, fTractionCurveMax: 1.9 };
const fwd = { ...sports, fDriveBiasFront: 1.0 };
const present = new Set(Object.keys(sports));

// ── FIELD_META coverage ──
for (const g of M.HANDLING_GROUPS) for (const fld of g.fields) {
  ok(`meta covers ${fld}`, !!M.FIELD_META[fld] && M.FIELD_META[fld].group === g.id);
}
ok('fieldLabel known', M.fieldLabel('fInitialDriveForce') === 'Drive force');
ok('fieldLabel fallback', M.fieldLabel('fWeirdUnknown') === 'Weird Unknown');
ok('formatValue int', M.formatValue('nInitialDriveGears', 6.4) === '6');
ok('formatValue float', M.formatValue('fBrakeForce', 1) === '1.000000');
ok('decimalsOf int', M.decimalsOf('nInitialDriveGears') === 0);

// ── Warnings ──
ok('warn ok in-range', M.fieldWarning('fTractionCurveMax', 2.2).level === 'ok');
ok('warn out-of-range', M.fieldWarning('fTractionCurveMax', 3.5).level === 'warn');
ok('warn extreme high', M.fieldWarning('fTractionCurveMax', 50).level === 'extreme');
ok('warn extreme drive', M.fieldWarning('fInitialDriveForce', 1.9).level === 'extreme');
ok('warn brake extreme', M.fieldWarning('fBrakeForce', 4).level === 'extreme');

// ── Health ──
ok('health good (stock sports)', M.groupHealth('traction', sports).health === 'good');
ok('health warn', M.groupHealth('traction', { ...sports, fTractionCurveMax: 3.5 }).health === 'warning');
ok('health extreme value', M.groupHealth('braking', { ...sports, fBrakeForce: 6 }).health === 'extreme');
ok('health cross-check traction min>max', M.groupHealth('traction', { ...sports, fTractionCurveMin: 2.9, fTractionCurveMax: 2.2 }).health === 'extreme');
ok('health cross-check suspension limits', M.groupHealth('suspension', { ...sports, fSuspensionUpperLimit: 0.1, fSuspensionLowerLimit: 0.2 }).health === 'extreme');

// ── Metrics ──
const mx = M.computeMetrics(sports);
ok('metrics count = 10', mx.length === 10);
ok('metric keys', ['topSpeed','acceleration','braking','traction','cornering','stability','drivetrain','driveBias','weight','damageResistance'].every(k => mx.find(m => m.key === k)));
ok('weight measured kg', mx.find(m => m.key === 'weight').display === '1400 kg');
ok('drivetrain RWD from bias 0', mx.find(m => m.key === 'drivetrain').display === 'RWD');
ok('drivetrain FWD from bias 1', M.computeMetrics(fwd).find(m => m.key === 'drivetrain').display === 'FWD');
ok('drivetrain AWD from bias .5', M.computeMetrics(suv).find(m => m.key === 'drivetrain').display === 'AWD');
ok('topSpeed is estimate + mph', /mph$/.test(mx.find(m=>m.key==='topSpeed').display) && mx.find(m=>m.key==='topSpeed').kind === 'estimate');
const faster = M.computeMetrics({ ...sports, fInitialDriveMaxFlatVel: 200 });
ok('higher flatVel -> higher topSpeed metric', faster.find(m=>m.key==='topSpeed').value > mx.find(m=>m.key==='topSpeed').value);
const grippier = M.computeMetrics({ ...sports, fTractionCurveMax: 2.8 });
ok('more grip -> higher traction metric', grippier.find(m=>m.key==='traction').value > mx.find(m=>m.key==='traction').value);
const idxKeys = ['acceleration','braking','traction','cornering','stability','damageResistance'];
ok('all indices within 0..100', mx.filter(m=>idxKeys.includes(m.key)).every(m => m.value >= 0 && m.value <= 100));

// ── diffTargets ──
const dt = M.diffTargets(sports, { fBrakeForce: 1.2, fTractionCurveMax: 2.2, fNotPresentField: 5, fInitialDriveForce: 0.35 }, present);
ok('diff drops unchanged (tractionMax 2.2->2.2)', !dt.find(d => d.name === 'fTractionCurveMax'));
ok('diff drops not-present field', !dt.find(d => d.name === 'fNotPresentField'));
ok('diff keeps changed brake', dt.find(d => d.name === 'fBrakeForce' && near(d.to, 1.2)));
ok('diff keeps changed drive', dt.find(d => d.name === 'fInitialDriveForce' && near(d.to, 0.35)));

// ── Presets ──
ok('preset list has 15', M.HANDLING_PRESETS.length === 15);
ok('stock is special', M.getPreset('stock').special === 'stock');
for (const p of M.HANDLING_PRESETS) {
  if (p.special === 'stock') continue;
  const targets = p.compute(sports);
  ok(`preset ${p.id} returns targets`, targets && Object.keys(targets).length > 0);
  const d = M.diffTargets(sports, targets, present);
  ok(`preset ${p.id} produces a real diff`, d.length > 0);
}
ok('drift preset lowers traction', M.getPreset('drift').compute(sports).fTractionCurveMax < sports.fTractionCurveMax);
ok('drift preset RWD bias', M.getPreset('drift').compute(sports).fDriveBiasFront === 0);
ok('heavy preset mass-aware (SUV drive > sports drive from heavy preset)',
   M.getPreset('heavy').compute(suv).fInitialDriveForce > M.getPreset('heavy').compute(sports).fInitialDriveForce);

// ── Smart Tune vehicle-awareness (requirement #7) ──
const stReq = (goal, style='aggressive', priorities={}) => ({ goal, style, priorities });
const accLight = M.smartTuneCompute(sports, stReq('acceleration')).fInitialDriveForce;
const accHeavy = M.smartTuneCompute(suv, stReq('acceleration')).fInitialDriveForce;
ok('smart tune vehicle-aware: light car gets more added power than heavy',
   (accLight - sports.fInitialDriveForce) > (accHeavy - suv.fInitialDriveForce));
ok('smart tune starts from existing values (heavy SUV drive != light car drive)', accLight !== accHeavy);
const driftFwd = M.smartTuneCompute(fwd, stReq('drift'));
ok('smart tune drift flips FWD -> not FWD', driftFwd.fDriveBiasFront !== undefined && driftFwd.fDriveBiasFront < 0.85);
const driftGrip = M.smartTuneCompute(sports, stReq('drift'));
ok('smart tune drift does NOT maximise traction', driftGrip.fTractionCurveMax < sports.fTractionCurveMax);
const casual = M.smartTuneCompute(sports, stReq('faster','casual'));
const arcade = M.smartTuneCompute(sports, stReq('faster','arcade'));
ok('smart tune style scaling: arcade adds more power than casual',
   (arcade.fInitialDriveForce - sports.fInitialDriveForce) > (casual.fInitialDriveForce - sports.fInitialDriveForce));
const pHi = M.smartTuneCompute(sports, stReq('grip','competitive',{ grip: 2 }));
const pLo = M.smartTuneCompute(sports, stReq('grip','competitive',{ grip: 0.2 }));
ok('smart tune priority scaling: high grip priority adds more grip',
   pHi.fTractionCurveMax > pLo.fTractionCurveMax);
ok('smart tune topspeed raises flatVel', M.smartTuneCompute(sports, stReq('topspeed')).fInitialDriveMaxFlatVel > sports.fInitialDriveMaxFlatVel);
ok('smart tune braking raises brake force', M.smartTuneCompute(sports, stReq('braking')).fBrakeForce > sports.fBrakeForce);
// Values stay in workable bounds (no extreme output from a normal request)
const tuned = M.smartTuneCompute(sports, stReq('faster'));
const tunedMerged = { ...sports, ...tuned };
ok('smart tune output not extreme', Object.keys(tuned).every(k => M.fieldWarning(k, tunedMerged[k]).level !== 'extreme'));

console.log(`\nMETA ENGINE TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
