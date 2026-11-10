import { Flame, Car, HeartPulse, Waves, Building2, MoreHorizontal } from 'lucide-react';

export const CATEGORIES = {
  fire:     { label: 'Fire Emergency',    Icon: Flame,          color: '#ef4444', soft: 'bg-red-50 text-red-600 ring-red-200' },
  accident: { label: 'Road Accident',     Icon: Car,            color: '#f59e0b', soft: 'bg-amber-50 text-amber-600 ring-amber-200' },
  medical:  { label: 'Medical Emergency', Icon: HeartPulse,     color: '#ec4899', soft: 'bg-pink-50 text-pink-600 ring-pink-200' },
  flood:    { label: 'Flood',             Icon: Waves,          color: '#0ea5e9', soft: 'bg-sky-50 text-sky-600 ring-sky-200' },
  collapse: { label: 'Building Collapse', Icon: Building2,      color: '#8b5cf6', soft: 'bg-violet-50 text-violet-600 ring-violet-200' },
  other:    { label: 'Other Emergencies', Icon: MoreHorizontal, color: '#64748b', soft: 'bg-slate-100 text-slate-600 ring-slate-300' },
};

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const SEVERITY_STYLE = {
  Low:      { chip: 'bg-green-100 text-green-800 ring-green-300',   dot: 'bg-green-500',  hex: '#22c55e' },
  Medium:   { chip: 'bg-yellow-100 text-yellow-800 ring-yellow-300', dot: 'bg-yellow-400', hex: '#eab308' },
  High:     { chip: 'bg-orange-100 text-orange-800 ring-orange-300', dot: 'bg-orange-500', hex: '#f97316' },
  Critical: { chip: 'bg-red-600 text-white ring-red-700',            dot: 'bg-red-600',    hex: '#dc2626' },
};

export const STATUSES = ['Reported', 'Pending', 'In Progress', 'Resolved'];
export const STATUS_STYLE = {
  Reported:      'bg-slate-100 text-slate-700 ring-slate-300',
  Pending:       'bg-yellow-100 text-yellow-800 ring-yellow-300',
  'In Progress': 'bg-blue-100 text-blue-800 ring-blue-300',
  Resolved:      'bg-green-100 text-green-800 ring-green-300',
};

export function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}
