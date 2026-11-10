// Rule-based severity classification.
// Score = category base risk + people affected + keyword signals found in title/description.
// Returns { severity, score, reasons[] } so the UI can explain *why* an incident was rated.

const CATEGORY_BASE = {
  fire: 3,
  accident: 2,
  medical: 3,
  flood: 3,
  collapse: 4,
  other: 1,
};

const CRITICAL_WORDS = [
  'trapped', 'explosion', 'explode', 'unconscious', 'not breathing', 'cardiac',
  'heart attack', 'chest pain', 'difficulty breathing', 'fatal', 'dead', 'death', 'died', 'killed', 'bleeding heavily',
  'severe bleeding', 'collapsed', 'gas leak', 'spreading', 'rapidly', 'drowning',
  'chemical', 'multiple vehicles', 'pile-up', 'pileup', 'stampede', 'burning building',
];
const HIGH_WORDS = [
  'injured', 'injury', 'fire', 'smoke', 'rising water', 'overturned', 'fracture',
  'burn', 'evacuat', 'stranded', 'missing', 'school', 'hospital', 'children', 'elderly',
  'pregnant', 'highway', 'crash',
];
const LOW_WORDS = [
  'minor', 'small', 'no injuries', 'no one hurt', 'under control', 'contained',
  'precaution', 'stable', 'waterlogging', 'fender', 'no injury',
];

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

export function classifySeverity({ category, title = '', description = '', peopleAffected = 1 }) {
  const text = `${title} ${description}`.toLowerCase();
  const reasons = [];
  let score = CATEGORY_BASE[category] ?? 1;
  reasons.push(`Category base risk: +${score}`);

  const n = Number(peopleAffected) || 0;
  let peopleScore = 0;
  if (n >= 50) peopleScore = 5;
  else if (n >= 20) peopleScore = 4;
  else if (n >= 10) peopleScore = 3;
  else if (n >= 5) peopleScore = 2;
  else if (n >= 2) peopleScore = 1;
  if (peopleScore) {
    score += peopleScore;
    reasons.push(`${n} people affected: +${peopleScore}`);
  }

  const crit = CRITICAL_WORDS.filter((w) => text.includes(w));
  if (crit.length) {
    const add = Math.min(crit.length * 3, 8);
    score += add;
    reasons.push(`Critical indicators (${crit.slice(0, 3).join(', ')}): +${add}`);
  }
  const high = HIGH_WORDS.filter((w) => text.includes(w));
  if (high.length) {
    const add = Math.min(high.length, 3);
    score += add;
    reasons.push(`Serious indicators (${high.slice(0, 3).join(', ')}): +${add}`);
  }
  const low = LOW_WORDS.filter((w) => text.includes(w));
  if (low.length) {
    const sub = Math.min(low.length * 2, 4);
    score -= sub;
    reasons.push(`Mitigating indicators (${low.slice(0, 3).join(', ')}): -${sub}`);
  }

  let severity;
  if (score >= 12) severity = 'Critical';
  else if (score >= 8) severity = 'High';
  else if (score >= 4) severity = 'Medium';
  else severity = 'Low';

  return { severity, score, reasons };
}
