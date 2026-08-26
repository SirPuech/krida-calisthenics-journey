/**
 * Passphrase-derived encryption for account vaults (WebCrypto, no dependencies).
 *
 * Each account's training data is sealed with AES-GCM under a key derived from
 * that account's passphrase via PBKDF2. The roster — names and, for anyone who
 * opts in, a small public summary — stays in the clear so the sign-in list and
 * a future leaderboard can read it without anyone's passphrase.
 *
 * What this does buy: the shared Gist and this browser's localStorage hold
 * ciphertext, so one member of the group cannot read another's log.
 * What it does not: there is no recovery. Lose the passphrase, lose the vault.
 *
 * Requires a secure context — https or localhost. GitHub Pages is https.
 */
const ITERATIONS = 250_000;
const HASH = 'SHA-256';
const KEY_BITS = 256;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function cryptoAvailable() {
  return typeof crypto !== 'undefined' && Boolean(crypto.subtle);
}

function toB64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function randomId() {
  return toB64(randomBytes(12)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: HASH },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Seal a JSON-serialisable value. Returns the kdf params and the ciphertext. */
export async function seal(value, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)),
  );
  return {
    kdf: { salt: toB64(salt), iterations: ITERATIONS, hash: HASH },
    vault: { iv: toB64(iv), data: toB64(data) },
  };
}

/**
 * Open a sealed vault. Throws on a wrong passphrase — AES-GCM authenticates,
 * so a bad key fails to decrypt rather than returning garbage.
 */
export async function open({ kdf, vault }, passphrase) {
  const key = await deriveKey(passphrase, fromB64(kdf.salt), kdf.iterations);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data),
    );
  } catch {
    throw new Error('WRONG_PASSPHRASE');
  }
  return JSON.parse(decoder.decode(plain));
}

/** Re-seal an already-open value under a new passphrase. */
export async function reseal(value, newPassphrase) {
  return seal(value, newPassphrase);
}
