/**
 * The store: the signed-in account's profile, sealed to disk on every change
 * and optionally mirrored — as a whole roster — to a shared GitHub Gist.
 *
 * Views never touch an adapter or the crypto. They read `store.profile`, call a
 * mutator, and re-render on the `change` subscription. That contract is
 * unchanged from phase 1; accounts slid in underneath it.
 */
import { blankProfile, migrate, uid, today } from './schema.js';
import { localAdapter } from './local.js';
import { gistAdapter, readConfig, writeConfig } from './gist.js';
import * as accounts from './accounts.js';

const listeners = new Set();
// The passphrase lives in sessionStorage, not localStorage: it survives a
// reload so the app is usable, and dies with the tab so a shared machine does
// not stay unlocked. It is never written to disk or sent anywhere.
const SESSION_KEY = 'krida.session.v1';
// Set once the visitor has explicitly chosen to look around without an account,
// so the landing page stops asking.
const GUEST_KEY = 'krida.guest.v1';

/** Begin a tab-scoped session. `store` is an object literal, so this is a
 *  module-level helper rather than a private method. */
function startSession(store, accountId, passphrase, profile) {
  store.session = { accountId, passphrase };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(store.session));
  store.profile = profile;
  store.emit();
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export const store = {
  profile: blankProfile(),
  session: null,                       // { accountId, passphrase }
  remoteState: { status: 'off', message: '', at: null },
  summaryProvider: null,               // set by app.js once the catalogue is up

  /* ---------------- lifecycle ---------------- */

  get signedIn() { return Boolean(this.session); },

  /** 'account' once someone has unlocked a vault, otherwise 'guest'. */
  get mode() { return this.session ? 'account' : 'guest'; },

  /** Has the visitor dismissed the landing page's guest/account choice? */
  get guestChosen() { return localStorage.getItem(GUEST_KEY) === '1'; },
  chooseGuest() {
    localStorage.setItem(GUEST_KEY, '1');
    this.emit();
  },

  /**
   * Restore a tab-scoped session if one is live; otherwise fall back to the
   * guest profile so the whole site is browsable without an account.
   *
   * The guest profile is the same unsealed record phase 1 used, which is what
   * lets `claimLegacy` turn a guest's progress into a real account rather than
   * making them start over.
   */
  async init() {
    const session = readSession();
    if (session?.accountId && session.passphrase) {
      try {
        this.profile = await accounts.signIn(session.accountId, session.passphrase);
        this.session = session;
        if (gistAdapter.isConfigured()) this.remoteState = { status: 'idle', message: '', at: null };
        return this.profile;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);       // stale or rotated
        this.session = null;
      }
    }
    const guest = await localAdapter.load();
    this.profile = migrate(guest || blankProfile('Guest'));
    if (!guest) await localAdapter.save(this.profile);
    if (gistAdapter.isConfigured()) this.remoteState = { status: 'idle', message: '', at: null };
    return this.profile;
  },

  setSummaryProvider(fn) { this.summaryProvider = fn; },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit() { listeners.forEach((fn) => fn(this.profile)); },

  /* ---------------- accounts ---------------- */

  listAccounts: accounts.listAccounts,
  isFull: accounts.isFull,
  nameTaken: accounts.nameTaken,
  maxAccounts: accounts.MAX_ACCOUNTS,

  async createAccount(name, passphrase) {
    const { id, profile } = await accounts.createAccount(name, passphrase);
    startSession(this, id, passphrase, profile);
    return profile;
  },

  async signIn(accountId, passphrase) {
    const profile = await accounts.signIn(accountId, passphrase);
    startSession(this, accountId, passphrase, profile);
    return profile;
  },

  /** Drop back to guest rather than to a dead end. */
  async signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    this.session = null;
    const guest = await localAdapter.load();
    this.profile = migrate(guest || blankProfile('Guest'));
    this.emit();
  },

  async changePassphrase(oldPassphrase, newPassphrase) {
    if (!this.session) throw new Error('NOT_SIGNED_IN');
    await accounts.changePassphrase(this.session.accountId, oldPassphrase, newPassphrase);
    this.session = { ...this.session, passphrase: newPassphrase };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
  },

  async deleteAccount(passphrase) {
    if (!this.session) throw new Error('NOT_SIGNED_IN');
    await accounts.deleteAccount(this.session.accountId, passphrase);
    this.signOut();
  },

  /* ---------------- legacy phase-1 profile ---------------- */

  /** A single unsealed profile from before accounts existed. */
  async legacyProfile() {
    const raw = await localAdapter.load();
    return raw ? migrate(raw) : null;
  },

  /**
   * Turn the guest profile into a real account, keeping everything logged so
   * far. Used both by a guest signing up and by anyone upgrading a profile
   * from before accounts existed.
   */
  async claimLegacy(name, passphrase) {
    const legacy = this.session ? null : this.profile;
    const carried = legacy || await this.legacyProfile();
    if (!carried) throw new Error('NO_LEGACY');
    const { id } = await accounts.createAccount(name, passphrase);
    carried.id = id;
    carried.name = name.trim();
    startSession(this, id, passphrase, carried);
    await this.persist();
    await localAdapter.clear();
    return carried;
  },

  /** Has the guest actually done anything worth carrying into an account? */
  guestHasProgress() {
    if (this.session) return false;
    return Object.keys(this.profile.cleared).length > 0 || this.profile.logs.length > 0;
  },

  /* ---------------- mutations ---------------- */

  /**
   * Apply a mutation, notify immediately, then seal in the background.
   *
   * Sealing is async (PBKDF2 is deliberately slow), so the UI is updated from
   * memory first and the write follows. A failed write surfaces through
   * remoteState rather than silently dropping.
   */
  update(mutator) {
    mutator(this.profile);
    this.profile.updatedAt = new Date().toISOString();
    this.emit();
    this.persist().catch((err) => console.error('[krida] could not save profile', err));
    if (this.session) this.queueRemotePush();
  },

  /**
   * A guest's profile is written unsealed; an account's is sealed under its
   * passphrase. Same call site either way, so views never branch on mode.
   */
  async persist() {
    if (!this.session) {
      await localAdapter.save(this.profile);
      return;
    }
    const summary = this.summaryProvider ? this.summaryProvider(this.profile) : null;
    await accounts.saveProfile(
      this.session.accountId, this.profile, this.session.passphrase, summary,
    );
  },

  replace(profile) {
    const id = this.profile.id;
    this.profile = migrate(profile);
    this.profile.id = id;
    this.emit();
    this.persist().catch((err) => console.error('[krida] could not save profile', err));
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

  removeLog(logId) {
    this.update((p) => { p.logs = p.logs.filter((l) => l.id !== logId); });
  },

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
    this.update((p) => {
      if (focus) p.program.days[day] = focus;
      else delete p.program.days[day];
    });
  },

  setProgramLevel(level) {
    this.update((p) => {
      p.program.level = level === 'auto' ? 'auto' : Number(level);
      p.program.templateId = null;
      p.program.days = {};
    });
  },

  setProgramTemplate(templateId) {
    this.update((p) => {
      p.program.templateId = templateId || null;
      p.program.days = {};
    });
  },

  setName(name) {
    this.update((p) => { p.name = name.trim() || 'Athlete'; });
  },

  setVisibility(visibility) {
    this.update((p) => { p.visibility = visibility; });
  },

  reset() {
    const { id, name } = this.profile;
    this.profile = blankProfile(name);
    this.profile.id = id;
    this.emit();
    this.persist().catch((err) => console.error('[krida] could not save profile', err));
  },

  /* ---------------- shared roster mirror ---------------- */

  remoteConfig: readConfig,
  publicBoard: accounts.publicBoard,

  writeRemoteConfig(config) {
    writeConfig(config);
    this.remoteState = config?.token
      ? { status: 'idle', message: '', at: null }
      : { status: 'off', message: '', at: null };
    this.emit();
  },

  queueRemotePush() {
    if (!gistAdapter.isConfigured()) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => this.pushRemote().catch(() => {}), 4000);
  },

  async pushRemote() {
    if (!gistAdapter.isConfigured()) throw new Error('GitHub sync is not set up.');
    this.remoteState = { status: 'syncing', message: '', at: null };
    this.emit();
    try {
      await gistAdapter.save(accounts.readRoster());
      this.remoteState = { status: 'ok', message: 'Pushed', at: new Date().toISOString() };
    } catch (err) {
      this.remoteState = { status: 'error', message: err.message, at: new Date().toISOString() };
      this.emit();
      throw err;
    }
    this.emit();
  },

  /**
   * Pull the shared roster and merge it in. Other people's vaults stay sealed —
   * this only ever adds or refreshes opaque entries.
   */
  async pullRemote() {
    if (!gistAdapter.isConfigured()) throw new Error('GitHub sync is not set up.');
    this.remoteState = { status: 'syncing', message: '', at: null };
    this.emit();
    try {
      const remote = await gistAdapter.load();
      if (!remote) throw new Error('Nothing stored in that gist yet — push first.');
      const result = accounts.mergeRoster(remote);
      // If our own account moved on elsewhere, re-open it with the live passphrase.
      if (this.session) {
        try {
          this.profile = await accounts.signIn(this.session.accountId, this.session.passphrase);
        } catch {
          this.signOut();
        }
      }
      this.remoteState = {
        status: 'ok',
        message: `Merged — ${result.added} new, ${result.updated} updated`,
        at: new Date().toISOString(),
      };
      this.emit();
      return result;
    } catch (err) {
      this.remoteState = { status: 'error', message: err.message, at: new Date().toISOString() };
      this.emit();
      throw err;
    }
  },
};

export { gistAdapter, localAdapter, today };
