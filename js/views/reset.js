import { t } from '../i18n.js';
import { esc } from '../dom.js';

/**
 * The password-reset landing page. Reached from the emailed link
 * (#/reset?token=…); the token is read from the hash query, not the path, so it
 * survives GitHub Pages' static hosting.
 */
export default function renderReset(ctx) {
  const { store, mount, rerender } = ctx;
  const raw = location.hash.replace(/^#/, '');
  const token = new URLSearchParams(raw.split('?')[1] || '').get('token') || '';

  if (!store.accountsAvailable) {
    mount.innerHTML = `<div class="auth"><div class="auth-card" style="padding:24px"><p>${esc(t('auth.noBackend'))}</p></div></div>`;
    return;
  }

  mount.innerHTML = `
    <div class="auth">
      <div class="auth-brand"><div class="wordmark">KRIDA<span class="dot">.</span></div></div>
      <div class="auth-card">
        <div class="auth-panel">
          <h2>${esc(t('reset.title'))}</h2>
          ${!token ? `<p class="notice" style="margin-top:12px">${esc(t('reset.noToken'))}</p>` : `
            <form id="reset-form" class="stack" style="margin-top:14px">
              <div class="field">
                <label for="rs-pass">${esc(t('reset.new'))}</label>
                <input id="rs-pass" name="password" type="password" minlength="8"
                       autocomplete="new-password" required>
                <small>${esc(t('auth.password.hint'))}</small>
              </div>
              <div class="row-actions">
                <button class="btn btn-accent btn-sm" type="submit">${esc(t('reset.go'))}</button>
                <a class="btn btn-ghost btn-sm" href="#/settings">${esc(t('auth.back'))}</a>
              </div>
            </form>`}
          <p class="status-line" id="reset-status"></p>
        </div>
      </div>
    </div>`;

  const status = mount.querySelector('#reset-status');
  const say = (text, ok = false) => {
    status.textContent = text;
    status.className = `status-line ${ok ? 'is-ok' : 'is-bad'}`;
  };

  mount.querySelector('#reset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    say(t('auth.working'), true);
    try {
      await store.confirmReset(token, new FormData(e.target).get('password'));
      say(t('reset.done'), true);
      setTimeout(() => { location.hash = '#/dashboard'; rerender(); }, 900);
    } catch (err) {
      const code = err.code || err.message;
      say(t(code === 'BAD_TOKEN' ? 'reset.badToken' : code === 'WEAK_PASSWORD' ? 'auth.err.weak' : 'auth.err.generic'));
    }
  });
}
