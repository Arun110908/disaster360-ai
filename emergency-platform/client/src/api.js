async function request(url, options) {
  let res;
  try {
    const token = sessionStorage.getItem('d360_token');
    res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...options });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.fieldErrors = data.errors;
    throw err;
  }
  return data;
}

export const api = {
  list: () => request('/api/incidents'),
  stats: () => request('/api/stats'),
  create: (body) => request('/api/incidents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/api/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => request(`/api/incidents/${id}`, { method: 'DELETE' }),
  classify: (body) => request('/api/classify', { method: 'POST', body: JSON.stringify(body) }),
};

export const login = (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
