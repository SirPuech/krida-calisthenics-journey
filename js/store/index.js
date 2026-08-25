/**
 * The store: one active profile, saved locally on every change and optionally
 * mirrored to a GitHub Gist.
 *
 * Views never touch an adapter directly — they read `store.profile`, call a
 * mutator, and re-render from the `change` subscription. That indirection is
 * what lets phase 2 introduce real accounts without rewriting any view.
 */
import { blankProfile, migrate, uid, today } from './schema.js';
import { localAdapter } from './local.js';
import { gistAdapter, readConfig, writeConfig } from './gist.js';

const listeners = new Set();

export const store = {
  profile: blankProfile(),
  remoteState: { status: 'off', message: '', at: null },

  /* ---------------- lifecycle ---------------- */

  async init() {
    const stored = await localAdapter.load();
    this.profile = migrate(stored || blankProfile('Puech'));
    if (!stored) await localAdapter.save(this.profile);
    if (gistAdapter.isConfigured()) this.remoteState = { status: 'idle', message: '', at: null };
    return this.profile;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit() {
    listeners.forEach((fn) => fn(this.profile));
  },

  /**
   * Apply a mutation, persist locally, notify. Local writes are synchronous
   * from the caller's point of view so the UI never renders stale state.
   */
  update(mutator) {
    mutator(this.profile);
    this.profile.updatedAt = new Date().toISOString();
    localAdapter.save(this.profile);
    this.emit();
    this.queueRemotePush();
  },

  replace(profile) {
    this.profile = migrate(profile);
    localAdapter.save(this.profile);
    this.emit();
  },

  /* ---------------- mutations ---------------- */

  logSet(skillId, { sets, amount, type, date }) {
    this.update((p) => {
      p.logs.unshift({
        id: uid(),
        skillId,
        date: date || today(),
        type,
        sets: Number(sets) || 0,
        amount: Number(amount) || 0,
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

  setProgramDay(day, branch) {
    this.update((p) => { p.program[day] = branch; });
  },

  setName(name) {
    this.update((p) => { p.name = name.trim() || 'Athlete'; });
  },

  setVisibility(visibility) {
    this.update((p) => { p.visibility = visibility; });
  },

  reset() {
    this.profile = blankProfile(this.profile.name);
    localAdapter.save(this.profile);
    this.emit();
  },

  /* ---------------- remote mirror ---------------- */

  remoteConfig: readConfig,
  writeRemoteConfig(config) {
    writeConfig(config);
    this.remoteState = config?.token
      ? { status: 'idle', message: '', at: null }
      : { status: 'off', message: '', at: null };
    this.emit();
  },

  /** Debounced so a burst of edits costs one API call, not ten. */
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
      await gistAdapter.save(this.profile);
      this.remoteState = { status: 'ok', message: 'Pushed', at: new Date().toISOString() };
    } catch (err) {
      this.remoteState = { status: 'error', message: err.message, at: new Date().toISOString() };
      this.emit();
      throw err;
    }
    this.emit();
  },

  async pullRemote() {
    if (!gistAdapter.isConfigured()) throw new Error('GitHub sync is not set up.');
    this.remoteState = { status: 'syncing', message: '', at: null };
    this.emit();
    try {
      const remote = await gistAdapter.load();
      if (!remote) throw new Error('Nothing stored in that gist yet — push first.');
      this.replace(remote);
      this.remoteState = { status: 'ok', message: 'Pulled', at: new Date().toISOString() };
    } catch (err) {
      this.remoteState = { status: 'error', message: err.message, at: new Date().toISOString() };
      this.emit();
      throw err;
    }
    this.emit();
  },
};

export { gistAdapter, localAdapter, today };
