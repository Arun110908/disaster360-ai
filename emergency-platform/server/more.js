// Hospital/shelter management, weather advisories + human-approved alerts, safe image uploads.
import express, { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const UPLOADS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');

export function initMore(db) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, area TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL, source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft', created_at TEXT NOT NULL, published_at TEXT);
    CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id INTEGER NOT NULL, file TEXT NOT NULL, created_at TEXT NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0);
  `);
}
const int = (v, lo, hi) => (Number.isInteger(Number(v)) && v !== '' && v != null && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);

// Rainfall advisory thresholds follow IMD's 24h categories (heavy >= 64.5 mm, very heavy >= 115.6 mm). Advisory only; NOT an official warning.
export function advisory(hourlyMm) {
  const total = +hourlyMm.slice(0, 24).reduce((a, b) => a + (Number(b) || 0), 0).toFixed(1);
  const level = total >= 115.6 ? 'Very heavy rainfall possible' : total >= 64.5 ? 'Heavy rainfall possible' : 'No heavy-rain signal';
  return { next24hMm: total, level, verified: false, notice: 'Model forecast, unverified. An administrator must review and publish before the public sees an alert.' };
}
let cache = { at: 0, key: '', val: null };
export async function getWeather(lat, lng) {
  const key = `${lat},${lng}`;
  if (cache.key === key && Date.now() - cache.at < 15 * 60e3) return cache.val;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&forecast_days=2`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Weather provider returned ${res.status}`);
  const j = await res.json();
  const val = { source: 'Open-Meteo forecast API', fetchedAt: new Date().toISOString(), lat, lng, ...advisory(j.hourly?.precipitation || []) };
  cache = { at: Date.now(), key, val };
  return val;
}
const sniff = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'jpg' : b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'png' : null);

export function moreRouter(db) {
  const r = Router(), now = () => new Date().toISOString(), staffOnly = (q) => !q.user || ['super_admin', 'emergency_admin'].includes(q.user.role);
  r.post('/hospitals', (q, s) => { const b = q.body || {}, name = String(b.name || '').trim(), t = int(b.bedsTotal, 1, 5000), f = int(b.bedsFree ?? 0, 0, 5000);
    if (name.length < 3 || t == null || f == null || f > t) return s.status(400).json({ error: 'Name, total beds and free beds (<= total) required' });
    const i = db.prepare('INSERT INTO hospitals (name,lat,lng,beds_total,beds_free,phone,is_demo,updated_at) VALUES (?,?,?,?,?,?,0,?)').run(name, b.lat ?? null, b.lng ?? null, t, f, String(b.phone || '').slice(0, 20) || null, now());
    s.status(201).json({ id: Number(i.lastInsertRowid) }); });
  r.patch('/hospitals/:id', (q, s) => { const id = Number(q.params.id), h = db.prepare('SELECT * FROM hospitals WHERE id=?').get(id);
    if (!h) return s.status(404).json({ error: 'Hospital not found' });
    if (q.user?.role === 'hospital_admin' && q.user.hid !== id) return s.status(403).json({ error: 'You can only update your own hospital' });
    const f = int(q.body?.bedsFree, 0, h.beds_total); if (f == null) return s.status(400).json({ error: `bedsFree must be 0-${h.beds_total}` });
    db.prepare('UPDATE hospitals SET beds_free=?, is_demo=0, updated_at=? WHERE id=?').run(f, now(), id); db.prepare('INSERT INTO audit_log (at,action,detail) VALUES (?,?,?)').run(now(), 'hospital_beds', JSON.stringify({ id, f, by: q.user?.id ?? null }));
    s.json({ ok: true }); });
  r.post('/shelters', (q, s) => { const b = q.body || {}, name = String(b.name || '').trim(), c = int(b.capacity, 1, 100000);
    if (name.length < 3 || c == null) return s.status(400).json({ error: 'Name and capacity required' });
    const i = db.prepare('INSERT INTO shelters (name,lat,lng,capacity,occupancy,food,water,medical,is_demo) VALUES (?,?,?,?,0,?,?,?,0)').run(name, b.lat ?? null, b.lng ?? null, c, +!!b.food, +!!b.water, +!!b.medical);
    s.status(201).json({ id: Number(i.lastInsertRowid) }); });
  r.patch('/shelters/:id', (q, s) => { const sh = db.prepare('SELECT * FROM shelters WHERE id=?').get(Number(q.params.id)); if (!sh) return s.status(404).json({ error: 'Shelter not found' });
    const o = int(q.body?.occupancy, 0, sh.capacity); if (o == null) return s.status(400).json({ error: `occupancy must be 0-${sh.capacity}` });
    db.prepare('UPDATE shelters SET occupancy=?, is_demo=0 WHERE id=?').run(o, sh.id); s.json({ ok: true, capacityAlert: o / sh.capacity >= 0.9 }); });
  r.get('/weather', async (q, s) => { const lat = Number(q.query?.lat ?? 12.6819), lng = Number(q.query?.lng ?? 79.9888);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return s.status(400).json({ error: 'Invalid coordinates' });
    try { s.json(await getWeather(lat, lng)); } catch (e) { s.status(502).json({ error: 'Weather data unavailable right now', detail: e.message }); } });
  r.post('/alerts', (q, s) => { const b = q.body || {}; const area = String(b.area || '').trim(), message = String(b.message || '').trim();
    if (area.length < 2 || message.length < 5) return s.status(400).json({ error: 'Area and message required' });
    const i = db.prepare("INSERT INTO alerts (area,level,message,source,created_at) VALUES (?,?,?,?,?)").run(area, String(b.level || 'Advisory').slice(0, 30), message.slice(0, 500), String(b.source || 'Administrator').slice(0, 80), now());
    s.status(201).json({ id: Number(i.lastInsertRowid), status: 'Draft' }); });
  r.patch('/alerts/:id', (q, s) => { const st = q.body?.status; if (!['Published', 'Withdrawn'].includes(st)) return s.status(400).json({ error: 'Invalid status' });
    const i = db.prepare('UPDATE alerts SET status=?, published_at=? WHERE id=?').run(st, st === 'Published' ? now() : null, Number(q.params.id)); i.changes ? s.json({ ok: true }) : s.status(404).json({ error: 'Alert not found' }); });
  r.get('/alerts', (_q, s) => s.json(db.prepare("SELECT id,area,level,message,source,published_at FROM alerts WHERE status='Published' ORDER BY published_at DESC LIMIT 20").all()));
  r.get('/alerts/all', (_q, s) => s.json(db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 50').all()));
  // Uploads: JPEG/PNG only (checked by file signature, not the client's claim), max 2 MB, random server-side name. No AI image analysis is performed.
  r.post('/incidents/:id/images', express.raw({ type: ['image/jpeg', 'image/png'], limit: '2mb' }), (q, s) => {
    const id = Number(q.params.id); if (!db.prepare('SELECT 1 FROM incidents WHERE id=?').get(id)) return s.status(404).json({ error: 'Incident not found' });
    const b = q.body, ext = Buffer.isBuffer(b) && b.length > 8 ? sniff(b) : null; if (!ext) return s.status(415).json({ error: 'Only JPEG or PNG images up to 2 MB are accepted' });
    const file = `${crypto.randomUUID()}.${ext}`; fs.writeFileSync(path.join(UPLOADS, file), b);
    db.prepare('INSERT INTO images (incident_id,file,created_at) VALUES (?,?,?)').run(id, file, now()); s.status(201).json({ file, note: 'Stored for human review. No automatic image assessment is performed.' }); });
  r.get('/incidents/:id/images', (q, s) => s.json(db.prepare('SELECT file,created_at,reviewed FROM images WHERE incident_id=?').all(Number(q.params.id))));
  r.get('/images/:file', (q, s) => { const f = path.basename(q.params.file); if (!db.prepare('SELECT 1 FROM images WHERE file=?').get(f)) return s.status(404).json({ error: 'Not found' });
    s.setHeader('X-Content-Type-Options', 'nosniff'); s.type(f.endsWith('png') ? 'image/png' : 'image/jpeg'); s.send(fs.readFileSync(path.join(UPLOADS, f))); });
  return r;
}
