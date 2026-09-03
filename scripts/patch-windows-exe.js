// Embeds the real app icon + version metadata into the packaged Windows exe.
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
console.log('patch-windows-exe: done.');
