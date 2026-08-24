// Phase 1b service tests: baseline/original, diff, reset field/category/all,
// handling presets (incl. stock=revert), smart tune, and the CRITICAL round-trip
// import -> edit -> preset -> smart tune -> save -> export -> re-import.
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { VehicleStudio } = require(require('path').resolve(__dirname, '../../dist/main/services/VehicleStudio.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  \u2717', name); } };

const HANDLING = `<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
 <HandlingData>
  <Item type="CHandlingData">
   <handlingName>MYCAR</handlingName>
   <fMass value="1600.000000" />
   <fInitialDragCoeff value="8.500000" />
   <fInitialDriveForce value="0.300000" />
   <fDriveInertia value="1.000000" />
   <fInitialDriveMaxFlatVel value="150.000000" />
   <fDriveBiasFront value="0.000000" />
   <nInitialDriveGears value="6" />
   <fBrakeForce value="0.800000" />
   <fBrakeBiasFront value="0.500000" />
   <fHandBrakeForce value="0.700000" />
   <fTractionCurveMax value="2.200000" />
   <fTractionCurveMin value="1.900000" />
   <fTractionCurveLateral value="20.000000" />
   <fLowSpeedTractionLossMult value="1.000000" />
   <fTractionBiasFront value="0.500000" />
   <fSuspensionForce value="2.200000" />
   <fAntiRollBarForce value="0.600000" />
   <fSteeringLock value="40.000000" />
   <fCollisionDamageMult value="1.000000" />
   <fDeformationDamageMult value="1.000000" />
   <fEngineDamageMult value="1.500000" />
   <fWeaponDamageMult value="1.000000" />
   <SubHandlingData>
     <Item type="NULL" />
   </SubHandlingData>
  </Item>
 </HandlingData>
</CHandlingDataMgr>`;
const VEHICLES = `<CVehicleModelInfo__InitDataList>
 <InitDatas>
  <Item>
   <modelName>mycar</modelName>
   <handlingId>MYCAR</handlingId>
   <txdName>mycar</txdName>
   <gameName>MYCAR</gameName>
   <vehicleClass>VC_SPORT</vehicleClass>
  </Item>
 </InitDatas>
</CVehicleModelInfo__InitDataList>`;
const MANIFEST = `fx_version 'cerulean'\ngame 'gta5'\nfiles { 'handling.meta', 'vehicles.meta' }\ndata_file 'HANDLING_FILE' 'handling.meta'\ndata_file 'VEHICLE_METADATA_FILE' 'vehicles.meta'\n`;

function mkResource(dir, yftName = 'mycar') {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'handling.meta'), HANDLING);
  fs.writeFileSync(path.join(dir, 'vehicles.meta'), VEHICLES);
  fs.writeFileSync(path.join(dir, 'fxmanifest.lua'), MANIFEST);
  fs.writeFileSync(path.join(dir, `${yftName}.yft`), 'YFTDATA');
}
const flat = (fields) => { const o = {}; for (const f of fields) { if (f.kind === 'vector') { o[f.name+'.x']=f.x; } else o[f.name]=f.value; } return o; };

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vsstudio-'));
  const userData = path.join(base, 'userData');
  const src = path.join(base, 'mycar');
  mkResource(src);
  const svc = new VehicleStudio(userData);

  // 1. IMPORT (copy=true)
  const scan1 = await svc.scan(src, true);
  const root = scan1.root;
  ok('import scans a vehicle', scan1.vehicles.length === 1 && scan1.vehicles[0].handlingId === 'MYCAR');
  ok('baseline snapshot created', fs.existsSync(path.join(root, '.vehicle-studio-original', 'handling.meta')));

  // 2. readHandling returns original baseline == current on fresh import
  const r0 = svc.readHandling(root, 'MYCAR');
  ok('readHandling ok + original present', r0.ok && r0.original && r0.original.fMass === '1600.000000');
  ok('original matches current on fresh import', r0.original.fInitialDriveForce === '0.300000');

  // 3. EDIT a field
  const w1 = svc.writeHandling(root, 'MYCAR', [{ name: 'fMass', value: '1750.000000' }]);
  ok('edit fMass applied', w1.ok && w1.applied === 1);
  ok('edit persisted', svc.readHandling(root, 'MYCAR').fields.find(f => f.name === 'fMass').value === '1750.000000');

  // 4. handlingDiff sees original vs current
  const d1 = svc.handlingDiff(root, 'MYCAR');
  const fMassDiff = d1.changes.find(c => c.name === 'fMass');
  ok('diff shows fMass original->current', fMassDiff && fMassDiff.original === '1600.000000' && fMassDiff.current === '1750.000000');

  // 5. reset ONE field to original (not last-saved) -> 1600
  const rf = svc.resetHandlingFields(root, 'MYCAR', ['fMass']);
  ok('resetHandlingFields ok', rf.ok);
  ok('reset restores ORIGINAL imported value', svc.readHandling(root, 'MYCAR').fields.find(f => f.name === 'fMass').value === '1600.000000');

  // 6. APPLY HANDLING PRESET (sport) — preview then apply
  const pv = svc.previewHandlingPreset(root, 'MYCAR', 'sport');
  ok('preset preview returns changes', pv.ok && pv.changes.length > 0);
  ok('preset preview returns warnings array', Array.isArray(pv.warnings));
  const ap = svc.applyHandlingPreset(root, 'MYCAR', 'sport');
  ok('preset apply ok', ap.ok && ap.applied > 0);
  const afterSport = flat(svc.readHandling(root, 'MYCAR').fields);
  ok('preset changed traction to sport target', afterSport.fTractionCurveMax === '2.300000');

  // 7. SMART TUNE (vehicle-aware) apply
  const stReq = { goal: 'faster', style: 'aggressive', priorities: {} };
  const stp = svc.smartTunePreview(root, 'MYCAR', stReq);
  ok('smart tune preview ok', stp.ok && stp.changes.length > 0);
  const sta = svc.smartTuneApply(root, 'MYCAR', stReq);
  ok('smart tune apply ok', sta.ok && sta.applied > 0);

  // 8. Capture FINAL saved state
  const finalMap = flat(svc.readHandling(root, 'MYCAR').fields);

  // 9. EXPORT to a folder
  const exportDir = path.join(base, 'exports');
  const ef = svc.exportFolder(root, exportDir, 'mycar_export');
  ok('export ok', ef.ok && fs.existsSync(path.join(ef.dest, 'handling.meta')));
  ok('export EXCLUDES baseline snapshot', !fs.existsSync(path.join(ef.dest, '.vehicle-studio-original')));
  ok('export EXCLUDES backups', !fs.existsSync(path.join(ef.dest, '.vehicle-studio-backups')));

  // 10. RE-IMPORT the exported folder and verify values survived intact
  const scan2 = await svc.scan(ef.dest, true);
  const reMap = flat(svc.readHandling(scan2.root, 'MYCAR').fields);
  let mismatch = null;
  for (const k of Object.keys(finalMap)) if (finalMap[k] !== reMap[k]) { mismatch = `${k}: ${finalMap[k]} != ${reMap[k]}`; break; }
  ok('ROUND-TRIP: every saved value survives export->re-import' + (mismatch ? ` (${mismatch})` : ''), mismatch === null);
  ok('round-trip preserved fMass', reMap.fMass === finalMap.fMass);
  ok('round-trip preserved traction', reMap.fTractionCurveMax === finalMap.fTractionCurveMax);

  // 11. STOCK preset = revert to original; then diff empty
  const stockPrev = svc.previewHandlingPreset(root, 'MYCAR', 'stock');
  ok('stock preview lists current->original changes', stockPrev.ok && stockPrev.changes.length > 0 && stockPrev.changes.every(c => 'from' in c && 'to' in c));
  const stockApply = svc.applyHandlingPreset(root, 'MYCAR', 'stock');
  ok('stock apply ok', stockApply.ok);
  const afterStock = flat(svc.readHandling(root, 'MYCAR').fields);
  ok('stock restored original fMass', afterStock.fMass === '1600.000000');
  ok('stock restored original traction', afterStock.fTractionCurveMax === '2.200000');

  // 12. revertHandling leaves an empty diff
  svc.writeHandling(root, 'MYCAR', [{ name: 'fBrakeForce', value: '1.400000' }]);
  const rv = svc.revertHandling(root, 'MYCAR');
  ok('revertHandling ok', rv.ok);
  ok('after revert, diff is empty', svc.handlingDiff(root, 'MYCAR').changes.length === 0);

  // 13. category presets & smart-tune still coexist with old API (no regression)
  ok('legacy categoryPresets still works', svc.categoryPresets('Brakes').length > 0);
  ok('legacy previewTune still works', svc.previewTune(root, 'MYCAR', 'sport').ok);

  // 14. spawn report — identifies the real spawn code and validates model files
  const sr = svc.spawnReport(root);
  ok('spawnReport ok + finds the vehicle', sr.ok && sr.vehicles.length === 1);
  ok('spawnReport identifies spawn code = modelName', sr.vehicles[0].spawnCode === 'mycar');
  ok('spawnReport passes when .yft matches modelName', sr.vehicles[0].hasModel && sr.vehicles[0].level === 'ok');

  // 15. spawn report — detects the "wrong spawn code" mismatch + suggests the fix
  const mm = path.join(base, 'mismatch'); mkResource(mm, 'mycarx'); // modelName=mycar but yft=mycarx.yft (typo)
  const scanMM = await svc.scan(mm, true);
  const srMM = svc.spawnReport(scanMM.root);
  const mmv = srMM.vehicles[0];
  ok('spawnReport flags missing model file as error', mmv.level === 'error' && !mmv.hasModel);
  ok('spawnReport suggests the closest model file (typo)', mmv.suggestion === 'mycarx');

  // 16. metaDiff — edits to vehicles.meta show up as original -> current
  const wm = svc.writeMeta(root, 'vehicles', 'mycar', [{ tag: 'gameName', value: 'MYCAR2' }]);
  ok('writeMeta ok', wm.ok);
  const md = svc.metaDiff(root, 'vehicles', 'mycar');
  ok('metaDiff shows the edited field', md.ok && md.changes.some((c) => c.tag === 'gameName' && c.current === 'MYCAR2'));

  console.log(`\nSERVICE TESTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
