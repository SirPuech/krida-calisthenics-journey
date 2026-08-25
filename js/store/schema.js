/**
 * The profile is the only thing this app writes. Everything else (the skill
 * catalogue) is static data shipped with the site.
 *
 * The shape is deliberately account-ready: `id`, `name` and `visibility` mean
 * nothing while there is one local profile, but they are what phase 2 (sign in
 * with GitHub) and phase 3 (leaderboard) hang off, so writing them now avoids a
 * migration later. See docs/ARCHITECTURE.md.
 */
export const SCHEMA_VERSION = 1;

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** A brand-new profile. */
export function blankProfile(name = 'Athlete') {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA_VERSION,
    id: 'local',
    name,
    createdAt: now,
    updatedAt: now,
    lang: 'en',
    // 'private' keeps the profile off any future leaderboard. Phase 3 will read
    // this before aggregating anything.
    visibility: 'private',
    cleared: {},      // skillId -> { at: ISO date }
    logs: [],         // { id, skillId, date: 'YYYY-MM-DD', type, sets, amount }
    standards: {},    // skillId -> { sets, amount, type }  (per-skill override)
    program: {        // weekday -> branch id, or 'rest'
      mon: 'push', tue: 'pull', wed: 'rest', thu: 'core',
      fri: 'handstand', sat: 'legs', sun: 'rest',
    },
  };
}

/**
 * Bring any stored profile up to the current schema. Old versions are migrated
 * in place; anything unrecognised falls back to a blank profile so a corrupt
 * record can never wedge the app.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return blankProfile();
  const base = blankProfile(raw.name || 'Athlete');
  const profile = { ...base, ...raw, schema: SCHEMA_VERSION };
  profile.cleared = raw.cleared && typeof raw.cleared === 'object' ? raw.cleared : {};
  profile.logs = Array.isArray(raw.logs) ? raw.logs : [];
  profile.standards = raw.standards && typeof raw.standards === 'object' ? raw.standards : {};
  profile.program = { ...base.program, ...(raw.program || {}) };
  return profile;
}

/** Cheap unique id for log entries — no dependency, good enough for one user. */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Local calendar date as YYYY-MM-DD (never UTC — streaks are a local idea). */
export function today(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
