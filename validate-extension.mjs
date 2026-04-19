#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error('❌ manifest.json not found in current directory.');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error('❌ manifest.json is not valid JSON.');
  console.error(error.message);
  process.exit(1);
}

const requiredFiles = [
  manifest.background?.service_worker,
  manifest.chrome_url_overrides?.newtab,
  'app.js',
  'styles.css'
].filter(Boolean);

const missing = requiredFiles.filter((file) => !existsSync(resolve(root, file)));
if (missing.length) {
  console.error('❌ Referenced files missing:', missing.join(', '));
  process.exit(1);
}

console.log('✅ Extension structure looks valid.');
console.log(`name: ${manifest.name}`);
console.log(`version: ${manifest.version}`);
console.log(`new tab: ${manifest.chrome_url_overrides?.newtab}`);
