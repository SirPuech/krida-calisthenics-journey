import { t, plural } from '../i18n.js';
import { esc } from '../dom.js';

/**
 * The signed-out account panel, shown inside Settings. Username + password sign
 * in, account creation (optionally carrying the guest's progress), and a
 * forgot-password request. Accounts only appear when a backend is configured.
 */
const ERRORS = {
  BAD_CREDENTIALS: 'auth.err.credentials',
  WEAK_PASSWORD: 'auth.err.weak',
  BAD_USERNAME: 'auth.err.username',
  BAD_EMAIL: 'auth.err.email',
  USERNAME_TAKEN: 'auth.err.userTaken',
  EMAIL_TAKEN: 'auth.err.emailTaken',
  SEATS_FULL: 'auth.err.full',
  NETWORK: 'auth.err.network',
  BAD_TOKEN: 'auth.err.token',
};
const msg = (err) => t(ERRORS[err.code || err.message] || 'auth.err.generic');

let mode = null;   // 'login' | 'create' | 'forgot'

export function resetSignInView() { mode = null; }

export function renderAccountPanel(ctx, host) {
  const { store, onSignedIn } = ctx;

  if (!store.accountsAvailable) {
    host.innerHTML = `
      <h2>${esc(t('set.account'))}</h2>
      <p>${esc(t('auth.noBackend'))}</p>
      <p class="muted" style="font-size:12px;margin-top:10px">${esc(t('auth.noBackend.how'))}</p>`;
    return;
  }

  if (!mode) mode = 'login';
  const carry = store.guestHasProgress() ? store.profile : null;

  host.innerHTML = `
    <h2>${esc(t('set.account'))}</h2>
    <p>${esc(t('auth.guestBody'))}</p>

    <div class="auth-tabs" style="margin-top:16px;border-radius:var(--r-sm)">
      <button data-mode="login" class="${mode === 'login' ? 'is-on' : ''}">${esc(t('auth.signIn'))}</button>
      <button data-mode="create" class="${mode === 'create' ? 'is-on' : ''}">${esc(t('auth.create'))}</button>
    </div>

    ${mode === 'login' ? `
      <form id="login-form" class="stack" style="margin-top:16px">
        <div class="field">
          <label for="li-user">${esc(t('auth.username'))}</label>
          <input id="li-user" name="username" type="text" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="li-pass">${esc(t('auth.password'))}</label>
          <input id="li-pass" name="password" type="password" autocomplete="current-password" required>
        </div>
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" type="submit">${esc(t('auth.signIn'))}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-mode="forgot">${esc(t('auth.forgot'))}</button>
        </div>
      </form>` : ''}

    ${mode === 'create' ? `
      <form id="create-form" class="stack" style="margin-top:16px">
        ${carry ? `
          <label class="carry">
            <input type="checkbox" name="carry" checked>
            <span>${esc(t('auth.carry', {
              skills: plural(Object.keys(carry.cleared).length, 'skill'),
              logs: plural(carry.logs.length, 'set'),
            }))}</span>
          </label>` : ''}
        <div class="field">
          <label for="cr-user">${esc(t('auth.username'))}</label>
          <input id="cr-user" name="username" type="text" autocomplete="username"
                 minlength="3" maxlength="32" required>
          <small>${esc(t('auth.username.hint'))}</small>
        </div>
        <div class="field">
          <label for="cr-email">${esc(t('auth.email'))}</label>
          <input id="cr-email" name="email" type="email" autocomplete="email" required>
          <small>${esc(t('auth.email.hint'))}</small>
        </div>
        <div class="field">
          <label for="cr-pass">${esc(t('auth.password'))}</label>
          <input id="cr-pass" name="password" type="password" autocomplete="new-password"
                 minlength="8" required>
          <small>${esc(t('auth.password.hint'))}</small>
        </div>
        <div class="row-actions">
          <button class="btn btn-accent btn-sm" type="submit">${esc(t('auth.create.go'))}</button>
        </div>
      </form>` : ''}

    ${mode === 'forgot' ? `
      <form id="forgot-form" class="stack" style="margin-top:16px">
        <p style="font-size:13px;color:var(--ink-2)">${esc(t('auth.forgot.body'))}</p>
        <div class="field">
          <label for="fg-id">${esc(t('auth.forgot.id'))}</label>
          <input id="fg-id" name="identifier" type="text" autocomplete="email" required>
        </div>
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" type="submit">${esc(t('auth.forgot.send'))}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-mode="login">${esc(t('auth.back'))}</button>
        </div>
      </form>` : ''}

    <p class="status-line" id="auth-status"></p>`;

  const status = host.querySelector('#auth-status');
  const say = (text, ok = false) => {
    status.textContent = text;
    status.className = `status-line ${ok ? 'is-ok' : 'is-bad'}`;
  };

  host.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => { mode = btn.dataset.mode; ctx.rerender(); });
  });

  host.querySelector('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    say(t('auth.working'), true);
    try {
      await store.login(f.get('username'), f.get('password'));
      resetSignInView();
      onSignedIn();
    } catch (err) { say(msg(err)); }
  });

  host.querySelector('#create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    say(t('auth.working'), true);
    try {
      await store.signup(f.get('username'), f.get('email'), f.get('password'), Boolean(f.get('carry')));
      resetSignInView();
      onSignedIn();
    } catch (err) { say(msg(err)); }
  });

  host.querySelector('#forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    say(t('auth.working'), true);
    try {
      await store.requestReset(f.get('identifier'));
      // Always the same reply, so this cannot be used to probe who has an account.
      say(t('auth.forgot.sent'), true);
    } catch (err) { say(msg(err)); }
  });
}
