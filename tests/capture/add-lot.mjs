// Adds a lot copied from the app ("Card look wrong? Copy this lot's records") to the real-record test fixtures, so the card
// that looked wrong is checked from then on by test_real.mjs.
//
//   cd tests && node capture/add-lot.mjs pasted.json "what was wrong with it"
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { isOwnerish } from '../owner-fields.mjs';

const [file, note] = process.argv.slice(2);
if (!file) { console.error('usage: node capture/add-lot.mjs pasted.json "what was wrong"'); process.exit(1); }
const lot = JSON.parse(fs.readFileSync(file, 'utf8').trim());
// Any region with records (a state, or a county like TX_HARRIS); the basic card's buildings (US_SC…) have no records to keep
if (lot.housepoint !== 'lot' || !/^[A-Z]{2}(_[A-Z]+)?$/.test(lot.state) || !Array.isArray(lot.records) || !lot.records.length) throw new Error('not a lot copied from Housepoint');
if (/^US_/.test(lot.state)) throw new Error('a basic-card building: there are no records to add');
for (const r of lot.records) for (const k of Object.keys(r)) if (isOwnerish(k)) throw new Error(`owner-like field ${k}: not adding it`);

const path = fileURLToPath(new URL(`../fixtures/real-${lot.state}.json`, import.meta.url));
if (!fs.existsSync(path)) throw new Error(`no fixture file for ${lot.state} yet: capture it first`);
const set = JSON.parse(fs.readFileSync(path, 'utf8'));
const key = String(lot.key).startsWith(`${lot.state}:`) ? `shape:${String(lot.key).slice(lot.state.length + 1)}` : `id:${lot.key}`;
set.lots = set.lots.filter((l) => l.key !== key);
set.lots.unshift({ key, spot: note || 'copied from the app', kind: 'copied', named: true, records: lot.records.length, truncated: false,
  lat: lot.lat, lon: lot.lon, features: lot.records.map((a) => ({ attributes: a, geometry: { rings: lot.rings } })) });
fs.writeFileSync(path, JSON.stringify(set));
console.log(`added ${key} (${lot.records.length} records) to real-${lot.state}.json`);
