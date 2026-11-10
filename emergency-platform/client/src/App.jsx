import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, ListChecks, FilePlus2, Siren, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, WifiOff } from 'lucide-react';
import { api } from './api.js';
import Dashboard from './components/Dashboard.jsx';
import ReportForm from './components/ReportForm.jsx';
import Incidents, { NO_FILTERS } from './components/Incidents.jsx';
import IncidentModal from './components/IncidentModal.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'incidents', label: 'Incidents', Icon: ListChecks },
  { id: 'report', label: 'Report', Icon: FilePlus2 },
];
const TITLES = { dashboard: 'Emergency Dashboard', incidents: 'Incident Management', report: 'Report an Emergency' };

function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex max-w-md animate-slideIn items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {t.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ConfirmDelete({ incident, busy, onCancel, onConfirm }) {
  if (!incident) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label="Confirm delete">
      <div className="w-full max-w-sm animate-slideIn rounded-2xl bg-white p-6 shadow-2xl">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertTriangle className="h-6 w-6" /></span>
        <h3 className="text-lg font-bold text-navy-900">Delete this incident?</h3>
        <p className="mt-1 text-sm text-slate-600"><b>#{incident.id} · {incident.title}</b> will be permanently removed. This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className="btn-danger">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('dashboard');
  const [incidents, setIncidents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [openId, setOpenId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const notify = useCallback((type, message) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [list, st] = await Promise.all([api.list(), api.stats()]);
      setIncidents(list); setStats(st); setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(true); }, [refresh]);
  // light polling so a second admin's changes show up too
  useEffect(() => { const t = setInterval(() => refresh(), 15000); return () => clearInterval(t); }, [refresh]);

  const goToIncidents = (f) => { setFilters({ ...NO_FILTERS, ...f }); setView('incidents'); window.scrollTo({ top: 0 }); };
  const openIncident = incidents.find((i) => i.id === openId) || null;

  async function updateIncident(id, patch) {
    try {
      await api.update(id, patch);
      await refresh();
      notify('success', patch.severity ? `Severity updated to ${patch.severity}` : `Status changed to ${patch.status}`);
    } catch (e) { notify('error', e.message); }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.remove(toDelete.id);
      notify('success', `Incident #${toDelete.id} deleted`);
      if (openId === toDelete.id) setOpenId(null);
      setToDelete(null);
      await refresh();
    } catch (e) { notify('error', e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-900 text-slate-300 md:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-alert text-white animate-pulseRing"><Siren className="h-6 w-6" /></span>
          <div className="leading-tight"><p className="font-extrabold text-white">ERDM</p><p className="text-[11px] uppercase tracking-wider text-slate-400">Response Platform</p></div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { if (id === 'incidents') setFilters(NO_FILTERS); setView(id); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${view === id ? 'bg-alert text-white shadow' : 'hover:bg-white/10 hover:text-white'}`}>
              <Icon className="h-5 w-5" />{label}
              {id === 'incidents' && stats && <span className="ml-auto rounded-full bg-white/15 px-2 text-xs">{stats.total}</span>}
            </button>
          ))}
        </nav>
        <p className="border-t border-white/10 p-4 text-xs text-slate-500">CODE CLASH 2026 · Round 1</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-alert text-white md:hidden"><Siren className="h-5 w-5" /></span>
          <h1 className="text-lg font-extrabold text-navy-900 sm:text-xl">{TITLES[view]}</h1>
          <button onClick={() => refresh()} aria-label="Refresh data" className="btn-ghost ml-auto px-3"><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Refresh</span></button>
          {view !== 'report' && <button onClick={() => setView('report')} className="btn-primary hidden sm:inline-flex"><FilePlus2 className="h-4 w-4" />Report Emergency</button>}
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-32 text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-alert" />Loading incidents…</div>
          ) : error && !stats ? (
            <div className="card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
              <WifiOff className="h-10 w-10 text-alert" />
              <p className="font-bold text-navy-900">Something went wrong</p>
              <p className="text-sm text-slate-600">{error}</p>
              <button onClick={() => refresh(true)} className="btn-primary"><RefreshCw className="h-4 w-4" />Try again</button>
            </div>
          ) : (
            <>
              {error && <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200"><WifiOff className="h-4 w-4" />{error} — showing last loaded data.</div>}
              {view === 'dashboard' && <Dashboard stats={stats} incidents={incidents} onOpen={setOpenId} goToIncidents={goToIncidents} />}
              {view === 'incidents' && <Incidents incidents={incidents} total={incidents.length} filters={filters} setFilters={setFilters} onOpen={setOpenId} onDelete={setToDelete} />}
              {view === 'report' && <ReportForm notify={notify} onSubmitted={async () => { await refresh(); setView('dashboard'); window.scrollTo({ top: 0 }); }} />}
            </>
          )}
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-white/10 bg-navy-900 md:hidden">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => { if (id === 'incidents') setFilters(NO_FILTERS); setView(id); }} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${view === id ? 'text-white' : 'text-slate-400'}`}>
            <span className={`rounded-full px-4 py-1 ${view === id ? 'bg-alert' : ''}`}><Icon className="h-5 w-5" /></span>{label}
          </button>
        ))}
      </nav>

      <IncidentModal incident={openIncident} onClose={() => setOpenId(null)} onUpdate={updateIncident} onDelete={setToDelete} />
      <ConfirmDelete incident={toDelete} busy={deleting} onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      <Toasts toasts={toasts} />
    </div>
  );
}
