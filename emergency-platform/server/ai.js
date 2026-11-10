// Transparent, rule-based assistance. Nothing here is a trained model, so no confidence
// percentages are produced -- only similarity scores and the exact evidence that matched.
const STOP = new Set('the a an and or of in on at to is are was were with for near by from has have had it this that'.split(' '));
const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0; for (const t of a) if (b.has(t)) i++;
  return i / (a.size + b.size - i);
};

// Duplicate detection: same category, unresolved, created in the last 24h, similar text + place.
export function findDuplicates(db, { title, description, category, location }, excludeId = -1) {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const rows = db.prepare(`SELECT id,title,description,location,status FROM incidents
    WHERE category = ? AND status != 'Resolved' AND created_at >= ? AND id != ?`).all(category, since, excludeId);
  const text = toks(`${title} ${description}`), place = toks(location);
  return rows.map((r) => {
    const t = jaccard(text, toks(`${r.title} ${r.description}`)), p = jaccard(place, toks(r.location));
    return { id: r.id, title: r.title, location: r.location, status: r.status,
      similarity: +(0.6 * t + 0.4 * p).toFixed(2),
      reasons: [`Text overlap ${Math.round(t * 100)}%`, `Location overlap ${Math.round(p * 100)}%`] };
  }).filter((d) => d.similarity >= 0.3).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

const CAT_WORDS = {
  fire: ['fire', 'flame', 'smoke', 'burning', 'blaze'],
  accident: ['accident', 'collision', 'crash', 'vehicle', 'overturned', 'bike', 'truck'],
  medical: ['chest pain', 'unconscious', 'fainted', 'breathing', 'heart', 'ambulance', 'seizure'],
  flood: ['flood', 'water', 'rain', 'stranded', 'waterlogging', 'inundat'],
  collapse: ['collapse', 'debris', 'trapped', 'rubble', 'slab'],
};
// Suggests a category from the text; returns the matched words as the explanation.
export function predictCategory(text) {
  const t = String(text || '').toLowerCase();
  const scored = Object.entries(CAT_WORDS).map(([category, ws]) => ({ category, matched: ws.filter((w) => t.includes(w)) }))
    .filter((s) => s.matched.length).sort((a, b) => b.matched.length - a.matched.length);
  return scored[0] || { category: 'other', matched: [] };
}

export const summarize = (i) =>
  `${i.severity} ${i.category} incident at ${i.location}: ${i.title}. ${i.peopleAffected ?? i.people_affected} people affected; status ${i.status}.`;
