/**
 * The coach: turns a training level and a day's focus into a structured session.
 *
 * All the coaching judgement lives in data/programs.json — splits, block order,
 * and set/rep prescriptions per level. This file only resolves those rules
 * against the athlete's actual unlock state, so retuning the programming is a
 * JSON edit, not a code change.
 *
 * Pure functions over (catalogue, programs, profile).
 */
import { STATUS, statusMap, standardProgress, standardFor } from './progress.js';
import { currentTier } from './progress.js';

const MIN_TIER = 1;
const MAX_TIER = 4;

const clampTier = (n) => Math.max(MIN_TIER, Math.min(MAX_TIER, n));

/**
 * The level sessions are written for: whatever the athlete has explicitly
 * chosen, or — on 'auto' — the highest tier they have cleared anything in.
 */
export function resolveLevel(catalogue, profile) {
  const chosen = profile.program?.level ?? 'auto';
  if (chosen === 'auto') return { tier: currentTier(catalogue, profile), auto: true };
  return { tier: clampTier(Number(chosen)), auto: false };
}

/** Templates written for a level, best match first, then the neighbouring ones. */
export function templatesFor(programs, tier) {
  return [...programs.templates].sort((a, b) =>
    Math.abs(a.tier - tier) - Math.abs(b.tier - tier)
    || a.sessionsPerWeek - b.sessionsPerWeek);
}

export function templateById(programs, id) {
  return programs.templates.find((x) => x.id === id) || null;
}

/** The template in force: the athlete's pick, else the best fit for their level. */
export function activeTemplate(programs, catalogue, profile) {
  const { tier } = resolveLevel(catalogue, profile);
  return templateById(programs, profile.program?.templateId) || templatesFor(programs, tier)[0];
}

/** A day's focus: a per-day override if the athlete set one, else the template's. */
export function focusForDay(programs, template, profile, day) {
  const override = profile.program?.days?.[day];
  const focusId = override || template?.week?.[day] || 'rest';
  return programs.focus[focusId] ? focusId : 'rest';
}

/**
 * Pick skills for one block.
 *
 * Tries the block's target tier first, then widens outward, so a session is
 * always fillable even when a branch is thin at the athlete's exact level.
 * `taken` stops the same skill turning up in two blocks of one session.
 */
function inPool(status, pool) {
  const working = status === STATUS.ACTIVE || status === STATUS.AVAILABLE;
  if (pool === 'owned') return status === STATUS.CLEARED;
  if (pool === 'any') return working || status === STATUS.CLEARED;
  return working;
}

function pickSkills(catalogue, profile, statuses, { branches, pick, targetTier, count, taken, pool }) {
  const eligible = (wanted) => catalogue.skills.filter((skill) => {
    if (!branches.includes(skill.branch)) return false;
    if (taken.has(skill.id)) return false;
    if (!inPool(statuses.get(skill.id), wanted)) return false;
    if (pick === 'hold' && skill.standard.type !== 'hold') return false;
    if (pick === 'reps' && skill.standard.type !== 'reps') return false;
    return true;
  });

  // An accessory block wants cleared skills; early on there may be none, so
  // fall back to the working pool rather than dropping the block entirely.
  let trainable = eligible(pool);
  if (!trainable.length && pool !== 'any') trainable = eligible('any');

  const rank = (skill) => (statuses.get(skill.id) === STATUS.ACTIVE ? 0 : 1);
  const chosen = [];
  // Widen the tier window until the block is full or we run out of skills.
  for (let spread = 0; spread <= MAX_TIER && chosen.length < count; spread += 1) {
    const band = trainable
      .filter((s) => !chosen.includes(s) && Math.abs(s.tier - targetTier) === spread)
      .sort((a, b) => rank(a) - rank(b)
        || standardProgress(b, profile) - standardProgress(a, profile)
        || a.depth - b.depth);
    chosen.push(...band.slice(0, count - chosen.length));
  }
  chosen.forEach((s) => taken.add(s.id));
  return chosen;
}

/**
 * Build one session. Returns null for a rest day.
 *
 * Every prescription is reported alongside the athlete's own standard for that
 * skill, so the session says what to do today without overwriting the target
 * they are actually chasing.
 */
export function buildSession(catalogue, programs, profile, focusId, tier) {
  const focus = programs.focus[focusId];
  if (!focus || !focus.branches.length) return null;

  const statuses = statusMap(catalogue, profile);
  const taken = new Set();
  const prescriptions = programs.prescriptions[String(clampTier(tier))] || {};

  const blocks = programs.blocks.map((block) => {
    const targetTier = clampTier(tier + (block.tierOffset || 0));
    // A mobility day is accessory volume only — no heavy static or max work.
    const count = focus.light && block.id !== 'accessory' ? 1 : block.count;
    const skills = pickSkills(catalogue, profile, statuses, {
      branches: focus.branches,
      pick: block.pick,
      targetTier,
      count,
      taken,
      pool: block.include || 'working',
    });
    return {
      ...block,
      targetTier,
      prescription: focus.light ? prescriptions.accessory : prescriptions[block.id],
      items: skills.map((skill) => ({
        skill,
        status: statuses.get(skill.id),
        standard: standardFor(skill, profile),
        progress: standardProgress(skill, profile),
      })),
    };
  });

  return {
    focusId,
    focus,
    tier: clampTier(tier),
    blocks,
    total: blocks.reduce((n, b) => n + b.items.length, 0),
  };
}

/**
 * Copy from data/programs.json in the active language.
 *
 * Falls back to English whenever the coach has not supplied a translation, so
 * a half-translated file renders rather than showing blanks.
 */
export function coachText(record, field, lang) {
  if (lang && lang !== 'en') {
    const translated = record?.[`${field}Th`];
    if (translated) return translated;
  }
  return record?.[field] ?? '';
}

/** Format a prescription the way it should read on a session card. */
export function formatPrescription(p) {
  if (!p) return '';
  return p.unit === 's' ? `${p.sets} × ${p.amount}s` : `${p.sets} × ${p.amount}`;
}
