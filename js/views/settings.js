import { t } from '../i18n.js';
import { esc, formatDate } from '../dom.js';
import { renderAccountPanel } from './signin.js';

export default function renderSettings(ctx) {
  const { store, profile, mount, rerender } = ctx;
  const account = store.signedIn;

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
        ${account ? `
          <h2>${esc(t('set.account'))}</h2>
          <p>${esc(t('set.account.signedInAs', { name: store.session.username }))}${store.isAdmin ? ` · ${esc(t('set.account.admin'))}` : ''}</p>
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
              <button class="btn btn-ghost btn-sm" type="button" data-signout>${esc(t('auth.signOut'))}</button>
            </div>
          </form>
          <p class="status-line" id="account-status"></p>` : ''}
      </section>

      ${account && store.isAdmin ? `
        <section class="panel" id="admin-panel" style="grid-column:1/-1">
          <h2>${esc(t('set.admin'))}</h2>
          <p>${esc(t('set.admin.body'))}</p>
          <div class="admin-list" id="admin-list"><p class="muted" style="font-size:13px">${esc(t('set.admin.loading'))}</p></div>
          <p class="status-line" id="admin-status"></p>
        </section>` : ''}

      <section class="panel">
        <h2>${esc(t('set.data'))}</h2>
        <p>${esc(account ? t('set.data.bodyAccount') : t('set.data.body'))}</p>
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

  const say = (node, message, ok = true) => {
    node.textContent = message;
    node.className = `status-line ${ok ? 'is-ok' : 'is-bad'}`;
  };
  const dataStatus = mount.querySelector('#data-status');

  // --- profile ---
  mount.querySelector('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    store.setName(form.get('name'));
    store.setVisibility(form.get('visibility'));
    rerender();
  });

  // --- account: guest sees the sign-in panel; a member sees management ---
  if (!account) {
    renderAccountPanel(ctx, mount.querySelector('#account-panel'));
  } else {
    const accountStatus = mount.querySelector('#account-status');
    mount.querySelector('[data-signout]').addEventListener('click', async () => {
      await store.signOut();
      rerender();
    });
    mount.querySelector('#pass-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      say(accountStatus, t('auth.working'));
      try {
        await store.changePassword(form.get('old'), form.get('new'));
        say(accountStatus, t('set.account.changed'));
        e.target.reset();
      } catch (err) {
        const code = err.code || err.message;
        say(accountStatus, t(code === 'BAD_CREDENTIALS' ? 'auth.err.credentials'
          : code === 'WEAK_PASSWORD' ? 'auth.err.weak' : 'auth.err.generic'), false);
      }
    });
  }

  // --- admin panel ---
  if (account && store.isAdmin) {
    const list = mount.querySelector('#admin-list');
    const adminStatus = mount.querySelector('#admin-status');
    const loadUsers = async () => {
      try {
        const { users, seatLimit } = await store.adminUsers();
        list.innerHTML = `
          <div class="admin-seats mono">${users.length} / ${seatLimit} ${esc(t('set.admin.seats'))}</div>
          ${users.map((u) => `
            <div class="admin-row">
              <span class="account-avatar" style="width:30px;height:30px;font-size:12px">${esc(u.username.charAt(0).toUpperCase())}</span>
              <span class="admin-who"><b>${esc(u.username)}</b>${u.isAdmin ? ` <em class="admin-badge">${esc(t('set.account.admin'))}</em>` : ''}<small>${esc(u.email)} · ${esc(formatDate(u.createdAt))}</small></span>
              <span class="admin-actions">
                <button class="btn btn-ghost btn-sm" data-areset="${esc(u.username)}">${esc(t('set.admin.reset'))}</button>
                <button class="btn btn-ghost btn-sm" data-aset="${esc(u.username)}">${esc(t('set.admin.setpw'))}</button>
                ${u.username === store.session.username ? '' : `<button class="btn btn-ghost btn-sm" data-adel="${esc(u.username)}" style="color:#f87171;border-color:rgba(248,113,113,.4)">${esc(t('set.admin.delete'))}</button>`}
              </span>
            </div>`).join('')}`;
        wireAdminRows();
      } catch (err) {
        list.innerHTML = `<p class="muted" style="font-size:13px">${esc(t('set.admin.failed'))}</p>`;
      }
    };
    const wireAdminRows = () => {
      list.querySelectorAll('[data-areset]').forEach((b) => b.addEventListener('click', async () => {
        say(adminStatus, t('auth.working'));
        try {
          const r = await store.adminReset(b.dataset.areset);
          say(adminStatus, r.sent ? t('set.admin.reset.sent', { user: b.dataset.areset })
            : t('set.admin.reset.link', { link: r.link }));
        } catch (err) { say(adminStatus, t('set.admin.reset.failed'), false); }
      }));
      list.querySelectorAll('[data-aset]').forEach((b) => b.addEventListener('click', async () => {
        const pw = prompt(t('set.admin.setpw.prompt', { user: b.dataset.aset }));
        if (!pw) return;
        try {
          await store.adminSetPassword(b.dataset.aset, pw);
          say(adminStatus, t('set.admin.setpw.done', { user: b.dataset.aset }));
        } catch (err) {
          const code = err.code || err.message;
          say(adminStatus, t(code === 'WEAK_PASSWORD' ? 'auth.err.weak' : 'auth.err.generic'), false);
        }
      }));
      list.querySelectorAll('[data-adel]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm(t('set.admin.delete.confirm', { user: b.dataset.adel }))) return;
        try { await store.adminDeleteUser(b.dataset.adel); loadUsers(); }
        catch (err) { say(adminStatus, t('auth.err.generic'), false); }
      }));
    };
    loadUsers();
  }

  // --- data ---
  mount.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(profile, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `krida-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    say(dataStatus, t('set.exported'));
  });

  const file = mount.querySelector('#import-file');
  mount.querySelector('[data-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      store.replace(JSON.parse(await chosen.text()));
      say(dataStatus, t('set.imported'));
      rerender();
    } catch (err) {
      say(dataStatus, t('set.importFailed'), false);
    }
  });

  mount.querySelector('[data-reset]').addEventListener('click', () => {
    if (!confirm(t('set.reset.confirm'))) return;
    store.reset();
    rerender();
  });
}
