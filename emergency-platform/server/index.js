import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, seedIfEmpty } from './db.js';
import { classifySeverity, SEVERITIES } from './severity.js';
import { initOps, opsRouter } from './ops.js';
import { validateIncident } from './validate.js';
import { initAuth, authRouter, guard } from './auth.js';
import { initExtra, extraRouter } from './extra.js';
import { initMore, moreRouter } from './more.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATEGORIES = ['fire', 'accident', 'medical', 'flood', 'collapse', 'other'];
const STATUSES = ['Reported', 'Pending', 'In Progress', 'Resolved'];

seedIfEmpty();
initOps(db);
initAuth(db);
initExtra(db);
initMore(db);

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', (_req, res) => res.send('ok'));
app.use('/api', authRouter(db), guard);

const toDto = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  category: r.category,
  location: r.location,
  peopleAffected: r.people_affected,
  contact: r.contact,
  severity: r.severity,
  severityReasons: r.severity_reasons ? JSON.parse(r.severity_reasons) : [],
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ---- Read all (search + filters) ----
app.get('/api/incidents', (req, res) => {
  const { q, category, severity, status } = req.query;
  const where = [];
  const params = [];
  if (q && String(q).trim()) {
    const like = `%${String(q).trim().toLowerCase()}%`;
    where.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(location) LIKE ? OR CAST(id AS TEXT) = ?)');
    params.push(like, like, like, String(q).trim().replace(/^#/, ''));
  }
  if (category && CATEGORIES.includes(category)) { where.push('category = ?'); params.push(category); }
  if (severity && SEVERITIES.includes(severity)) { where.push('severity = ?'); params.push(severity); }
  if (status && STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
  const sql = `SELECT * FROM incidents ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, created_at DESC`;
  res.json(db.prepare(sql).all(...params).map(toDto));
});

// ---- Read one ----
app.get('/api/incidents/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Incident not found' });
  res.json(toDto(row));
});

// ---- Preview severity (used live by the report form) ----
app.post('/api/classify', (req, res) => {
  const b = req.body || {};
  res.json(classifySeverity({
    category: b.category, title: b.title || '', description: b.description || '', peopleAffected: b.peopleAffected,
  }));
});

// ---- Create ----
app.post('/api/incidents', (req, res) => {
  const { errors, value } = validateIncident(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', errors });
  const { severity, reasons } = classifySeverity(value);
  const now = new Date().toISOString();
  const info = db.prepare(`INSERT INTO incidents
    (title, description, category, location, people_affected, contact, severity, severity_reasons, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?, 'Reported', ?, ?)`)
    .run(value.title, value.description, value.category, value.location, value.peopleAffected, value.contact,
      severity, JSON.stringify(reasons), now, now);
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json(toDto(row));
});

// ---- Update (severity / status only for admins) ----
app.patch('/api/incidents/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Incident not found' });
  const { severity, status } = req.body || {};
  if (severity !== undefined && !SEVERITIES.includes(severity)) return res.status(400).json({ error: 'Invalid severity' });
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (severity === undefined && status === undefined) return res.status(400).json({ error: 'Nothing to update' });
  db.prepare('UPDATE incidents SET severity = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(severity ?? row.severity, status ?? row.status, new Date().toISOString(), id);
  res.json(toDto(db.prepare('SELECT * FROM incidents WHERE id = ?').get(id)));
});

// ---- Delete ----
app.delete('/api/incidents/:id', (req, res) => {
  const info = db.prepare('DELETE FROM incidents WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Incident not found' });
  res.json({ ok: true });
});

// ---- Stats (always computed from the DB) ----
app.get('/api/stats', (_req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p).c;
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const r of db.prepare('SELECT category, COUNT(*) AS c FROM incidents GROUP BY category').all()) byCategory[r.category] = r.c;
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT severity, COUNT(*) AS c FROM incidents GROUP BY severity').all()) bySeverity[r.severity] = r.c;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS c FROM incidents GROUP BY status').all()) byStatus[r.status] = r.c;
  res.json({
    total: one('SELECT COUNT(*) AS c FROM incidents'),
    critical: one("SELECT COUNT(*) AS c FROM incidents WHERE severity = 'Critical'"),
    pending: one("SELECT COUNT(*) AS c FROM incidents WHERE status = 'Pending'"),
    resolved: one("SELECT COUNT(*) AS c FROM incidents WHERE status = 'Resolved'"),
    activeCritical: one("SELECT COUNT(*) AS c FROM incidents WHERE severity = 'Critical' AND status != 'Resolved'"),
    peopleAffected: one('SELECT COALESCE(SUM(people_affected),0) AS c FROM incidents WHERE status != \'Resolved\''),
    byCategory, bySeverity, byStatus,
  });
});

app.use('/api', opsRouter(db), extraRouter(db), moreRouter(db));
app.use('/ops', express.static(path.join(__dirname, 'public')));

// ---- Serve built frontend ----
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Emergency platform running on http://localhost:${PORT}`));
