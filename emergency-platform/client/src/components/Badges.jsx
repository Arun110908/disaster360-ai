import { CATEGORIES, SEVERITY_STYLE, STATUS_STYLE } from '../constants.jsx';

export function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${severity === 'Critical' ? 'bg-white' : s.dot}`} />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function CategoryIcon({ category, size = 'md' }) {
  const { Icon, soft } = CATEGORIES[category];
  const dims = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${dims} ${soft}`}>
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
    </span>
  );
}
