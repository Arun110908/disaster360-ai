import { Search, X, Trash2, Inbox, MapPin, Users } from 'lucide-react';
import { CATEGORIES, SEVERITIES, STATUSES, timeAgo } from '../constants.jsx';
import { CategoryIcon, SeverityBadge, StatusBadge } from './Badges.jsx';

export const NO_FILTERS = { q: '', category: '', severity: '', status: '' };

export function applyFilters(incidents, f) {
  const q = f.q.trim().toLowerCase();
  return incidents.filter((i) =>
    (!f.category || i.category === f.category) &&
    (!f.severity || i.severity === f.severity) &&
    (!f.status || i.status === f.status) &&
    (!q || `${i.title} ${i.description} ${i.location}`.toLowerCase().includes(q) || String(i.id) === q.replace('#', ''))
  );
}

function Select({ value, onChange, label, children }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto min-w-[8.5rem] flex-1 sm:flex-none">
      {children}
    </select>
  );
}

export default function Incidents({ incidents, filters, setFilters, onOpen, onDelete, total }) {
  const rows = applyFilters(incidents, filters);
  const active = filters.q || filters.category || filters.severity || filters.status;
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 animate-slideIn">
      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={filters.q} onChange={(e) => set('q')(e.target.value)} placeholder="Search by title, description, location or #ID…" className="input pl-9" aria-label="Search incidents" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select label="Filter by category" value={filters.category} onChange={set('category')}>
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </Select>
          <Select label="Filter by severity" value={filters.severity} onChange={set('severity')}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select label="Filter by status" value={filters.status} onChange={set('status')}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          {active && <button onClick={() => setFilters(NO_FILTERS)} className="btn-ghost"><X className="h-4 w-4" />Clear</button>}
        </div>
      </div>

      <p className="px-1 text-sm text-slate-500">Showing <b className="text-navy-900">{rows.length}</b> of {total} incidents · sorted by severity</p>

      {rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-slate-500">
          <Inbox className="h-10 w-10" />
          <p className="font-semibold text-navy-900">No incidents match your search</p>
          <p className="text-sm">Try clearing filters or searching for something else.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-left text-xs uppercase tracking-wide text-slate-300">
                <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Incident</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reported</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr key={i.id} onClick={() => onOpen(i.id)} className={`cursor-pointer transition hover:bg-slate-50 ${i.severity === 'Critical' && i.status !== 'Resolved' ? 'bg-red-50/60 hover:bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">#{i.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon category={i.category} />
                        <div className="min-w-0"><p className="truncate font-semibold text-navy-900">{i.title}</p><p className="text-xs text-slate-500">{CATEGORIES[i.category].label}</p></div>
                      </div>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-600">{i.location}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(i.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); onDelete(i); }} aria-label={`Delete incident ${i.id}`} className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((i) => (
              <li key={i.id} className={`card p-4 ${i.severity === 'Critical' && i.status !== 'Resolved' ? 'border-red-300 bg-red-50/60' : ''}`}>
                <button onClick={() => onOpen(i.id)} className="flex w-full items-start gap-3 text-left">
                  <CategoryIcon category={i.category} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-navy-900">{i.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{i.location}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Users className="h-3 w-3" />{i.peopleAffected} affected · {timeAgo(i.createdAt)}</span>
                  </span>
                </button>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex gap-2"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></span>
                  <button onClick={() => onDelete(i)} aria-label={`Delete incident ${i.id}`} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
