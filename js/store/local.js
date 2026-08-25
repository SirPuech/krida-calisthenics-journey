/**
 * Phase 1 storage: this browser's localStorage.
 *
 * Implements the adapter contract every store backend has to satisfy:
 *   id, label, isConfigured(), load() -> profile|null, save(profile)
 * Phase 2 swaps in a GitHub-account-backed adapter behind the same four calls.
 */
const KEY = 'krida.profile.v1';

export const localAdapter = {
  id: 'local',
  label: 'This device',
  isConfigured: () => true,

  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[krida] could not read local profile', err);
      return null;
    }
  },

  async save(profile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
  },

  async clear() {
    localStorage.removeItem(KEY);
  },
};
