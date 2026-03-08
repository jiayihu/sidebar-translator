#!/usr/bin/env node
// Usage: node scripts/release.js [patch|minor|major]
// Defaults to patch bump.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const bumpType = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Invalid bump type: ${bumpType}. Use patch, minor, or major.`);
  process.exit(1);
}

// 1. Bump version in package.json and manifest.json
const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'manifest.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const newVersion = bumpVersion(pkg.version, bumpType);
console.log(`Bumping version: ${pkg.version} → ${newVersion}`);

pkg.version = newVersion;
manifest.version = newVersion;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 2. Build
console.log('\nBuilding...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// 3. Zip dist/
const zipPath = resolve(root, 'extension.zip');
console.log(`\nZipping dist/ → extension.zip`);
execSync(`zip -r "${zipPath}" .`, { cwd: resolve(root, 'dist'), stdio: 'inherit' });

console.log(`\nDone! extension.zip is ready for upload (v${newVersion})`);
