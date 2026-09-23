/**
 * The store: the active training profile, plus who owns it.
 *
 * Two modes, one contract. Views always read `store.profile`, call a mutator,
 * and re-render on `change` — they never know or care which mode is live:
 *
 *   guest    — an unsealed profile in this browser's localStorage. No account,
 *              no backend needed; the whole site works this way.
 *   account  — a username/password account on the Cloudflare Worker. The
 *              profile is fetched from and saved to the server; the session is
 *              a bearer token.
 *
 * Accounts exist only when data/config.json points at a deployed Worker; until
 * then `accountsAvailable` is false and the site is guest-only.
 */
import { blankProfile, migrate, uid, today } from './schema.js';
import { localAdapter } from './local.js';
import { makeApi, ApiError } from './api.js';

const listeners = new Set();
const TOKEN_KEY = 'krida.token.v1';
const GUEST_KEY = 'krida.guest.v1';

/** Take on a server session and its profile. Module-level, because `store` is
 *  an object literal and cannot hold a private method. */
function adopt(store, token, user, profile) {
  localStorage.setItem(TOKEN_KEY, token);
  store.session = { token, username: user.username, isAdmin: user.isAdmin };
  store.profile = migrate(profile && Object.keys(profile).length ? profile : blankProfile(user.username));
  store.profile.name = store.profile.name || user.username;
  store.emit();
}

/** Persist the active profile — local for a guest, debounced push for an account. */
function persist(store) {
  if (!store.session) { localAdapter.save(store.profile); return; }
  clearTimeout(store._pushTimer);
  store._pushTimer = setTimeout(() => {
    store.api.putProfile(store.session.token, store.profile)
      .catch((err) => console.warn('[krida] could not save profile to server', err));
  }, 1200);
}

export const store = {
  profile: blankProfile('Guest'),
  session: null,          // { token, username, isAdmin } in account mode
  api: makeApi(''),
  summaryProvider: null,

  /* ---------------- lifecycle ---------------- */

  get signedIn() { return Boolean(this.session); },
  get mode() { return this.session ? 'account' : 'guest'; },
  get accountsAvailable() { return this.api.configured; },
  get isAdmin() { return Boolean(this.session?.isAdmin); },

  get guestChosen() { return localStorage.getItem(GUEST_KEY) === '1'; },
  chooseGuest() { localStorage.setItem(GUEST_KEY, '1'); this.emit(); },

  /**
   * Wire up the backend, then restore a session if a token is stored and still
   * valid; otherwise fall back to the guest profile so the site is usable.
   */
  async init(apiBase) {
    this.api = makeApi(apiBase);
    const token = localStorage.getItem(TOKEN_KEY);
    if (this.api.configured && token) {
      try {
        const { user, profile } = await this.api.me(token);
        this.session = { token, username: user.username, isAdmin: user.isAdmin };
        this.profile = migrate(profile);
        this.profile.name = this.profile.name || user.username;
        return this.profile;
      } catch (err) {
        // A dead or rotated token just drops us to guest.
        if (err instanceof ApiError && err.status === 401) localStorage.removeItem(TOKEN_KEY);
      }
    }
    const guest = await localAdapter.load();
    this.profile = migrate(guest || blankProfile('Guest'));
    if (!guest) await localAdapter.save(this.profile);
    return this.profile;
  },

  setSummaryProvider(fn) { this.summaryProvider = fn; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach((fn) => fn(this.profile)); },

  /* ---------------- account actions ---------------- */

  async signup(username, email, password, carryGuest) {
    const carried = carryGuest && !this.session ? this.profile : undefined;
    const { token, user, profile } = await this.api.signup(username, email, password, carried);
    adopt(this, token, user, profile);
    if (carried) await localAdapter.clear();
  },

  async login(username, password) {
    const { token, user, profile } = await this.api.login(username, password);
    adopt(this, token, user, profile);
  },

  async requestReset(identifier) { return this.api.requestReset(identifier); },

  async confirmReset(token, password) {
    const res = await this.api.confirmReset(token, password);
    adopt(this, res.token, res.user, res.profile);
  },

  async changePassword(current, password) {
    await this.api.changePassword(this.session.token, current, password);
  },

  async signOut() {
    if (this.session) { try { await this.api.logout(this.session.token); } catch { /* ignore */ } }
    localStorage.removeItem(TOKEN_KEY);
    this.session = null;
    const guest = await localAdapter.load();
    this.profile = migrate(guest || blankProfile('Guest'));
    this.emit();
  },

  /** Whether the guest has anything worth carrying into a new account. */
  guestHasProgress() {
    if (this.session) return false;
    return Object.keys(this.profile.cleared).length > 0 || this.profile.logs.length > 0;
  },

  /* ---------------- admin ---------------- */

  adminUsers() { return this.api.adminUsers(this.session.token); },
  adminReset(username) { return this.api.adminReset(this.session.token, username); },
  adminSetPassword(username, pw) { return this.api.adminSetPassword(this.session.token, username, pw); },
  adminDeleteUser(username) { return this.api.adminDeleteUser(this.session.token, username); },

  /* ---------------- mutations ---------------- */

  update(mutator) {
    mutator(this.profile);
    this.profile.updatedAt = new Date().toISOString();
    this.emit();
    persist(this);
  },

  replace(profile) {
    const id = this.profile.id;
    this.profile = migrate(profile);
    this.profile.id = id;
    this.emit();
    persist(this);
  },

  logSet(skillId, { sets, amount, type, date }) {
    this.update((p) => {
      p.logs.unshift({
        id: uid(), skillId, date: date || today(), type,
        sets: Number(sets) || 0, amount: Number(amount) || 0,
      });
      p.logs = p.logs.slice(0, 2000);
    });
  },
  removeLog(logId) { this.update((p) => { p.logs = p.logs.filter((l) => l.id !== logId); }); },
  setCleared(skillId, cleared) {
    this.update((p) => {
      if (cleared) p.cleared[skillId] = { at: new Date().toISOString() };
      else delete p.cleared[skillId];
    });
  },
  setStandard(skillId, standard) {
    this.update((p) => {
      if (standard) p.standards[skillId] = standard;
      else delete p.standards[skillId];
    });
  },
  setProgramDay(day, focus) {
    this.update((p) => { if (focus) p.program.days[day] = focus; else delete p.program.days[day]; });
  },
  setProgramLevel(level) {
    this.update((p) => {
      p.program.level = level === 'auto' ? 'auto' : Number(level);
      p.program.templateId = null; p.program.days = {};
    });
  },
  setProgramTemplate(templateId) {
    this.update((p) => { p.program.templateId = templateId || null; p.program.days = {}; });
  },
  setName(name) { this.update((p) => { p.name = name.trim() || 'Athlete'; }); },
  setVisibility(visibility) { this.update((p) => { p.visibility = visibility; }); },

  reset() {
    const { id, name } = this.profile;
    this.profile = blankProfile(name);
    this.profile.id = id;
    this.emit();
    persist(this);
  },
};

export { today };
