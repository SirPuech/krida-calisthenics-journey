import { t } from '../i18n.js';
import { esc } from '../dom.js';
import { store } from '../store/index.js';

/**
 * The public leaderboard. Anyone — guest or account — can read it; only
 * athletes who turned on public visibility in Settings appear on it. The rows
 * come from the Worker's /api/leaderboard, already ranked by XP.
 */
export default function renderLeaderboard(ctx) {
  const { mount } = ctx;
  const me = store.signedIn ? store.session.username : null;
  const iAmPublic = store.profile.visibility === 'public';

  // A banner that nudges the viewer toward appearing on the board.
  let banner = '';
  if (!store.accountsAvailable) {
    banner = `<div class="lead-note">${esc(t('lead.unavailable'))}</div>`;
  } else if (!store.signedIn) {
    banner = `<div class="lead-note">${esc(t('lead.guest'))}
      <a href="#/settings">${esc(t('lead.guest.cta'))}</a></div>`;
  } else if (!iAmPublic) {
    banner = `<div class="lead-note">${esc(t('lead.hidden'))}
      <a href="#/settings">${esc(t('lead.hidden.cta'))}</a></div>`;
  }

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(t('lead.title'))}</h1>
        <p class="page-sub">${esc(t('lead.subtitle'))}</p>
      </div>
    </div>
    ${banner}
    <div class="lead-wrap" id="lead-wrap">
      <p class="muted" style="padding:24px 0">${esc(t('lead.loading'))}</p>
    </div>`;

  if (!store.accountsAvailable) return;

  const wrap = mount.querySelector('#lead-wrap');
  store.leaderboard().then(({ entries }) => {
    if (!wrap.isConnected) return;              // navigated away mid-load
    if (!entries.length) {
      wrap.innerHTML = `<p class="muted" style="padding:24px 0">${esc(t('lead.empty'))}</p>`;
      return;
    }
    wrap.innerHTML = `
      <table class="lead-table">
        <thead>
          <tr>
            <th class="num">${esc(t('lead.col.rank'))}</th>
            <th>${esc(t('lead.col.athlete'))}</th>
            <th class="num">${esc(t('lead.col.tier'))}</th>
            <th class="num">${esc(t('lead.col.cleared'))}</th>
            <th class="num">${esc(t('lead.col.xp'))}</th>
            <th class="num">${esc(t('lead.col.streak'))}</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((e) => {
            const mine = me && e.username.toLowerCase() === me.toLowerCase();
            const medal = e.rank <= 3 ? ` lead-rank-${e.rank}` : '';
            return `
            <tr class="${mine ? 'is-me' : ''}">
              <td class="num"><span class="lead-rank${medal}">${e.rank}</span></td>
              <td class="lead-name">${esc(e.name || e.username)}${mine ? `<span class="lead-you">${esc(t('lead.you'))}</span>` : ''}</td>
              <td class="num">T${e.tier}</td>
              <td class="num">${e.cleared}</td>
              <td class="num lead-xp">${e.xp.toLocaleString()}</td>
              <td class="num">${e.streak ? `${e.streak}${esc(t('lead.day'))}` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }).catch((err) => {
    if (!wrap.isConnected) return;
    console.warn('[krida] leaderboard failed', err);
    wrap.innerHTML = `<p class="muted" style="padding:24px 0">${esc(t('lead.error'))}</p>`;
  });
}
