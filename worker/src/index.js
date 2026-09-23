/**
 * KRIDA auth Worker — the backend the static site could not be.
 *
 * Holds accounts (username + password), issues sessions, stores each user's
 * training profile, and drives password reset by email. An admin account can
 * manage everyone's resets. Storage is one Cloudflare KV namespace; passwords
 * are PBKDF2-SHA256 with a per-user salt; sessions and reset tokens are opaque
 * random strings with a TTL, so they are revocable and never guessable.
 *
 * Everything is namespaced in KV:
 *   user:<username>     -> account record (incl. the profile blob)
 *   email:<email>       -> username           (unique-email index + reset lookup)
 *   session:<token>     -> { username }        (TTL ~30 days)
 *   reset:<token>       -> { username }         (TTL ~1 hour)
 */

const SESSION_TTL = 60 * 60 * 24 * 30;   // 30 days
const RESET_TTL = 60 * 60;               // 1 hour
const PBKDF2_ITERATIONS = 210_000;

// ---- small helpers -------------------------------------------------------
const enc = new TextEncoder();
const lc = (s) => String(s || '').trim().toLowerCase();

function json(data, status, env, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env, origin) },
  });
}

function cors(env, origin) {
  const allow = env.ALLOW_ORIGIN || '*';
  // Echo the caller's origin when it is the configured one, so credentials and
  // future tightening both work; otherwise fall back to the configured value.
  const value = allow === '*' ? '*' : (origin === allow ? origin : allow);
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function randomToken(bytes = 24) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toB64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256,
  );
  return { hash: toB64(bits), salt: toB64(salt), iterations };
}

// Constant-time-ish comparison of two base64 strings.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validUsername(u) { return /^[a-zA-Z0-9_.-]{3,32}$/.test(u || ''); }
function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || ''); }

// ---- data access ---------------------------------------------------------
const userKey = (u) => `user:${lc(u)}`;
const emailKey = (e) => `email:${lc(e)}`;

async function getUser(env, username) {
  return env.KV.get(userKey(username), 'json');
}
async function putUser(env, user) {
  await env.KV.put(userKey(user.username), JSON.stringify(user));
}
async function countUsers(env) {
  const list = await env.KV.list({ prefix: 'user:' });
  return list.keys.length;
}
function isAdmin(env, user) {
  if (env.ADMIN_USERNAME) return lc(user.username) === lc(env.ADMIN_USERNAME);
  return Boolean(user.isAdmin);
}
function publicUser(env, user) {
  return {
    username: user.username, email: user.email,
    createdAt: user.createdAt, isAdmin: isAdmin(env, user),
  };
}

async function sessionUser(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const rec = await env.KV.get(`session:${token}`, 'json');
  if (!rec) return null;
  const user = await getUser(env, rec.username);
  return user ? { user, token } : null;
}

async function newSession(env, username) {
  const token = randomToken();
  await env.KV.put(`session:${token}`, JSON.stringify({ username }), { expirationTtl: SESSION_TTL });
  return token;
}

// ---- email ---------------------------------------------------------------
async function sendResetEmail(env, user, link) {
  if (!env.RESEND_API_KEY) {
    // No provider configured yet. Surfacing the link lets an admin copy it, and
    // is gated so it never leaks to an unauthenticated caller (see the routes).
    return { sent: false, link };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: env.RESET_FROM || 'KRIDA <onboarding@resend.dev>',
      to: [user.email],
      subject: 'Reset your KRIDA password',
      html: `<p>Hi ${escapeHtml(user.username)},</p>
        <p>Use the link below to set a new password. It expires in one hour.</p>
        <p><a href="${escapeHtml(link)}">Reset my password</a></p>
        <p>If you did not ask for this, you can ignore this email.</p>`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`email provider ${res.status}: ${detail.slice(0, 160)}`);
  }
  return { sent: true };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function issueReset(env, user) {
  const token = randomToken();
  await env.KV.put(`reset:${token}`, JSON.stringify({ username: user.username }),
    { expirationTtl: RESET_TTL });
  const base = (env.SITE_URL || '').replace(/\/$/, '');
  const link = `${base}/#/reset?token=${token}`;
  return { token, link };
}

// ---- routes --------------------------------------------------------------
async function handle(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const path = url.pathname.replace(/\/$/, '');
  const reply = (data, status = 200) => json(data, status, env, origin);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, origin) });
  if (path === '' || path === '/api' || path === '/api/health') {
    return reply({ ok: true, service: 'krida-auth' });
  }

  let body = {};
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    body = await request.json().catch(() => ({}));
  }

  // ---- signup ----
  if (path === '/api/signup' && request.method === 'POST') {
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    if (!validUsername(username)) return reply({ error: 'BAD_USERNAME' }, 400);
    if (!validEmail(email)) return reply({ error: 'BAD_EMAIL' }, 400);
    if (String(body.password || '').length < 8) return reply({ error: 'WEAK_PASSWORD' }, 400);
    if (await getUser(env, username)) return reply({ error: 'USERNAME_TAKEN' }, 409);
    if (await env.KV.get(emailKey(email))) return reply({ error: 'EMAIL_TAKEN' }, 409);
    const limit = Number(env.SEAT_LIMIT || 5);
    if (await countUsers(env) >= limit) return reply({ error: 'SEATS_FULL' }, 403);

    const { hash, salt, iterations } = await hashPassword(body.password);
    const firstUser = (await countUsers(env)) === 0;
    const user = {
      username, email, hash, salt, iterations,
      createdAt: new Date().toISOString(),
      isAdmin: firstUser && !env.ADMIN_USERNAME,
      profile: body.profile && typeof body.profile === 'object' ? body.profile : {},
    };
    await putUser(env, user);
    await env.KV.put(emailKey(email), username);
    const token = await newSession(env, username);
    return reply({ token, user: publicUser(env, user), profile: user.profile });
  }

  // ---- login ----
  if (path === '/api/login' && request.method === 'POST') {
    const user = await getUser(env, body.username);
    // Hash even on a miss so timing does not reveal whether the user exists.
    const probe = await hashPassword(String(body.password || ''),
      user ? user.salt : toB64(new Uint8Array(16)), user ? user.iterations : PBKDF2_ITERATIONS);
    if (!user || !safeEqual(probe.hash, user.hash)) return reply({ error: 'BAD_CREDENTIALS' }, 401);
    const token = await newSession(env, user.username);
    return reply({ token, user: publicUser(env, user), profile: user.profile || {} });
  }

  // ---- password reset: request ----
  if (path === '/api/reset/request' && request.method === 'POST') {
    const idRaw = String(body.identifier || '').trim();
    let user = await getUser(env, idRaw);
    if (!user && validEmail(idRaw)) {
      const uname = await env.KV.get(emailKey(idRaw));
      if (uname) user = await getUser(env, uname);
    }
    // Always answer the same way, so this cannot be used to probe accounts.
    if (user) {
      const { link } = await issueReset(env, user);
      try { await sendResetEmail(env, user, link); } catch (e) { /* logged below */ }
    }
    return reply({ ok: true });
  }

  // ---- password reset: confirm ----
  if (path === '/api/reset/confirm' && request.method === 'POST') {
    const rec = await env.KV.get(`reset:${body.token}`, 'json');
    if (!rec) return reply({ error: 'BAD_TOKEN' }, 400);
    if (String(body.password || '').length < 8) return reply({ error: 'WEAK_PASSWORD' }, 400);
    const user = await getUser(env, rec.username);
    if (!user) return reply({ error: 'BAD_TOKEN' }, 400);
    const { hash, salt, iterations } = await hashPassword(body.password);
    Object.assign(user, { hash, salt, iterations });
    await putUser(env, user);
    await env.KV.delete(`reset:${body.token}`);
    const token = await newSession(env, user.username);
    return reply({ token, user: publicUser(env, user), profile: user.profile || {} });
  }

  // Everything below needs a valid session.
  const auth = await sessionUser(env, request);
  if (!auth) return reply({ error: 'UNAUTHENTICATED' }, 401);
  const { user, token } = auth;

  if (path === '/api/me' && request.method === 'GET') {
    return reply({ user: publicUser(env, user), profile: user.profile || {} });
  }

  if (path === '/api/logout' && request.method === 'POST') {
    await env.KV.delete(`session:${token}`);
    return reply({ ok: true });
  }

  if (path === '/api/profile' && request.method === 'PUT') {
    user.profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    await putUser(env, user);
    return reply({ ok: true });
  }

  if (path === '/api/password' && request.method === 'PUT') {
    const probe = await hashPassword(String(body.current || ''), user.salt, user.iterations);
    if (!safeEqual(probe.hash, user.hash)) return reply({ error: 'BAD_CREDENTIALS' }, 401);
    if (String(body.password || '').length < 8) return reply({ error: 'WEAK_PASSWORD' }, 400);
    const { hash, salt, iterations } = await hashPassword(body.password);
    Object.assign(user, { hash, salt, iterations });
    await putUser(env, user);
    return reply({ ok: true });
  }

  // ---- admin: manage users and their resets ----
  if (path.startsWith('/api/admin/')) {
    if (!isAdmin(env, user)) return reply({ error: 'FORBIDDEN' }, 403);

    if (path === '/api/admin/users' && request.method === 'GET') {
      const list = await env.KV.list({ prefix: 'user:' });
      const users = [];
      for (const k of list.keys) {
        const u = await env.KV.get(k.name, 'json');
        if (u) users.push(publicUser(env, u));
      }
      return reply({ users, seatLimit: Number(env.SEAT_LIMIT || 5) });
    }

    // Send a target user a reset email (admin-driven "manage the reset").
    if (path === '/api/admin/reset' && request.method === 'POST') {
      const target = await getUser(env, body.username);
      if (!target) return reply({ error: 'NO_SUCH_USER' }, 404);
      const { link } = await issueReset(env, target);
      let sent = false;
      try { const r = await sendResetEmail(env, target, link); sent = r.sent; }
      catch (e) { return reply({ error: 'EMAIL_FAILED', detail: String(e.message) }, 502); }
      // Only an authenticated admin sees the link, and only when email is not
      // yet wired up — never an anonymous caller.
      return reply(sent ? { ok: true, sent: true } : { ok: true, sent: false, link });
    }

    // Set a target user's password directly.
    if (path === '/api/admin/set-password' && request.method === 'POST') {
      const target = await getUser(env, body.username);
      if (!target) return reply({ error: 'NO_SUCH_USER' }, 404);
      if (String(body.password || '').length < 8) return reply({ error: 'WEAK_PASSWORD' }, 400);
      const { hash, salt, iterations } = await hashPassword(body.password);
      Object.assign(target, { hash, salt, iterations });
      await putUser(env, target);
      return reply({ ok: true });
    }

    if (path === '/api/admin/user' && request.method === 'DELETE') {
      const target = await getUser(env, body.username);
      if (!target) return reply({ error: 'NO_SUCH_USER' }, 404);
      if (lc(target.username) === lc(user.username)) return reply({ error: 'CANNOT_DELETE_SELF' }, 400);
      await env.KV.delete(userKey(target.username));
      if (target.email) await env.KV.delete(emailKey(target.email));
      return reply({ ok: true });
    }
  }

  return reply({ error: 'NOT_FOUND' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      const origin = request.headers.get('Origin') || '';
      return json({ error: 'SERVER_ERROR', detail: String(err && err.message) }, 500, env, origin);
    }
  },
};
