import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifySeverity } from './severity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DB_FILE || path.join(__dirname, 'incidents.db');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
export const db = new DatabaseSync(dbFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    people_affected INTEGER NOT NULL DEFAULT 1,
    contact TEXT,
    severity TEXT NOT NULL,
    severity_reasons TEXT,
    status TEXT NOT NULL DEFAULT 'Reported',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const SAMPLES = [
  ['Warehouse fire spreading to adjacent shops', 'Large fire in a plastics warehouse, thick black smoke and flames spreading rapidly to neighbouring shops. Workers evacuated but two are missing.', 'fire', 'GST Road, Chengalpattu', 14, '9840012345', 'In Progress', 35],
  ['Multi-vehicle collision on highway', 'Truck overturned and hit multiple vehicles near the toll plaza. Several people injured, one unconscious. Traffic fully blocked.', 'accident', 'NH-48 Toll Plaza, Singaperumal Koil', 9, '9791123456', 'In Progress', 80],
  ['Elderly man with chest pain', 'Neighbour reports an elderly man complaining of severe chest pain and difficulty breathing. Possible heart attack, needs ambulance.', 'medical', 'Anna Nagar 3rd Street, Maraimalai Nagar', 1, '9444098765', 'Reported', 12],
  ['Residential area flooded after heavy rain', 'Heavy overnight rainfall caused rising water in low-lying colony. Around 60 residents stranded on first floors, children and elderly among them.', 'flood', 'Vandalur Lake Colony', 60, null, 'Pending', 140],
  ['Under-construction building partially collapsed', 'Slab of a 4-storey building under construction collapsed. Labourers trapped under debris, rescue needed urgently.', 'collapse', 'OMR Phase 2, Navalur', 8, '9884455667', 'In Progress', 55],
  ['Minor two-wheeler collision', 'Two bikes collided at junction. Minor scratches, no injuries requiring hospital. Riders have exchanged details.', 'accident', 'Chengalpattu Bus Stand Junction', 2, null, 'Resolved', 200],
  ['Small kitchen fire at restaurant', 'Small grease fire in restaurant kitchen, already under control using extinguisher. Called as a precaution.', 'fire', 'Mahindra World City Food Court', 3, '9500123789', 'Resolved', 260],
  ['Waterlogging on main road', 'Minor waterlogging on the road after drizzle. Vehicles moving slowly, no one hurt.', 'flood', 'Paranur Main Road', 1, null, 'Pending', 90],
  ['Gas leak in apartment complex', 'Strong smell of gas leak reported on 3rd floor of apartment block. Residents evacuating the building, children and elderly present.', 'other', 'Sri Sai Apartments, Guduvancheri', 24, '9677012233', 'Reported', 8],
  ['Student fainted during school assembly', 'A student fainted and is conscious but weak. Teachers have given first aid, requesting medical check-up.', 'medical', 'Govt Higher Secondary School, Chengalpattu', 1, '9841134455', 'Resolved', 300],
  ['Old compound wall collapse', 'Part of a compound wall collapsed after rain, blocking the lane. No one hurt but debris needs clearing.', 'collapse', 'Pallavaram Cantonment Road', 0, null, 'Pending', 70],
  ['Fallen tree blocking road', 'Large tree fell across the road after strong winds. No injuries, road blocked.', 'other', 'ECR Link Road, Kelambakkam', 0, '9003344556', 'Reported', 20],
];

export function seedIfEmpty() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM incidents').get();
  if (c > 0) return;
  const ins = db.prepare(`INSERT INTO incidents
    (title, description, category, location, people_affected, contact, severity, severity_reasons, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  for (const [title, description, category, location, people, contact, status, minsAgo] of SAMPLES) {
    const { severity, reasons } = classifySeverity({ category, title, description, peopleAffected: people });
    const ts = new Date(now - minsAgo * 60000).toISOString();
    ins.run(title, description, category, location, people, contact, severity, JSON.stringify(reasons), status, ts, ts);
  }
}
