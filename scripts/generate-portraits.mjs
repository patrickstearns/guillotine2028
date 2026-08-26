/**
 * SVG fallback portraits for generic / unnamed roles.
 * Run: node scripts/generate-portraits.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/assets/portraits');
fs.mkdirSync(outDir, { recursive: true });

const generics = [
  ['junior_staffer', '#22c55e', 'JS'],
  ['crypto', '#8b5cf6', 'CB'],
  ['developer', '#8b5cf6', 'UD'],
  ['rival', '#8b5cf6', 'RX'],
  ['pollster', '#8b5cf6', 'CP'],
  ['analyst', '#8b5cf6', 'PA'],
  ['ceo', '#ef4444', 'CEO'],
  ['confused', '#a3a3a3', '??'],
  ['jan6', '#a3a3a3', 'J6'],
];

for (const [id, color, initials] of generics) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="#1c1917"/>
  <circle cx="80" cy="70" r="36" fill="${color}" opacity="0.85"/>
  <ellipse cx="80" cy="150" rx="52" ry="40" fill="${color}" opacity="0.7"/>
  <text x="80" y="78" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="20" font-weight="700">${initials}</text>
</svg>`;
  const dest = path.join(outDir, `${id}.svg`);
  if (!fs.existsSync(path.join(outDir, `${id}.png`))) {
    fs.writeFileSync(dest, svg);
  }
}

console.log('Wrote generic SVG fallbacks (skipped where PNG exists)');
