// Adds a lot copied from the app ("Card look wrong? Copy this lot's records") to the real-record test fixtures, so the card
// that looked wrong is checked from then on by test_real.mjs.
//
//   cd tests && node capture/add-lot.mjs pasted.json "what was wrong with it"
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const [file, note] = process.argv.slice(2);
if (!file) { console.error('usage: node capture/add-lot.mjs pasted.json "what was wrong"'); process.exit(1); }
const lot = JSON.parse(fs.readFileSync(file, 'utf8').trim());
if (lot.housepoint !== 'lot' || !/^(MA|CT|NJ|FL)$/.test(lot.state) || !Array.isArray(lot.records) || !lot.records.length) throw new Error('not a lot copied from Housepoint');
for (const r of lot.records) for (const k of Object.keys(r)) if (/(^|_)OWN|OWNER|MAIL|TAXPAYER/i.test(k)) throw new Error(`owner-like field ${k}: not adding it`);

const path = fileURLToPath(new URL(`../fixtures/real-${lot.state}.json`, import.meta.url));
const set = JSON.parse(fs.readFileSync(path, 'utf8'));
const key = String(lot.key).startsWith(`${lot.state}:`) ? `shape:${String(lot.key).slice(3)}` : `id:${lot.key}`;
set.lots = set.lots.filter((l) => l.key !== key);
set.lots.unshift({ key, spot: note || 'copied from the app', kind: 'copied', named: true, records: lot.records.length, truncated: false,
  lat: lot.lat, lon: lot.lon, features: lot.records.map((a) => ({ attributes: a, geometry: { rings: lot.rings } })) });
fs.writeFileSync(path, JSON.stringify(set));
console.log(`added ${key} (${lot.records.length} records) to real-${lot.state}.json`);
