import { useEffect, useState } from 'react';
import { X, MapPin, Users, Phone, Clock, Trash2, Sparkles } from 'lucide-react';
import { CATEGORIES, SEVERITIES, SEVERITY_STYLE, STATUSES } from '../constants.jsx';
import { CategoryIcon, SeverityBadge, StatusBadge } from './Badges.jsx';

export default function IncidentModal({ incident, onClose, onUpdate, onDelete }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!incident) return null;
  const i = incident;

  async function change(patch) {
    setBusy(true);
    try { await onUpdate(i.id, patch); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Incident ${i.id} details`}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl animate-slideIn overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 bg-navy-900 p-5 text-white sm:rounded-t-2xl">
          <CategoryIcon category={i.category} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">#{i.id} · {CATEGORIES[i.category].label}</p>
            <h2 className="text-lg font-bold leading-snug">{i.title}</h2>
            <div className="mt-2 flex gap-2"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{i.description}</p>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-alert" /><div><dt className="text-xs font-semibold uppercase text-slate-400">Location</dt><dd className="font-medium text-navy-900">{i.location}</dd></div></div>
            <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-alert" /><div><dt className="text-xs font-semibold uppercase text-slate-400">People affected</dt><dd className="font-medium text-navy-900">{i.peopleAffected}</dd></div></div>
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 text-alert" /><div><dt className="text-xs font-semibold uppercase text-slate-400">Contact</dt><dd className="font-medium text-navy-900">{i.contact || 'Not provided'}</dd></div></div>
            <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 text-alert" /><div><dt className="text-xs font-semibold uppercase text-slate-400">Reported</dt><dd className="font-medium text-navy-900">{new Date(i.createdAt).toLocaleString()}</dd></div></div>
          </dl>

          {i.severityReasons?.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500"><Sparkles className="h-3.5 w-3.5 text-alert" />Auto-classification reasoning</p>
              <ul className="list-inside list-disc text-xs text-slate-600">{i.severityReasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Severity</label>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Update severity">
                {SEVERITIES.map((s) => (
                  <button key={s} role="radio" aria-checked={i.severity === s} disabled={busy} onClick={() => i.severity !== s && change({ severity: s })}
                    className={`rounded-lg border-2 px-1 py-2 text-xs font-bold transition ${i.severity === s ? 'border-navy-900 ring-2 ring-navy-900/20' : 'border-transparent opacity-60 hover:opacity-100'} ${SEVERITY_STYLE[s].chip}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="status-select">Status</label>
              <select id="status-select" value={i.status} disabled={busy} onChange={(e) => change({ status: e.target.value })} className="input">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <button onClick={() => onDelete(i)} className="btn text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Delete</button>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}
