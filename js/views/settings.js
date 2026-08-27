import { t } from '../i18n.js';
import { esc } from '../dom.js';
import { gistAdapter } from '../store/index.js';
import { renderAccountPanel } from './signin.js';
import { formatDate } from '../dom.js';

export default function renderSettings(ctx) {
  const { store, profile, mount, rerender } = ctx;
  const guest = !store.signedIn;
  const remote = store.remoteConfig() || {};
  const connected = Boolean(remote.token);
  const roster = store.listAccounts();

  mount.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">KRIDA</div><h1>${esc(t('set.title'))}</h1></div></div>

    <div class="settings-grid">
      <section class="panel">
        <h2>${esc(t('set.profile'))}</h2>
        <form class="stack" id="profile-form">
          <div class="field">
            <label for="p-name">${esc(t('set.name'))}</label>
            <input id="p-name" name="name" type="text" value="${esc(profile.name)}" maxlength="40" required>
          </div>
          <div class="field">
            <label for="p-vis">${esc(t('set.visibility'))}</label>
            <select id="p-vis" name="visibility">
              <option value="private" ${profile.visibility === 'private' ? 'selected' : ''}>${esc(t('set.visibility.private'))}</option>
              <option value="public" ${profile.visibility === 'public' ? 'selected' : ''}>${esc(t('set.visibility.public'))}</option>
            </select>
          </div>
          <div class="row-actions"><button class="btn btn-primary btn-sm" type="submit">${esc(t('set.save'))}</button></div>
        </form>
      </section>

      <section class="panel" id="account-panel">
        ${guest ? '' : `
        <h2>${esc(t('set.account'))}</h2>
        <p>${esc(t('set.account.signedInAs', { name: profile.name }))}</p>
        <form class="stack" id="pass-form">
          <div class="field">
            <label for="pw-old">${esc(t('set.account.old'))}</label>
            <input id="pw-old" name="old" type="password" autocomplete="current-password" required>
          </div>
          <div class="field">
            <label for="pw-new">${esc(t('set.account.new'))}</label>
            <input id="pw-new" name="new" type="password" minlength="8" autocomplete="new-password" required>
          </div>
          <div class="row-actions">
            <button class="btn btn-primary btn-sm" type="submit">${esc(t('set.account.change'))}</button>
            <button class="btn btn-ghost btn-sm" type="button" data-switch>${esc(t('set.account.switch'))}</button>
            <button class="btn btn-ghost btn-sm" type="button" data-del-account
                    style="border-color:rgba(248,113,113,.5);color:#f87171">${esc(t('set.account.delete'))}</button>
          </div>
        </form>
        <p class="status-line" id="account-status"></p>`}
      </section>

      <section class="panel" ${roster.length ? '' : 'hidden'}>
        <h2>${esc(t('set.roster'))}</h2>
        <p>${esc(t('set.roster.body'))}</p>
        <div class="roster-list">
          ${roster.map((a) => `
            <div class="roster-row ${a.id === profile.id ? 'is-me' : ''}">
              <span class="account-avatar" style="width:28px;height:28px;font-size:12px">${esc((a.name || '?').charAt(0).toUpperCase())}</span>
              <span>${esc(a.name)}</span>
              <span class="mono">${esc(formatDate(a.createdAt))}${a.hasPublic ? ' · public' : ''}</span>
            </div>`).join('')}
        </div>
        <p class="status-line is-ok">${esc(t('set.roster.seats', { used: roster.length, max: store.maxAccounts }))}</p>
      </section>

      <section class="panel">
        <h2>${esc(t('set.sync'))}</h2>
        <p>${esc(t('set.sync.body'))}</p>
        <form class="stack" id="sync-form">
          <div class="field">
            <label for="s-token">${esc(t('set.sync.token'))}</label>
            <input id="s-token" name="token" type="password" autocomplete="off" spellcheck="false"
                   placeholder="${connected ? '•'.repeat(20) : 'github_pat_…'}">
          </div>
          <div class="field">
            <label for="s-gist">${esc(t('set.sync.gist'))}</label>
            <input id="s-gist" name="gistId" type="text" autocomplete="off" spellcheck="false"
                   value="${esc(remote.gistId || '')}" placeholder="0123456789abcdef…">
          </div>
          <div class="row-actions">
            <button class="btn btn-primary btn-sm" type="submit">${esc(t('set.sync.connect'))}</button>
            <button class="btn btn-ghost btn-sm" type="button" data-push ${connected ? '' : 'disabled'}>${esc(t('set.sync.push'))}</button>
            <button class="btn btn-ghost btn-sm" type="button" data-pull ${connected ? '' : 'disabled'}>${esc(t('set.sync.pull'))}</button>
            ${connected ? `<button class="btn btn-ghost btn-sm" type="button" data-forget>${esc(t('set.sync.forget'))}</button>` : ''}
          </div>
        </form>
        <p class="status-line" id="sync-status"></p>
      </section>

      <section class="panel">
        <h2>${esc(t('set.data'))}</h2>
        <p>${esc(t('set.data.body'))}</p>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-export>${esc(t('set.export'))}</button>
          <button class="btn btn-ghost btn-sm" data-import>${esc(t('set.import'))}</button>
          <button class="btn btn-ghost btn-sm" data-reset style="border-color:rgba(248,113,113,.5);color:#f87171">${esc(t('set.reset'))}</button>
        </div>
        <input type="file" id="import-file" accept="application/json" hidden>
        <p class="status-line" id="data-status"></p>
      </section>

      <section class="panel">
        <h2>${esc(t('set.roadmap'))}</h2>
        <ul class="roadmap">
          <li><b>${esc(t('set.roadmap.p1'))}</b>${esc(t('set.roadmap.p1b'))}</li>
          <li class="is-now"><b>${esc(t('set.roadmap.p2'))}</b>${esc(t('set.roadmap.p2b'))}</li>
          <li><b>${esc(t('set.roadmap.p3'))}</b>${esc(t('set.roadmap.p3b'))}</li>
        </ul>
      </section>
    </div>`;

  const accountStatus = mount.querySelector('#account-status');
  const syncStatus = mount.querySelector('#sync-status');
  const dataStatus = mount.querySelector('#data-status');
  const say = (node, message, ok = true) => {
    node.textContent = message;
    node.className = `status-line ${ok ? 'is-ok' : 'is-bad'}`;
  };

  if (guest) {
    renderAccountPanel(ctx, mount.querySelector('#account-panel'));
    wireRest();
    return;
  }

  mount.querySelector('[data-switch]').addEventListener('click', async () => {
    await store.signOut();
    rerender();
  });

  mount.querySelector('#pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    say(accountStatus, '…');
    try {
      await store.changePassphrase(form.get('old'), form.get('new'));
      say(accountStatus, t('set.account.changed'));
      e.target.reset();
    } catch (err) {
      say(accountStatus, err.message === 'WRONG_PASSPHRASE'
        ? t('auth.err.passphrase')
        : err.message === 'PASSPHRASE_TOO_SHORT' ? t('auth.err.short') : err.message, false);
    }
  });

  mount.querySelector('[data-del-account]').addEventListener('click', async () => {
    const passphrase = prompt(t('set.account.deleteConfirm'));
    if (!passphrase) return;
    try {
      await store.deleteAccount(passphrase);
      location.hash = '#/';
      location.reload();
    } catch (err) {
      say(accountStatus, err.message === 'WRONG_PASSPHRASE' ? t('auth.err.passphrase') : err.message, false);
    }
  });

  wireRest();

  function wireRest() {
  mount.querySelector('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    store.setName(form.get('name'));
    store.setVisibility(form.get('visibility'));
    rerender();
  });

  mount.querySelector('#sync-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const token = String(form.get('token') || '').trim() || remote.token;
    const gistId = String(form.get('gistId') || '').trim();
    if (!token) return say(syncStatus, 'Paste a token first.', false);
    say(syncStatus, 'Checking the token…');
    try {
      const login = await gistAdapter.whoami(token);
      store.writeRemoteConfig({ token, gistId: gistId || undefined });
      say(syncStatus, `Connected as ${login}.`);
      rerender();
    } catch (err) {
      say(syncStatus, err.message, false);
    }
  });

  mount.querySelector('[data-push]')?.addEventListener('click', async () => {
    say(syncStatus, 'Pushing…');
    try {
      await store.pushRemote();
      say(syncStatus, `Pushed to gist ${store.remoteConfig()?.gistId || ''}.`);
      rerender();
    } catch (err) { say(syncStatus, err.message, false); }
  });

  mount.querySelector('[data-pull]')?.addEventListener('click', async () => {
    say(syncStatus, 'Pulling…');
    try {
      await store.pullRemote();
      say(syncStatus, 'Pulled. Local progress replaced with the gist copy.');
      rerender();
    } catch (err) { say(syncStatus, err.message, false); }
  });

  mount.querySelector('[data-forget]')?.addEventListener('click', () => {
    store.writeRemoteConfig(null);
    rerender();
  });

  mount.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(profile, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `krida-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    say(dataStatus, 'Exported.');
  });

  const file = mount.querySelector('#import-file');
  mount.querySelector('[data-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      store.replace(JSON.parse(await chosen.text()));
      say(dataStatus, 'Imported.');
      rerender();
    } catch (err) {
      say(dataStatus, `That file did not parse: ${err.message}`, false);
    }
  });

  mount.querySelector('[data-reset]').addEventListener('click', () => {
    if (!confirm(t('set.reset.confirm'))) return;
    store.reset();
    rerender();
  });
  }
}
