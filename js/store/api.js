/**
 * Client for the KRIDA auth Worker.
 *
 * Every call is a thin fetch against `apiBase` (from data/config.json). When
 * apiBase is empty the site has no backend and accounts are simply unavailable
 * — the store checks `configured` before offering any of this.
 *
 * The session token is a bearer string the caller holds; nothing here reads or
 * writes storage.
 */
export function makeApi(apiBase) {
  const base = (apiBase || '').replace(/\/$/, '');

  async function call(path, { method = 'GET', body, token } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      throw new ApiError('NETWORK', 0);
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new ApiError(data.error || 'SERVER_ERROR', res.status, data.detail);
    return data;
  }

  return {
    get configured() { return Boolean(base); },
    health: () => call('/api/health'),
    signup: (username, email, password, profile) =>
      call('/api/signup', { method: 'POST', body: { username, email, password, profile } }),
    login: (username, password) =>
      call('/api/login', { method: 'POST', body: { username, password } }),
    me: (token) => call('/api/me', { token }),
    logout: (token) => call('/api/logout', { method: 'POST', body: {}, token }),
    putProfile: (token, profile) => call('/api/profile', { method: 'PUT', body: { profile }, token }),
    changePassword: (token, current, password) =>
      call('/api/password', { method: 'PUT', body: { current, password }, token }),
    requestReset: (identifier) =>
      call('/api/reset/request', { method: 'POST', body: { identifier } }),
    confirmReset: (token, password) =>
      call('/api/reset/confirm', { method: 'POST', body: { token, password } }),
    adminUsers: (token) => call('/api/admin/users', { token }),
    adminReset: (token, username) =>
      call('/api/admin/reset', { method: 'POST', body: { username }, token }),
    adminSetPassword: (token, username, password) =>
      call('/api/admin/set-password', { method: 'POST', body: { username, password }, token }),
    adminDeleteUser: (token, username) =>
      call('/api/admin/user', { method: 'DELETE', body: { username }, token }),
  };
}

export class ApiError extends Error {
  constructor(code, status, detail) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
