import { t } from '../i18n.js';
import { esc, formatDate } from '../dom.js';
import { cryptoAvailable } from '../crypto.js';

const ERRORS = {
  WRONG_PASSPHRASE: 'auth.err.passphrase',
  PASSPHRASE_TOO_SHORT: 'auth.err.short',
  NAME_TAKEN: 'auth.err.taken',
  NAME_REQUIRED: 'auth.err.name',
  ROSTER_FULL: 'auth.err.full',
  NO_SUCH_ACCOUNT: 'auth.err.missing',
  NO_CRYPTO: 'auth.err.crypto',
};

const message = (err) => t(ERRORS[err.message] || 'auth.err.generic');

/** Which panel is showing: the account list, the create form, or legacy claim. */
let mode = null;
let pendingId = null;

export default function renderSignIn(ctx) {
  const { store, mount, rerender } = ctx;
  const accounts = store.listAccounts();
  const full = store.isFull();
  const legacy = ctx.legacyProfile;

  if (!mode) mode = accounts.length ? 'list' : (legacy ? 'legacy' : 'create');
  if (mode === 'list' && !accounts.length) mode = 'create';

  const seats = `${accounts.length} / ${store.maxAccounts}`;

  mount.innerHTML = `
    <div class="auth">
      <div class="auth-brand">
        <div class="wordmark">KRIDA<span class="dot">.</span></div>
        <p>${esc(t('auth.tagline'))}</p>
      </div>

      ${!cryptoAvailable() ? `<div class="notice">${esc(t('auth.err.crypto'))}</div>` : ''}

      <div class="auth-card">
        <div class="auth-tabs">
          <button data-mode="list" class="${mode === 'list' ? 'is-on' : ''}" ${accounts.length ? '' : 'disabled'}>
            ${esc(t('auth.signIn'))}
          </button>
          <button data-mode="create" class="${mode === 'create' ? 'is-on' : ''}" ${full ? 'disabled' : ''}>
            ${esc(t('auth.create'))}
          </button>
          <span class="auth-seats mono">${esc(t('auth.seats', { seats }))}</span>
        </div>

        ${mode === 'legacy' ? `
          <div class="auth-panel">
            <h2>${esc(t('auth.legacy.title'))}</h2>
            <p>${esc(t('auth.legacy.body', {
              skills: Object.keys(legacy.cleared).length, logs: legacy.logs.length,
            }))}</p>
            <form id="legacy-form" class="stack">
              <div class="field">
                <label for="lg-name">${esc(t('auth.name'))}</label>
                <input id="lg-name" name="name" type="text" value="${esc(legacy.name || '')}" maxlength="40" required>
              </div>
              <div class="field">
                <label for="lg-pass">${esc(t('auth.passphrase'))}</label>
                <input id="lg-pass" name="passphrase" type="password" minlength="8"
                       autocomplete="new-password" required>
                <small>${esc(t('auth.passphrase.hint'))}</small>
              </div>
              <div class="row-actions">
                <button class="btn btn-accent btn-sm" type="submit">${esc(t('auth.legacy.claim'))}</button>
                <button class="btn btn-ghost btn-sm" type="button" data-mode="create">${esc(t('auth.legacy.skip'))}</button>
              </div>
            </form>
          </div>` : ''}

        ${mode === 'list' ? `
          <div class="auth-panel">
            <h2>${esc(t('auth.pick'))}</h2>
            <div class="account-list">
              ${accounts.map((a) => `
                <button class="account ${a.id === pendingId ? 'is-open' : ''}" data-account="${esc(a.id)}">
                  <span class="account-avatar">${esc((a.name || '?').charAt(0).toUpperCase())}</span>
                  <span class="account-who">
                    <b>${esc(a.name)}</b>
                    <small>${esc(t('auth.since'))} ${esc(formatDate(a.createdAt))}</small>
                  </span>
                </button>
                ${a.id === pendingId ? `
                  <form class="auth-unlock stack" data-signin="${esc(a.id)}">
                    <div class="field">
                      <label for="pp-${esc(a.id)}">${esc(t('auth.passphrase'))}</label>
                      <input id="pp-${esc(a.id)}" name="passphrase" type="password"
                             autocomplete="current-password" required autofocus>
                    </div>
                    <div class="row-actions">
                      <button class="btn btn-primary btn-sm" type="submit">${esc(t('auth.unlock'))}</button>
                    </div>
                  </form>` : ''}
              `).join('')}
            </div>
          </div>` : ''}

        ${mode === 'create' ? `
          <div class="auth-panel">
            <h2>${esc(t('auth.create.title'))}</h2>
            ${full ? `<div class="notice">${esc(t('auth.err.full'))}</div>` : `
              <form id="create-form" class="stack">
                <div class="field">
                  <label for="cr-name">${esc(t('auth.name'))}</label>
                  <input id="cr-name" name="name" type="text" maxlength="40" required autocomplete="nickname">
                </div>
                <div class="field">
                  <label for="cr-pass">${esc(t('auth.passphrase'))}</label>
                  <input id="cr-pass" name="passphrase" type="password" minlength="8"
                         autocomplete="new-password" required>
                  <small>${esc(t('auth.passphrase.hint'))}</small>
                </div>
                <div class="row-actions">
                  <button class="btn btn-accent btn-sm" type="submit">${esc(t('auth.create.go'))}</button>
                </div>
              </form>`}
          </div>` : ''}

        <p class="auth-status status-line" id="auth-status"></p>
      </div>

      <p class="auth-note">${esc(t('auth.note'))}</p>
    </div>`;

  const status = mount.querySelector('#auth-status');
  const say = (text, ok = false) => {
    status.textContent = text;
    status.className = `auth-status status-line ${ok ? 'is-ok' : 'is-bad'}`;
  };

  mount.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => { mode = btn.dataset.mode; pendingId = null; rerender(); });
  });

  mount.querySelectorAll('[data-account]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingId = pendingId === btn.dataset.account ? null : btn.dataset.account;
      rerender();
    });
  });

  mount.querySelector('[data-signin]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    say(t('auth.unlocking'), true);
    try {
      await store.signIn(e.target.dataset.signin, new FormData(e.target).get('passphrase'));
      mode = null; pendingId = null;
      ctx.onSignedIn();
    } catch (err) { say(message(err)); }
  });

  mount.querySelector('#create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    say(t('auth.creating'), true);
    try {
      await store.createAccount(form.get('name'), form.get('passphrase'));
      mode = null;
      ctx.onSignedIn();
    } catch (err) { say(message(err)); }
  });

  mount.querySelector('#legacy-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    say(t('auth.creating'), true);
    try {
      await store.claimLegacy(form.get('name'), form.get('passphrase'));
      mode = null;
      ctx.onSignedIn();
    } catch (err) { say(message(err)); }
  });
}

export function resetSignInView() { mode = null; pendingId = null; }
