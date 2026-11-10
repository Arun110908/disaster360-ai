// Authentication + role-based access. Enforcement is opt-in (AUTH_ENFORCE=true) so the Round-1 UI keeps working.
import crypto from 'node:crypto';
import { Router } from 'express';
export const ROLES = ['super_admin', 'emergency_admin', 'rescue', 'hospital_admin', 'volunteer', 'citizen'];
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const sign = (p) => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
export const issue = (u) => { const p = Buffer.from(JSON.stringify({ id: u.id, role: u.role, hid: u.hospital_id ?? null, exp: Date.now() + 8 * 3600e3 })).toString('base64url'); return `${p}.${sign(p)}`; };
export function verify(t) {
  const [p, sig] = String(t || '').split('.');
  if (!p || !sig || sig.length !== sign(p).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(p)))) return null;
  const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp > Date.now() ? d : null;
}
export function initAuth(db) {
  db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, pass_hash TEXT NOT NULL, role TEXT NOT NULL, hospital_id INTEGER)');
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'hospital_id')) db.exec('ALTER TABLE users ADD COLUMN hospital_id INTEGER');
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const pw = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (username,salt,pass_hash,role) VALUES (?,?,?,?)').run('admin', salt, hash(pw, salt), 'super_admin');
  if (!process.env.SEED_ADMIN_PASSWORD) console.log(`First run: super admin login  admin / ${pw}  (set SEED_ADMIN_PASSWORD to choose your own)`);
}
const STAFF = ['super_admin', 'emergency_admin'];
// [method, path regex, allowed roles]. Paths with no rule stay public (citizen reporting, classify, volunteer sign-up, sync).
const RULES = [
  ['PATCH', /^\/incidents\/\d+$/, STAFF], ['DELETE', /^\/incidents\/\d+$/, STAFF],
  ['POST', /^\/incidents\/\d+\/(assign|verify)$/, STAFF], ['PATCH', /^\/assignments\/\d+$/, [...STAFF, 'rescue']],
  ['GET', /^\/(resources|map|ops\/stats|analytics.*)$/, [...STAFF, 'rescue']], ['GET', /^\/incidents\/\d+\/(recommend|duplicates)$/, STAFF],
  ['GET', /^\/(hospitals)$/, [...STAFF, 'hospital_admin', 'rescue']], ['GET', /^\/shelters$/, [...STAFF, 'rescue', 'volunteer']],
  ['POST', /^\/(copilot|simulate)$/, STAFF], ['GET', /^\/(volunteers|audit)$/, STAFF], ['PATCH', /^\/volunteers\/\d+$/, STAFF],
  ['POST', /^\/volunteers\/\d+\/tasks$/, STAFF], ['PATCH', /^\/tasks\/\d+$/, [...STAFF, 'volunteer']], ['POST', /^\/users$/, ['super_admin']],
  ['POST', /^\/hospitals$/, STAFF], ['PATCH', /^\/hospitals\/\d+$/, [...STAFF, 'hospital_admin']],
  ['POST', /^\/shelters$/, STAFF], ['PATCH', /^\/shelters\/\d+$/, STAFF], ['GET', /^\/weather$/, STAFF], ['POST', /^\/alerts$/, STAFF], ['PATCH', /^\/alerts\/\d+$/, STAFF],
  ['GET', /^\/alerts\/all$/, STAFF], ['GET', /^\/(incidents\/\d+\/images|images\/[\w.-]+)$/, STAFF],
];
export function guard(req, res, next) {
  if (process.env.AUTH_ENFORCE !== 'true') return next();
  const rule = RULES.find(([m, re]) => m === req.method && re.test(req.path));
  if (!rule) return next();
  const u = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!u) return res.status(401).json({ error: 'Login required' });
  if (!rule[2].includes(u.role)) return res.status(403).json({ error: 'Your role may not do this' });
  req.user = u; next();
}
export function authRouter(db) {
  const r = Router();
  r.post('/auth/login', (q, s) => {
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(q.body?.username || ''));
    if (!u || hash(String(q.body?.password || ''), u.salt) !== u.pass_hash) return s.status(401).json({ error: 'Invalid credentials' });
    s.json({ token: issue(u), role: u.role });
  });
  r.post('/users', (q, s) => {
    const { username, password, role, hospitalId } = q.body || {};
    if (!ROLES.includes(role) || String(username || '').length < 3 || String(password || '').length < 8) return s.status(400).json({ error: 'Valid username, role and 8+ char password required' });
    const salt = crypto.randomBytes(16).toString('hex');
    try { db.prepare('INSERT INTO users (username,salt,pass_hash,role,hospital_id) VALUES (?,?,?,?,?)').run(username, salt, hash(password, salt), role, hospitalId ?? null); s.status(201).json({ ok: true }); }
    catch { s.status(409).json({ error: 'Username taken' }); }
  });
  return r;
}
