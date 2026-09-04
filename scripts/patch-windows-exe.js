// Embeds the real app icon + version metadata into the packaged Windows exe,
// and writes the app-update.yml the packaged app's autoUpdater needs.
//
// Why this exists: electron-builder normally does this itself via its
// "signAndEditExecutable" step (rcedit under the hood), but that step also
// unconditionally extracts a macOS-signing sub-archive (winCodeSign) that
// requires a Windows privilege (symlink creation) this build environment
// doesn't have — so that step is disabled in package.json and the exe would
// otherwise keep Electron's stock icon/identity forever. This script runs the
// same rcedit tool by hand, vendored in build-tools/, against the already
// -packaged app from `electron-builder --win --dir`, before the separate NSIS
// packaging pass (`electron-builder --win --prepackaged ...`) turns it into
// the installer. See package.json's "build:exe" script for the full sequence.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const productName = pkg.build.productName;
const version = pkg.version;

const rcedit = path.join(root, 'build-tools', 'rcedit-x64.exe');
const exePath = path.join(root, 'releases', 'win-unpacked', `${productName}.exe`);
const iconPath = path.join(root, pkg.build.win.icon);

for (const [label, p] of [['rcedit', rcedit], ['packaged exe', exePath], ['icon', iconPath]]) {
  if (!fs.existsSync(p)) {
    console.error(`patch-windows-exe: ${label} not found at ${p}`);
    console.error('Run "npx electron-builder --win --dir --publish never" first.');
    process.exit(1);
  }
}

const args = [
  exePath,
  '--set-icon', iconPath,
  '--set-version-string', 'ProductName', productName,
  '--set-version-string', 'FileDescription', productName,
  '--set-version-string', 'CompanyName', productName,
  '--set-version-string', 'LegalCopyright', productName,
  '--set-version-string', 'OriginalFilename', `${productName}.exe`,
  '--set-version-string', 'InternalName', productName,
  '--set-product-version', version,
  '--set-file-version', version,
];

console.log(`patch-windows-exe: setting icon + version info (${productName} ${version}) on ${exePath}`);
execFileSync(rcedit, args, { stdio: 'inherit' });

// electron-builder writes resources/app-update.yml (which autoUpdater.
// checkForUpdates() needs at runtime) only while packaging a real installer
// target in one shot. Our --dir step is a plain directory target (so this
// script has something to run rcedit against) and never writes it, and the
// later `--prepackaged` NSIS pass reuses this directory as-is without
// repeating that part of packaging — so it was silently missing from every
// installed build produced by this two-step flow, and autoUpdater has been
// throwing ENOENT on it ever since (confirmed present in the already-published
// v1.78.0 installer too, so this predates this fix). Content matches exactly
// what electron-builder itself generates from the "publish" config, and is
// stable across builds/versions.
const publishCfg = Array.isArray(pkg.build.publish) ? pkg.build.publish[0] : pkg.build.publish;
const appUpdateYml = `owner: ${publishCfg.owner}\nrepo: ${publishCfg.repo}\nprovider: ${publishCfg.provider}\nupdaterCacheDirName: ${pkg.name}-updater\n`;
const resourcesDir = path.join(root, 'releases', 'win-unpacked', 'resources');
fs.writeFileSync(path.join(resourcesDir, 'app-update.yml'), appUpdateYml, 'utf-8');
console.log(`patch-windows-exe: wrote app-update.yml (${publishCfg.provider}/${publishCfg.owner}/${publishCfg.repo})`);

console.log('patch-windows-exe: done.');
