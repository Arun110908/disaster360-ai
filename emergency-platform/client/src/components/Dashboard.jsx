import { AlertOctagon, ClipboardList, Clock3, CheckCircle2, Users, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid } from 'recharts';
import { CATEGORIES, SEVERITIES, SEVERITY_STYLE, STATUSES, timeAgo } from '../constants.jsx';
import { CategoryIcon, SeverityBadge, StatusBadge } from './Badges.jsx';

function StatCard({ label, value, Icon, tone, sub, pulse, onClick }) {
  return (
    <button onClick={onClick} className="card group flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone} ${pulse ? 'animate-pulseRing' : ''}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-3xl font-extrabold leading-none text-navy-900">{value}</span>
        <span className="mt-1 block text-sm font-medium text-slate-600">{label}</span>
        {sub && <span className="block truncate text-xs text-slate-400">{sub}</span>}
      </span>
    </button>
  );
}

export default function Dashboard({ stats, incidents, onOpen, goToIncidents }) {
  const catData = Object.entries(CATEGORIES).map(([key, c]) => ({ key, name: c.label, short: c.label.split(' ')[0], value: stats.byCategory[key] || 0, color: c.color }));
  const sevData = SEVERITIES.map((s) => ({ name: s, value: stats.bySeverity[s] || 0, color: SEVERITY_STYLE[s].hex }));
  const statusMax = Math.max(1, ...STATUSES.map((s) => stats.byStatus[s] || 0));
  const urgent = incidents.filter((i) => i.status !== 'Resolved' && (i.severity === 'Critical' || i.severity === 'High')).slice(0, 5);

  return (
    <div className="space-y-6 animate-slideIn">
      {stats.activeCritical > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          <span className="h-3 w-3 shrink-0 rounded-full bg-red-600 animate-pulseRing" />
          <p className="text-sm font-semibold">
            {stats.activeCritical} critical incident{stats.activeCritical > 1 ? 's' : ''} need immediate attention
            <span className="font-normal text-red-700"> · {stats.peopleAffected} people affected in unresolved incidents</span>
          </p>
          <button onClick={() => goToIncidents({ severity: 'Critical' })} className="ml-auto hidden shrink-0 text-sm font-semibold underline sm:block">View</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Reported" value={stats.total} Icon={ClipboardList} tone="bg-navy-800 text-white" sub="All incidents" onClick={() => goToIncidents({})} />
        <StatCard label="Critical Incidents" value={stats.critical} Icon={AlertOctagon} tone="bg-red-600 text-white" pulse={stats.activeCritical > 0} sub={`${stats.activeCritical} still active`} onClick={() => goToIncidents({ severity: 'Critical' })} />
        <StatCard label="Pending" value={stats.pending} Icon={Clock3} tone="bg-yellow-400 text-yellow-900" sub="Awaiting response" onClick={() => goToIncidents({ status: 'Pending' })} />
        <StatCard label="Resolved" value={stats.resolved} Icon={CheckCircle2} tone="bg-green-500 text-white" sub={stats.total ? `${Math.round((stats.resolved / stats.total) * 100)}% resolution rate` : '—'} onClick={() => goToIncidents({ status: 'Resolved' })} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-1 text-base font-bold text-navy-900">Incidents by Category</h2>
          <p className="mb-4 text-xs text-slate-500">Click a bar to filter incidents</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="short" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'Incidents']} labelFormatter={(_, p) => p?.[0]?.payload?.name} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(d) => goToIncidents({ category: d.key })}>
                  {catData.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-base font-bold text-navy-900">Severity Breakdown</h2>
          <p className="mb-2 text-xs text-slate-500">Distribution of all incidents</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sevData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                  {sevData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {sevData.map((d) => (
              <li key={d.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
                <span className="font-bold text-navy-900">{d.value}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-4 text-base font-bold text-navy-900">Status Pipeline</h2>
          <div className="space-y-3">
            {STATUSES.map((s) => {
              const n = stats.byStatus[s] || 0;
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-600">{s}</span><span className="font-bold text-navy-900">{n}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-navy-700 transition-all duration-500" style={{ width: `${(n / statusMax) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <Users className="h-5 w-5 text-alert" />
            <div><p className="text-xl font-extrabold leading-none text-navy-900">{stats.peopleAffected}</p><p className="text-xs text-slate-500">people affected (unresolved)</p></div>
          </div>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy-900">Needs Attention Now</h2>
            <button onClick={() => goToIncidents({})} className="text-sm font-semibold text-alert hover:underline">View all</button>
          </div>
          {urgent.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No unresolved critical or high-severity incidents. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {urgent.map((i) => (
                <li key={i.id}>
                  <button onClick={() => onOpen(i.id)} className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-slate-50">
                    <CategoryIcon category={i.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-900">{i.title}</span>
                      <span className="block truncate text-xs text-slate-500">{i.location} · {timeAgo(i.createdAt)}</span>
                    </span>
                    <span className="hidden gap-2 sm:flex"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
