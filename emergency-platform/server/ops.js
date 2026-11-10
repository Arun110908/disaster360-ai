// Operations layer: resources, hospitals, shelters, dispatch, verification, copilot, audit.
// All rows flagged is_demo=1 are DEMONSTRATION DATA; dispatches are always simulated (no real alerting).
import { Router } from 'express';
import { findDuplicates, predictCategory, summarize } from './ai.js';

// Approximate town-level coordinates (not surveyed) used to place seeded incidents on the map.
const PLACES = { singaperumal: [12.7525, 79.9995], 'maraimalai': [12.7942, 80.0214], vandalur: [12.892, 80.081], navalur: [12.846, 80.227],
  'mahindra world': [12.73, 79.998], guduvancheri: [12.845, 80.06], paranur: [12.71, 79.99], pallavaram: [12.9675, 80.1491],
  kelambakkam: [12.796, 80.221], chengalpattu: [12.6819, 79.9888] };
export const geocode = (loc) => { const l = String(loc || '').toLowerCase(); const k = Object.keys(PLACES).find((p) => l.includes(p)); return k ? PLACES[k] : null; };

export function initOps(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available', lat REAL, lng REAL, is_demo INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS hospitals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lat REAL, lng REAL,
      beds_total INTEGER NOT NULL, beds_free INTEGER NOT NULL, phone TEXT, is_demo INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shelters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lat REAL, lng REAL,
      capacity INTEGER NOT NULL, occupancy INTEGER NOT NULL DEFAULT 0, food INTEGER DEFAULT 0, water INTEGER DEFAULT 0,
      medical INTEGER DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id INTEGER NOT NULL, resource_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Assigned', assigned_at TEXT NOT NULL, arrived_at TEXT, completed_at TEXT, simulated INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
  `);
  const cols = db.prepare('PRAGMA table_info(incidents)').all().map((c) => c.name);
  for (const [c, def] of [['lat', 'REAL'], ['lng', 'REAL'], ['verified', 'INTEGER NOT NULL DEFAULT 0']])
    if (!cols.includes(c)) db.exec(`ALTER TABLE incidents ADD COLUMN ${c} ${def}`);
  for (const r of db.prepare('SELECT id, location FROM incidents WHERE lat IS NULL').all()) {
    const g = geocode(r.location); if (g) db.prepare('UPDATE incidents SET lat=?, lng=? WHERE id=?').run(g[0], g[1], r.id);
  }
  if (db.prepare('SELECT COUNT(*) c FROM resources').get().c === 0) {
    const R = db.prepare('INSERT INTO resources (name,type,lat,lng) VALUES (?,?,?,?)');
    [['Demo Ambulance A1', 'ambulance', 12.6819, 79.9888], ['Demo Ambulance A2', 'ambulance', 12.7942, 80.0214], ['Demo Ambulance A3', 'ambulance', 12.892, 80.081],
      ['Demo Rescue Team R1', 'rescue', 12.7525, 79.9995], ['Demo Rescue Team R2', 'rescue', 12.846, 80.06], ['Demo Fire Unit F1', 'fire', 12.6819, 79.9888],
      ['Demo Fire Unit F2', 'fire', 12.846, 80.227]].forEach((r) => R.run(...r));
    const H = db.prepare('INSERT INTO hospitals (name,lat,lng,beds_total,beds_free,updated_at) VALUES (?,?,?,?,?,?)'), now = new Date().toISOString();
    [['Demo Hospital A (Chengalpattu)', 12.69, 79.98, 120, 14], ['Demo Hospital B (Maraimalai Nagar)', 12.79, 80.02, 80, 0], ['Demo Hospital C (Guduvancheri)', 12.84, 80.06, 60, 9]].forEach((h) => H.run(...h, now));
    const S = db.prepare('INSERT INTO shelters (name,lat,lng,capacity,occupancy,food,water,medical) VALUES (?,?,?,?,?,?,?,?)');
    [['Demo Shelter - Community Hall 1', 12.7, 79.99, 200, 60, 1, 1, 1], ['Demo Shelter - School Hall 2', 12.89, 80.08, 150, 148, 1, 1, 0]].forEach((s) => S.run(...s));
  }
}

const audit = (db, action, detail) => db.prepare('INSERT INTO audit_log (at,action,detail) VALUES (?,?,?)').run(new Date().toISOString(), action, JSON.stringify(detail));
const km = (a, b) => { const r = (x) => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const NEEDS = { fire: ['fire', 'rescue'], accident: ['ambulance', 'rescue'], medical: ['ambulance'], flood: ['rescue'], collapse: ['rescue', 'ambulance', 'fire'], other: ['rescue'] };
const HOSP = new Set(['accident', 'medical', 'collapse']);

// Resource recommendation: nearest AVAILABLE unit of each needed type; hospital with free beds / shelter with space.
export function recommend(db, inc) {
  const at = inc.lat != null ? [inc.lat, inc.lng] : null;
  const dist = (r) => (at && r.lat != null ? +km(at, [r.lat, r.lng]).toFixed(1) : null);
  const nearest = (rows) => rows.map((r) => ({ ...r, distanceKm: dist(r) })).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  const units = (NEEDS[inc.category] || NEEDS.other).flatMap((t) =>
    nearest(db.prepare("SELECT * FROM resources WHERE type=? AND status='available'").all(t)).slice(0, ['Critical', 'High'].includes(inc.severity) ? 2 : 1));
  return { located: !!at, note: at ? 'Distances are straight-line estimates.' : 'Incident has no coordinates; ordering is arbitrary.', units,
    hospital: HOSP.has(inc.category) ? nearest(db.prepare('SELECT * FROM hospitals WHERE beds_free>0').all())[0] || null : null,
    shelter: ['flood', 'fire', 'other'].includes(inc.category) ? nearest(db.prepare('SELECT * FROM shelters WHERE occupancy<capacity').all())[0] || null : null };
}

// Copilot: answers ONLY from database queries; unknown questions get a refusal, never a guess.
export function copilot(db, q) {
  const s = String(q || '').toLowerCase(), rows = (sql, ...p) => db.prepare(sql).all(...p);
  if (/critical/.test(s)) { const d = rows("SELECT id,title,location,status FROM incidents WHERE severity='Critical' ORDER BY created_at DESC");
    return { answer: `${d.length} critical incident(s).`, data: d }; }
  if (/unresolved|open|active/.test(s)) { const c = db.prepare("SELECT COUNT(*) c FROM incidents WHERE status!='Resolved'").get().c;
    return { answer: `${c} incident(s) are unresolved.`, data: [] }; }
  if (/resource|available|ambulance|team/.test(s)) { const d = rows("SELECT name,type FROM resources WHERE status='available'");
    return { answer: `${d.length} resource(s) available (demonstration data).`, data: d }; }
  if (/area|highest|most/.test(s)) { const m = {}; for (const r of rows('SELECT location FROM incidents')) { const a = r.location.split(',').pop().trim(); m[a] = (m[a] || 0) + 1; }
    const d = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([area, count]) => ({ area, count }));
    return { answer: d.length ? `${d[0].area} has the most reports (${d[0].count}).` : 'No incidents recorded.', data: d.slice(0, 5) }; }
  if (/verif/.test(s)) { const d = rows("SELECT id,title,location FROM incidents WHERE verified=0 AND status!='Resolved'");
    return { answer: `${d.length} unresolved report(s) have not been verified.`, data: d }; }
  if (/summar|today/.test(s)) { const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const d = rows('SELECT * FROM incidents WHERE created_at>=? ORDER BY created_at DESC', since);
    return { answer: d.length ? `${d.length} incident(s) in the last 24h.` : 'No incidents in the last 24h.', data: d.map((i) => summarize(i)) }; }
  return { answer: 'I can only answer from stored data. Try: critical incidents, unresolved count, available resources, busiest area, reports needing verification, or today\'s summary.', data: [] };
}

export function opsRouter(db) {
  const r = Router(), get = (id) => db.prepare('SELECT * FROM incidents WHERE id=?').get(Number(id));
  r.get('/resources', (_q, s) => s.json(db.prepare('SELECT * FROM resources').all()));
  r.get('/hospitals', (_q, s) => s.json(db.prepare('SELECT * FROM hospitals').all()));
  r.get('/shelters', (_q, s) => s.json(db.prepare('SELECT *, CASE WHEN occupancy*1.0/capacity>=0.9 THEN 1 ELSE 0 END AS capacity_alert FROM shelters').all()));
  r.get('/map', (_q, s) => s.json({ incidents: db.prepare('SELECT id,title,category,severity,status,lat,lng FROM incidents WHERE lat IS NOT NULL').all(),
    resources: db.prepare('SELECT * FROM resources').all(), hospitals: db.prepare('SELECT * FROM hospitals').all(), shelters: db.prepare('SELECT * FROM shelters').all() }));
  r.post('/ai/analyze', (q, s) => { const b = q.body || {}; s.json({ category: predictCategory(`${b.title} ${b.description}`), duplicates: findDuplicates(db, b) }); });
  r.get('/incidents/:id/duplicates', (q, s) => { const i = get(q.params.id); i ? s.json(findDuplicates(db, i, i.id)) : s.status(404).json({ error: 'Incident not found' }); });
  r.get('/incidents/:id/recommend', (q, s) => { const i = get(q.params.id); i ? s.json(recommend(db, i)) : s.status(404).json({ error: 'Incident not found' }); });
  r.post('/incidents/:id/verify', (q, s) => { const i = get(q.params.id); if (!i) return s.status(404).json({ error: 'Incident not found' });
    db.prepare('UPDATE incidents SET verified=1, updated_at=? WHERE id=?').run(new Date().toISOString(), i.id); audit(db, 'verify', { incident: i.id }); s.json({ ok: true }); });
  r.post('/incidents/:id/assign', (q, s) => { const i = get(q.params.id), res = db.prepare('SELECT * FROM resources WHERE id=?').get(Number(q.body?.resourceId));
    if (!i || !res) return s.status(404).json({ error: 'Incident or resource not found' });
    if (res.status !== 'available') return s.status(409).json({ error: 'Resource is not available' });
    const info = db.prepare('INSERT INTO assignments (incident_id,resource_id,assigned_at) VALUES (?,?,?)').run(i.id, res.id, new Date().toISOString());
    db.prepare("UPDATE resources SET status='dispatched' WHERE id=?").run(res.id); audit(db, 'assign', { incident: i.id, resource: res.id, simulated: true });
    s.status(201).json({ id: Number(info.lastInsertRowid), simulated: true, note: 'SIMULATED dispatch: no real unit has been alerted.' }); });
  r.patch('/assignments/:id', (q, s) => { const a = db.prepare('SELECT * FROM assignments WHERE id=?').get(Number(q.params.id)), st = q.body?.status;
    if (!a) return s.status(404).json({ error: 'Assignment not found' });
    if (!['On Scene', 'Completed'].includes(st)) return s.status(400).json({ error: 'Invalid status' });
    const now = new Date().toISOString();
    db.prepare('UPDATE assignments SET status=?, arrived_at=COALESCE(arrived_at,?), completed_at=? WHERE id=?').run(st, now, st === 'Completed' ? now : null, a.id);
    if (st === 'Completed') db.prepare("UPDATE resources SET status='available' WHERE id=?").run(a.resource_id);
    audit(db, 'assignment', { id: a.id, status: st }); s.json({ ok: true }); });
  r.get('/ops/stats', (_q, s) => s.json({ avgResponseMinutes: db.prepare(`SELECT ROUND(AVG((julianday(a.arrived_at)-julianday(i.created_at))*1440),1) v FROM assignments a JOIN incidents i ON i.id=a.incident_id WHERE a.arrived_at IS NOT NULL`).get().v,
    resourcesAvailable: db.prepare("SELECT COUNT(*) c FROM resources WHERE status='available'").get().c, resourcesTotal: db.prepare('SELECT COUNT(*) c FROM resources').get().c,
    unverified: db.prepare("SELECT COUNT(*) c FROM incidents WHERE verified=0 AND status!='Resolved'").get().c, dataMode: 'demonstration' }));
  r.post('/copilot', (q, s) => s.json(copilot(db, q.body?.question)));
  return r;
}
