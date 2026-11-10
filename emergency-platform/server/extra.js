// Volunteers, what-if simulator (never writes to the DB), offline sync, analytics + CSV export.
import { Router } from 'express';
import { validateIncident } from './validate.js';
import { classifySeverity } from './severity.js';
import { geocode } from './ops.js';

export function initExtra(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS volunteers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, skills TEXT, contact TEXT, available INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, volunteer_id INTEGER NOT NULL, incident_id INTEGER, task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Assigned', created_at TEXT NOT NULL, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS sync_receipts (client_id TEXT PRIMARY KEY, incident_id INTEGER NOT NULL);
  `);
}
// Planning ASSUMPTIONS per scenario (editable defaults, not forecasts): incidents, people affected, units needed.
const SCENARIOS = {
  flood: { incidents: 6, people: 120, units: { rescue: 4, ambulance: 2 }, label: 'Flood' },
  fire: { incidents: 2, people: 30, units: { fire: 3, ambulance: 2, rescue: 1 }, label: 'Fire emergency' },
  accidents: { incidents: 5, people: 25, units: { ambulance: 5, rescue: 2 }, label: 'Multiple road accidents' },
  collapse: { incidents: 1, people: 15, units: { rescue: 4, ambulance: 3, fire: 1 }, label: 'Building collapse' },
};
SCENARIOS.multi = { label: 'Multiple simultaneous incidents', incidents: 14, people: 190, units: { rescue: 9, ambulance: 9, fire: 4 } };
export function simulate(db, scenario, intensity = 1) {
  const sc = SCENARIOS[scenario], k = Math.min(Math.max(Number(intensity) || 1, 0.5), 5);
  if (!sc) return null;
  const need = Object.fromEntries(Object.entries(sc.units).map(([t, n]) => [t, Math.ceil(n * k)]));
  const have = Object.fromEntries(db.prepare("SELECT type, COUNT(*) c FROM resources WHERE status='available' GROUP BY type").all().map((r) => [r.type, r.c]));
  const free = db.prepare('SELECT COALESCE(SUM(capacity-occupancy),0) f FROM shelters').get().f, people = Math.ceil(sc.people * k);
  return { simulated: true, notice: 'HYPOTHETICAL: planning assumptions, not real incidents. Nothing was saved or dispatched.', scenario: sc.label, intensity: k,
    hypotheticalIncidents: Math.ceil(sc.incidents * k), peopleAffected: people,
    resourceDemand: Object.entries(need).map(([type, needed]) => ({ type, needed, available: have[type] || 0, shortfall: Math.max(0, needed - (have[type] || 0)) })),
    shelter: { freeCapacity: free, displacedEstimate: people, shortfall: Math.max(0, people - free) } };
}
const csv = (rows) => { if (!rows.length) return ''; const h = Object.keys(rows[0]); const q = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  return [h.join(','), ...rows.map((r) => h.map((c) => q(r[c])).join(','))].join('\n'); };

export function extraRouter(db) {
  const r = Router(), now = () => new Date().toISOString(), one = (sql, ...p) => db.prepare(sql).get(...p);
  r.post('/volunteers', (q, s) => { const b = q.body || {}, name = String(b.name || '').trim();
    if (name.length < 2) return s.status(400).json({ error: 'Name required' });
    const i = db.prepare('INSERT INTO volunteers (name,skills,contact,created_at) VALUES (?,?,?,?)').run(name, String(b.skills || '').slice(0, 200), String(b.contact || '').slice(0, 60), now());
    s.status(201).json({ id: Number(i.lastInsertRowid), status: 'Pending', note: 'Awaiting administrator approval.' }); });
  r.get('/volunteers', (_q, s) => s.json(db.prepare('SELECT * FROM volunteers ORDER BY created_at DESC').all())); // contact visible to staff only via guard
  r.patch('/volunteers/:id', (q, s) => { const st = q.body?.status;
    if (!['Approved', 'Rejected'].includes(st)) return s.status(400).json({ error: 'Invalid status' });
    db.prepare('UPDATE volunteers SET status=? WHERE id=?').run(st, Number(q.params.id)); s.json({ ok: true }); });
  r.post('/volunteers/:id/tasks', (q, s) => { const v = one('SELECT * FROM volunteers WHERE id=?', Number(q.params.id));
    if (!v) return s.status(404).json({ error: 'Volunteer not found' });
    if (v.status !== 'Approved') return s.status(409).json({ error: 'Volunteer is not approved' });
    const i = db.prepare('INSERT INTO tasks (volunteer_id,incident_id,task,created_at) VALUES (?,?,?,?)').run(v.id, q.body?.incidentId ?? null, String(q.body?.task || 'Task').slice(0, 200), now());
    s.status(201).json({ id: Number(i.lastInsertRowid) }); });
  r.patch('/tasks/:id', (q, s) => { const i = db.prepare("UPDATE tasks SET status='Completed', completed_at=? WHERE id=?").run(now(), Number(q.params.id));
    i.changes ? s.json({ ok: true }) : s.status(404).json({ error: 'Task not found' }); });
  r.post('/simulate', (q, s) => { const out = simulate(db, q.body?.scenario, q.body?.intensity); out ? s.json(out) : s.status(400).json({ error: `Scenario must be one of ${Object.keys(SCENARIOS).join(', ')}` }); });
  // Offline sync: idempotent per clientId (safe to retry), returns per-report outcome so the client never assumes delivery.
  r.post('/sync', (q, s) => { const results = [];
    for (const rep of (Array.isArray(q.body?.reports) ? q.body.reports : []).slice(0, 50)) {
      const cid = String(rep.clientId || '');
      if (!cid) { results.push({ clientId: cid, status: 'rejected', errors: { clientId: 'required' } }); continue; }
      const prior = one('SELECT incident_id FROM sync_receipts WHERE client_id=?', cid);
      if (prior) { results.push({ clientId: cid, status: 'already_received', incidentId: prior.incident_id }); continue; }
      const { errors, value } = validateIncident(rep);
      if (Object.keys(errors).length) { results.push({ clientId: cid, status: 'rejected', errors }); continue; }
      const { severity, reasons } = classifySeverity(value), g = geocode(value.location), ts = now();
      const i = db.prepare(`INSERT INTO incidents (title,description,category,location,people_affected,contact,severity,severity_reasons,status,created_at,updated_at,lat,lng)
        VALUES (?,?,?,?,?,?,?,?,'Reported',?,?,?,?)`).run(value.title, value.description, value.category, value.location, value.peopleAffected, value.contact, severity, JSON.stringify(reasons), ts, ts, g?.[0] ?? null, g?.[1] ?? null);
      db.prepare('INSERT INTO sync_receipts VALUES (?,?)').run(cid, Number(i.lastInsertRowid));
      results.push({ clientId: cid, status: 'received', incidentId: Number(i.lastInsertRowid), severity });
    } s.json({ results }); });
  r.get('/analytics', (_q, s) => { const all = (sql) => db.prepare(sql).all();
    s.json({ source: 'computed from database records', total: one('SELECT COUNT(*) c FROM incidents').c, critical: one("SELECT COUNT(*) c FROM incidents WHERE severity='Critical'").c,
      resolved: one("SELECT COUNT(*) c FROM incidents WHERE status='Resolved'").c, unresolved: one("SELECT COUNT(*) c FROM incidents WHERE status!='Resolved'").c,
      byCategory: all('SELECT category, COUNT(*) c FROM incidents GROUP BY category'), byDay: all('SELECT substr(created_at,1,10) day, COUNT(*) c FROM incidents GROUP BY day ORDER BY day DESC LIMIT 7'),
      avgResponseMinutes: one('SELECT ROUND(AVG((julianday(a.arrived_at)-julianday(i.created_at))*1440),1) v FROM assignments a JOIN incidents i ON i.id=a.incident_id WHERE a.arrived_at IS NOT NULL').v,
      resourceUtilization: all("SELECT type, COUNT(*) total, SUM(status='dispatched') dispatched FROM resources GROUP BY type"),
      volunteers: all('SELECT status, COUNT(*) c FROM volunteers GROUP BY status'), tasksCompleted: one("SELECT COUNT(*) c FROM tasks WHERE status='Completed'").c,
      hospitalBeds: one('SELECT COALESCE(SUM(beds_total),0) total, COALESCE(SUM(beds_free),0) free FROM hospitals'), shelterOccupancy: one('SELECT COALESCE(SUM(capacity),0) capacity, COALESCE(SUM(occupancy),0) occupancy FROM shelters') }); });
  r.get('/analytics/export.csv', (_q, s) => { s.type?.('text/csv'); s.setHeader?.('Content-Disposition', 'attachment; filename=incidents.csv');
    s.send(csv(db.prepare('SELECT id,title,category,severity,status,location,people_affected,verified,created_at FROM incidents').all())); });
  r.get('/audit', (_q, s) => s.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all()));
  return r;
}
