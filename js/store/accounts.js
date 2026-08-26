/**
 * The account roster: up to five people sharing one deployment.
 *
 * Shape on disk (localStorage, and the shared Gist when sync is on):
 *
 *   { schema, maxAccounts, accounts: [
 *       { id, name, createdAt, updatedAt,
 *         kdf:   { salt, iterations, hash },   // passphrase derivation
 *         vault: { iv, data },                 // AES-GCM sealed profile
 *         public: null | { name, xp, streak, tier, cleared, updatedAt } } ] }
 *
 * Names are deliberately in the clear: the sign-in screen needs them, and the
 * phase-3 leaderboard reads `public` without holding anyone's passphrase.
 * Everything else about a person is inside the vault.
 */
import { seal, open, randomId, cryptoAvailable } from '../crypto.js';
import { blankProfile, migrate } from './schema.js';

const KEY = 'krida.accounts.v1';
export const MAX_ACCOUNTS = 5;
export const SCHEMA = 1;

const emptyRoster = () => ({ schema: SCHEMA, maxAccounts: MAX_ACCOUNTS, accounts: [] });

export function readRoster() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || !Array.isArray(raw.accounts)) return emptyRoster();
    return { ...emptyRoster(), ...raw };
  } catch {
    return emptyRoster();
  }
}

export function writeRoster(roster) {
  localStorage.setItem(KEY, JSON.stringify(roster));
}

/** Just what the sign-in screen needs — never any vault material. */
export function listAccounts() {
  return readRoster().accounts.map(({ id, name, createdAt, public: pub }) => ({
    id, name, createdAt, hasPublic: Boolean(pub),
  }));
}

export function isFull() {
  return readRoster().accounts.length >= MAX_ACCOUNTS;
}

export function nameTaken(name) {
  const wanted = name.trim().toLowerCase();
  return readRoster().accounts.some((a) => a.name.trim().toLowerCase() === wanted);
}

function findAccount(roster, id) {
  return roster.accounts.find((a) => a.id === id);
}

/** Create an account and return its id plus the fresh profile, signed in. */
export async function createAccount(name, passphrase) {
  if (!cryptoAvailable()) throw new Error('NO_CRYPTO');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('NAME_REQUIRED');
  if (passphrase.length < 8) throw new Error('PASSPHRASE_TOO_SHORT');

  const roster = readRoster();
  if (roster.accounts.length >= roster.maxAccounts) throw new Error('ROSTER_FULL');
  if (roster.accounts.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('NAME_TAKEN');
  }

  const id = randomId();
  const profile = blankProfile(trimmed);
  profile.id = id;
  const sealed = await seal(profile, passphrase);
  const now = new Date().toISOString();

  roster.accounts.push({ id, name: trimmed, createdAt: now, updatedAt: now, ...sealed, public: null });
  writeRoster(roster);
  return { id, profile };
}

/** Unseal an account. Throws WRONG_PASSPHRASE if the passphrase does not fit. */
export async function signIn(id, passphrase) {
  const account = findAccount(readRoster(), id);
  if (!account) throw new Error('NO_SUCH_ACCOUNT');
  const profile = migrate(await open(account, passphrase));
  profile.id = id;
  profile.name = account.name;
  return profile;
}

/**
 * Re-seal a profile after a change.
 *
 * The passphrase is required on every save rather than a derived key being
 * cached, so signing out or closing the tab genuinely ends access.
 */
export async function saveProfile(id, profile, passphrase, summary) {
  const roster = readRoster();
  const account = findAccount(roster, id);
  if (!account) throw new Error('NO_SUCH_ACCOUNT');
  const sealed = await seal(profile, passphrase);
  Object.assign(account, sealed, {
    name: profile.name || account.name,
    updatedAt: new Date().toISOString(),
    // Only published when the athlete opted in; phase 3 reads exactly this.
    public: profile.visibility === 'public' && summary
      ? { name: profile.name, ...summary, updatedAt: new Date().toISOString() }
      : null,
  });
  writeRoster(roster);
}

export async function changePassphrase(id, oldPassphrase, newPassphrase) {
  if (newPassphrase.length < 8) throw new Error('PASSPHRASE_TOO_SHORT');
  const roster = readRoster();
  const account = findAccount(roster, id);
  if (!account) throw new Error('NO_SUCH_ACCOUNT');
  const profile = await open(account, oldPassphrase);   // throws if wrong
  Object.assign(account, await seal(profile, newPassphrase), {
    updatedAt: new Date().toISOString(),
  });
  writeRoster(roster);
}

/** Deleting needs the passphrase, so one member cannot remove another. */
export async function deleteAccount(id, passphrase) {
  const roster = readRoster();
  const account = findAccount(roster, id);
  if (!account) throw new Error('NO_SUCH_ACCOUNT');
  await open(account, passphrase);
  roster.accounts = roster.accounts.filter((a) => a.id !== id);
  writeRoster(roster);
}

/**
 * Merge a roster pulled from the shared Gist into the local one.
 *
 * Vaults are opaque here — no passphrase is involved — so the merge is by id
 * and `updatedAt`, newest wins. That is the right rule for one person on two
 * devices, and for five people it means each account is only ever written by
 * the one who can open it.
 */
export function mergeRoster(remote) {
  if (!remote || !Array.isArray(remote.accounts)) throw new Error('BAD_ROSTER');
  const local = readRoster();
  const byId = new Map(local.accounts.map((a) => [a.id, a]));
  let added = 0;
  let updated = 0;
  for (const incoming of remote.accounts) {
    const mine = byId.get(incoming.id);
    if (!mine) {
      byId.set(incoming.id, incoming);
      added += 1;
    } else if ((incoming.updatedAt || '') > (mine.updatedAt || '')) {
      byId.set(incoming.id, incoming);
      updated += 1;
    }
  }
  const merged = {
    ...local,
    accounts: [...byId.values()]
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      .slice(0, MAX_ACCOUNTS),
  };
  writeRoster(merged);
  return { added, updated, total: merged.accounts.length };
}

/** The plaintext slice a leaderboard would consume. Opted-in accounts only. */
export function publicBoard() {
  return readRoster().accounts
    .map((a) => a.public)
    .filter(Boolean)
    .sort((a, b) => (b.xp || 0) - (a.xp || 0));
}
