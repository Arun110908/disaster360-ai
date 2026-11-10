import { useState } from 'react';
import { login } from '../api.js';

// Small sign-in widget. Token lives in sessionStorage (cleared when the tab closes).
export default function LoginBar() {
  const [role, setRole] = useState(sessionStorage.getItem('d360_role'));
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await login(u, p);
      sessionStorage.setItem('d360_token', r.token);
      sessionStorage.setItem('d360_role', r.role);
      window.location.reload();
    } catch (x) { setErr(x.message); }
  };
  const out = () => { sessionStorage.removeItem('d360_token'); sessionStorage.removeItem('d360_role'); window.location.reload(); };
  return (
    <div className="fixed bottom-3 right-3 z-[70] rounded-lg bg-white p-2 text-xs text-slate-800 shadow-lg">
      {role ? (
        <span>Signed in: <b>{role}</b> <button className="ml-2 underline" onClick={out}>Log out</button></span>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-1">
          <input aria-label="Username" className="w-24 rounded border px-1" placeholder="username" value={u} onChange={(e) => setU(e.target.value)} />
          <input aria-label="Password" type="password" className="w-24 rounded border px-1" placeholder="password" value={p} onChange={(e) => setP(e.target.value)} />
          <button className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white">Staff login</button>
          {err && <span role="alert" className="text-red-600">{err}</span>}
        </form>
      )}
    </div>
  );
}
