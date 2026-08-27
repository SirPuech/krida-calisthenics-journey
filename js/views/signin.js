import { t, plural } from '../i18n.js';
import { esc, formatDate } from '../dom.js';
import { cryptoAvailable } from '../crypto.js';

/**
 * The signed-out half of the account UI.
 *
 * Not a page any more — the site is browsable as a guest, so this renders
 * inside Settings, where choosing an account now lives.
 */
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

let mode = null;
let pendingId = null;

export function resetSignInView() { mode = null; pendingId = null; }

export function renderAccountPanel(ctx, host) {
  const { store, rerender, onSignedIn } = ctx;
  const accounts = store.listAccounts();
  const full = store.isFull();
  // A guest with progress is offered the carry-over; so is a leftover phase-1
  // profile when the guest slate is clean.
  const carryable = store.guestHasProgress() ? store.profile : ctx.legacyProfile;

  if (!mode) mode = accounts.length ? 'list' : 'create';
  if (mode === 'list' && !accounts.length) mode = 'create';
  if (mode === 'create' && full && accounts.length) mode = 'list';

  host.innerHTML = `
    <h2>${esc(t('set.account'))}</h2>
    <p>${esc(t('auth.guestBody'))}</p>

    ${!cryptoAvailable() ? `<div class="notice" style="margin-top:14px">${esc(t('auth.err.crypto'))}</div>` : ''}

    <div class="auth-tabs" style="margin-top:16px;border-radius:var(--r-sm)">
      <button data-mode="list" class="${mode === 'list' ? 'is-on' : ''}" ${accounts.length ? '' : 'disabled'}>
        ${esc(t('auth.signIn'))}
      </button>
      <button data-mode="create" class="${mode === 'create' ? 'is-on' : ''}" ${full ? 'disabled' : ''}>
        ${esc(t('auth.create'))}
      </button>
      <span class="auth-seats mono">${esc(t('auth.seats', { seats: `${accounts.length} / ${store.maxAccounts}` }))}</span>
    </div>

    ${mode === 'list' ? `
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
                       autocomplete="current-password" required>
              </div>
              <div class="row-actions">
                <button class="btn btn-primary btn-sm" type="submit">${esc(t('auth.unlock'))}</button>
              </div>
            </form>` : ''}
        `).join('')}
      </div>` : ''}

    ${mode === 'create' ? (full ? `<div class="notice" style="margin-top:14px">${esc(t('auth.err.full', { max: store.maxAccounts }))}</div>` : `
      <form id="create-form" class="stack" style="margin-top:16px">
        ${carryable ? `
          <label class="carry">
            <input type="checkbox" name="carry" checked>
            <span>${esc(t('auth.carry', {
              skills: plural(Object.keys(carryable.cleared).length, 'skill'),
              logs: plural(carryable.logs.length, 'set'),
            }))}</span>
          </label>` : ''}
        <div class="field">
          <label for="cr-name">${esc(t('auth.name'))}</label>
          <input id="cr-name" name="name" type="text" maxlength="40" required autocomplete="nickname"
                 value="${esc(carryable && carryable.name !== 'Guest' ? carryable.name : '')}">
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
      </form>`) : ''}

    <p class="status-line" id="auth-status"></p>`;

  const status = host.querySelector('#auth-status');
  const say = (text, ok = false) => {
    status.textContent = text;
    status.className = `status-line ${ok ? 'is-ok' : 'is-bad'}`;
  };

  host.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => { mode = btn.dataset.mode; pendingId = null; rerender(); });
  });

  host.querySelectorAll('[data-account]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingId = pendingId === btn.dataset.account ? null : btn.dataset.account;
      rerender();
    });
  });

  host.querySelector('[data-signin]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    say(t('auth.unlocking'), true);
    try {
      await store.signIn(e.target.dataset.signin, new FormData(e.target).get('passphrase'));
      resetSignInView();
      onSignedIn();
    } catch (err) { say(message(err)); }
  });

  host.querySelector('#create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    say(t('auth.creating'), true);
    try {
      if (form.get('carry') && carryable) {
        await store.claimLegacy(form.get('name'), form.get('passphrase'));
      } else {
        await store.createAccount(form.get('name'), form.get('passphrase'));
      }
      resetSignInView();
      onSignedIn();
    } catch (err) { say(message(err)); }
  });
}
