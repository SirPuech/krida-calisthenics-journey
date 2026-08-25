/**
 * Optional phase-1.5 storage: a private GitHub Gist, so one person's progress
 * follows them between devices without any server of our own.
 *
 * The token lives in this browser's localStorage and is sent only to
 * api.github.com. Use a fine-grained personal access token whose *only*
 * permission is "Gists: read and write" — it can then touch nothing else on the
 * account. Settings → "Sync with GitHub" explains this in the UI too.
 *
 * Phase 2 replaces the pasted token with a real OAuth flow; the load/save
 * contract below does not change.
 */
import { localAdapter } from './local.js';

const CONFIG_KEY = 'krida.remote.v1';
const FILENAME = 'krida-progress.json';
const API = 'https://api.github.com';

export function readConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeConfig(config) {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(CONFIG_KEY);
}

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let message = `GitHub responded ${res.status}`;
    if (res.status === 401) message = 'GitHub rejected the token (401). Check it has the Gists permission.';
    else if (res.status === 404) message = 'Gist not found (404). Check the gist id, or leave it blank to create one.';
    else if (res.status === 403) message = 'GitHub refused the request (403) — rate limited or missing Gists permission.';
    throw new Error(`${message}${detail ? ` — ${detail.slice(0, 160)}` : ''}`);
  }
  return res.status === 204 ? null : res.json();
}

export const gistAdapter = {
  id: 'gist',
  label: 'GitHub Gist',
  isConfigured: () => Boolean(readConfig()?.token),

  async load() {
    const config = readConfig();
    if (!config?.token || !config.gistId) return null;
    const gist = await call(`/gists/${config.gistId}`, { token: config.token });
    const file = gist.files?.[FILENAME];
    if (!file) throw new Error(`That gist has no ${FILENAME} file.`);
    // GitHub truncates large files and hands back a raw_url instead.
    const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
    return JSON.parse(content);
  },

  async save(profile) {
    const config = readConfig();
    if (!config?.token) throw new Error('No GitHub token configured.');
    const files = { [FILENAME]: { content: JSON.stringify(profile, null, 1) } };
    if (config.gistId) {
      await call(`/gists/${config.gistId}`, { token: config.token, method: 'PATCH', body: { files } });
      return config.gistId;
    }
    const created = await call('/gists', {
      token: config.token,
      method: 'POST',
      body: { description: 'KRIDA Calisthenics Journey — progress', public: false, files },
    });
    writeConfig({ ...config, gistId: created.id });
    return created.id;
  },

  /** Confirm the token works and report who it belongs to. */
  async whoami(token) {
    const user = await call('/user', { token });
    return user.login;
  },
};

export { localAdapter };
