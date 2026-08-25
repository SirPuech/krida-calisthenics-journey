/**
 * The unlock engine: turns the static catalogue plus a profile into everything
 * the views render — per-skill status, XP, streak, badges and what is next.
 *
 * Pure functions over (catalogue, profile). No storage, no DOM.
 */
import { today } from './store/schema.js';

export const STATUS = {
  CLEARED: 'cleared',      // standard met and signed off
  ACTIVE: 'active',        // being worked on right now
  AVAILABLE: 'available',  // every prerequisite cleared
  LOCKED: 'locked',        // still gated
};

/** The rep standard in force for a skill — the profile's override, or the default. */
export function standardFor(skill, profile) {
  return profile.standards?.[skill.id] || skill.standard;
}

/** Best single logged effort for a skill, by sets first then amount. */
export function bestLog(skillId, profile) {
  let best = null;
  for (const log of profile.logs) {
    if (log.skillId !== skillId) continue;
    if (!best || log.sets * 1000 + log.amount > best.sets * 1000 + best.amount) best = log;
  }
  return best;
}

/** 0–1 progress toward the standard, from the best logged effort. */
export function standardProgress(skill, profile) {
  const std = standardFor(skill, profile);
  const best = bestLog(skill.id, profile);
  if (!best) return 0;
  const target = (std.sets || 1) * (std.amount || 1);
  const done = (best.sets || 0) * (best.amount || 0);
  return Math.max(0, Math.min(1, done / target));
}

export function meetsStandard(skill, profile) {
  const std = standardFor(skill, profile);
  const best = bestLog(skill.id, profile);
  return Boolean(best && best.sets >= std.sets && best.amount >= std.amount);
}

/** Status for every skill, resolved in one pass. */
export function statusMap(catalogue, profile) {
  const map = new Map();
  const logged = new Set(profile.logs.map((l) => l.skillId));
  for (const skill of catalogue.skills) {
    if (profile.cleared[skill.id]) { map.set(skill.id, STATUS.CLEARED); continue; }
    const open = skill.prereqs.every((id) => Boolean(profile.cleared[id]));
    if (!open) map.set(skill.id, STATUS.LOCKED);
    else map.set(skill.id, logged.has(skill.id) ? STATUS.ACTIVE : STATUS.AVAILABLE);
  }
  return map;
}

export function statusOf(skill, catalogue, profile) {
  if (profile.cleared[skill.id]) return STATUS.CLEARED;
  if (!skill.prereqs.every((id) => Boolean(profile.cleared[id]))) return STATUS.LOCKED;
  return profile.logs.some((l) => l.skillId === skill.id) ? STATUS.ACTIVE : STATUS.AVAILABLE;
}

export function totalXp(catalogue, profile) {
  return Object.keys(profile.cleared)
    .reduce((sum, id) => sum + (catalogue.byId.get(id)?.xp || 0), 0);
}

/** Consecutive days up to today (or yesterday, if today is still untrained). */
export function streak(profile) {
  const days = new Set(profile.logs.map((l) => l.date));
  if (!days.size) return 0;
  const cursor = new Date();
  if (!days.has(today(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(today(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/** Longest streak ever reached — used by the 30/100-day badges. */
export function longestStreak(profile) {
  const days = [...new Set(profile.logs.map((l) => l.date))].sort();
  let best = 0, run = 0, prev = null;
  for (const day of days) {
    const d = new Date(`${day}T00:00:00`);
    run = prev && (d - prev) === 86400000 ? run + 1 : 1;
    prev = d;
    best = Math.max(best, run);
  }
  return best;
}

export function branchProgress(catalogue, profile) {
  return catalogue.branches.map((branch) => {
    const total = catalogue.branchCounts[branch.id] || 0;
    const done = catalogue.skills
      .filter((s) => s.branch === branch.id && profile.cleared[s.id]).length;
    return { ...branch, done, total, ratio: total ? done / total : 0 };
  });
}

/** Highest tier where at least one skill is cleared — the athlete's "level". */
export function currentTier(catalogue, profile) {
  let tier = 1;
  for (const id of Object.keys(profile.cleared)) {
    const skill = catalogue.byId.get(id);
    if (skill && skill.tier > tier) tier = skill.tier;
  }
  return tier;
}

/** When a skill's last remaining prerequisite was cleared, as a timestamp. */
function openedAt(skill, profile) {
  if (!skill.prereqs.length) return 0;   // entry skills were never "opened"
  return skill.prereqs.reduce((latest, id) => {
    const at = Date.parse(profile.cleared[id]?.at || 0) || 0;
    return Math.max(latest, at);
  }, 0);
}

/**
 * What to work on next, in priority order:
 *   1. skills already in progress, closest to their standard first
 *   2. skills the most recent clear just opened up
 *   3. anything else available, shallowest first
 *
 * Rule 2 is what stops a freshly unlocked skill from being buried under the
 * entry skills that have sat available since day one.
 */
export function nextUp(catalogue, profile, limit = 3) {
  const statuses = statusMap(catalogue, profile);
  const scored = catalogue.skills
    .filter((s) => statuses.get(s.id) === STATUS.ACTIVE || statuses.get(s.id) === STATUS.AVAILABLE)
    .map((skill) => ({
      skill,
      status: statuses.get(skill.id),
      progress: standardProgress(skill, profile),
      opened: openedAt(skill, profile),
    }))
    .sort((a, b) => {
      const active = (x) => (x.status === STATUS.ACTIVE ? 0 : 1);
      return active(a) - active(b)
        || b.progress - a.progress
        || b.opened - a.opened
        || a.skill.depth - b.skill.depth;
    });
  return scored.slice(0, limit);
}

export const BADGES = [
  { id: 'first', label: 'FIRST\nCLEAR', test: (c, p) => Object.keys(p.cleared).length >= 1 },
  { id: 'five', label: '5\nSKILLS', test: (c, p) => Object.keys(p.cleared).length >= 5 },
  { id: 'streak7', label: '7\nDAYS', test: (c, p) => longestStreak(p) >= 7 },
  { id: 'streak30', label: '30\nDAYS', test: (c, p) => longestStreak(p) >= 30 },
  { id: 'streak100', label: '100\nDAYS', test: (c, p) => longestStreak(p) >= 100 },
  { id: 'tier2', label: 'TIER 2\nENTERED', test: (c, p) => currentTier(c, p) >= 2 },
  { id: 'tier3', label: 'TIER 3\nENTERED', test: (c, p) => currentTier(c, p) >= 3 },
  {
    id: 'allbranch',
    label: 'EVERY\nBRANCH',
    test: (c, p) => branchProgress(c, p).every((b) => b.done > 0),
  },
];

export function badges(catalogue, profile) {
  return BADGES.map((b) => ({ ...b, earned: b.test(catalogue, profile) }));
}

/** One object with everything the dashboard and header need. */
export function summarise(catalogue, profile) {
  const statuses = statusMap(catalogue, profile);
  const counts = { cleared: 0, active: 0, available: 0, locked: 0 };
  statuses.forEach((s) => { counts[s] += 1; });
  return {
    statuses,
    counts,
    xp: totalXp(catalogue, profile),
    streak: streak(profile),
    tier: currentTier(catalogue, profile),
    branches: branchProgress(catalogue, profile),
    badges: badges(catalogue, profile),
    next: nextUp(catalogue, profile),
    total: catalogue.skills.length,
  };
}
