import { useEffect, useState } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { CATEGORIES } from '../constants.jsx';
import { SeverityBadge } from './Badges.jsx';
import { api } from '../api.js';

const EMPTY = { title: '', description: '', category: '', location: '', peopleAffected: '', contact: '' };

function validate(f) {
  const e = {};
  if (f.title.trim().length < 5) e.title = 'Title must be at least 5 characters';
  if (f.description.trim().length < 10) e.description = 'Please describe what is happening (min 10 characters)';
  if (!f.category) e.category = 'Select an emergency category';
  if (f.location.trim().length < 3) e.location = 'Location is required';
  const n = Number(f.peopleAffected);
  if (f.peopleAffected === '' || !Number.isInteger(n) || n < 0) e.peopleAffected = 'Enter a whole number (0 or more)';
  const c = f.contact.trim();
  if (c && !/^[+\d][\d\s\-()]{6,17}$|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) e.contact = 'Enter a valid phone number or email';
  return e;
}

function Field({ label, error, required, children, hint }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-alert"> *</span>}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p> : hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function ReportForm({ onSubmitted, notify }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (touched[k] || Object.keys(errors).length) setErrors(validate(next));
      return next;
    });
  };
  const blur = (k) => () => { setTouched((t) => ({ ...t, [k]: true })); setErrors(validate(form)); };
  const showErr = (k) => (touched[k] || touched._submit ? errors[k] : undefined);

  // Live severity preview from the server's classifier
  useEffect(() => {
    if (!form.category || form.peopleAffected === '') { setPreview(null); return; }
    const t = setTimeout(() => {
      api.classify(form).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [form.category, form.title, form.description, form.peopleAffected]);

  async function submit(e) {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    setTouched({ _submit: true });
    if (Object.keys(errs).length) {
      notify('error', 'Please fix the highlighted fields');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.create({ ...form, peopleAffected: Number(form.peopleAffected) });
      notify('success', `Report #${created.id} submitted — classified as ${created.severity}`);
      setForm(EMPTY); setErrors({}); setTouched({}); setPreview(null);
      onSubmitted(created);
    } catch (err) {
      if (err.fieldErrors) { setErrors(err.fieldErrors); setTouched({ _submit: true }); }
      notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const cls = (k) => `input ${showErr(k) ? 'input-err' : ''}`;

  return (
    <div className="mx-auto max-w-3xl animate-slideIn">
      <form onSubmit={submit} noValidate className="card space-y-5 p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">Report an Emergency</h2>
          <p className="text-sm text-slate-500">Provide as much detail as possible. Fields marked * are required.</p>
        </div>

        <Field label="Emergency Category" required error={showErr('category')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Emergency category">
            {Object.entries(CATEGORIES).map(([key, c]) => {
              const active = form.category === key;
              return (
                <button type="button" key={key} role="radio" aria-checked={active}
                  onClick={() => { setForm((f) => ({ ...f, category: key })); setTouched((t) => ({ ...t, category: true })); setErrors((er) => { const { category, ...rest } = er; return rest; }); }}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'border-alert bg-red-50 text-navy-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                  <c.Icon className="h-5 w-5 shrink-0" style={{ color: c.color }} />
                  <span className="leading-tight">{c.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Incident Title" required error={showErr('title')}>
          <input className={cls('title')} value={form.title} onChange={set('title')} onBlur={blur('title')} maxLength={120} placeholder="e.g. Fire in apartment building" />
        </Field>

        <Field label="Incident Description" required error={showErr('description')} hint={`${form.description.length}/1000 — mention injuries, trapped people, hazards`}>
          <textarea rows={4} className={cls('description')} value={form.description} onChange={set('description')} onBlur={blur('description')} maxLength={1000} placeholder="Describe what is happening..." />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Location" required error={showErr('location')}>
            <input className={cls('location')} value={form.location} onChange={set('location')} onBlur={blur('location')} placeholder="Street, area, landmark" />
          </Field>
          <Field label="Number of People Affected" required error={showErr('peopleAffected')}>
            <input type="number" min="0" inputMode="numeric" className={cls('peopleAffected')} value={form.peopleAffected} onChange={set('peopleAffected')} onBlur={blur('peopleAffected')} placeholder="0" />
          </Field>
        </div>

        <Field label="Contact Information (optional)" error={showErr('contact')} hint="Phone number or email so responders can reach you">
          <input className={cls('contact')} value={form.contact} onChange={set('contact')} onBlur={blur('contact')} placeholder="Phone or email" />
        </Field>

        <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
          <Sparkles className="h-5 w-5 shrink-0 text-alert" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-navy-900">Auto severity assessment</p>
            {preview ? (
              <p className="flex flex-wrap items-center gap-2 text-slate-600"><SeverityBadge severity={preview.severity} /><span className="text-xs">{preview.reasons.join(' · ')}</span></p>
            ) : (
              <p className="text-xs text-slate-500">Select a category and enter people affected to see the predicted severity.</p>
            )}
          </div>
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base sm:w-auto">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? 'Submitting…' : 'Submit Report'}
        </button>
      </form>
    </div>
  );
}
