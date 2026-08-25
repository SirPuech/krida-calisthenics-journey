import { t, getLang } from '../i18n.js';
import { esc, pct, formatStandard, formatDate } from '../dom.js';
import { summarise, standardProgress, standardFor, STATUS } from '../progress.js';

export default function renderDashboard({ catalogue, profile, mount }) {
  const s = summarise(catalogue, profile);
  const initial = (profile.name || '?').trim().charAt(0).toUpperCase();
  const top = s.next[0];
  const recent = profile.logs.slice(0, 8);

  mount.innerHTML = `
    <div class="profile-head">
      <div class="avatar">${esc(initial)}</div>
      <div class="who">
        <b>${esc(profile.name)}</b>
        <span>Tier ${s.tier} · ${esc(catalogue.tierOf(s.tier)?.name || '')} · ${esc(t('dash.joined'))} ${esc(formatDate(profile.createdAt, getLang()))}</span>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${s.xp.toLocaleString()}</b><span>${esc(t('dash.xp'))}</span></div>
        <div class="stat is-accent"><b>${s.streak}</b><span>${esc(t('dash.streak'))}</span></div>
        <div class="stat"><b>${s.counts.cleared}</b><span>${esc(t('dash.skills'))}</span></div>
      </div>
    </div>

    <div class="dash-grid">
      <div class="panel">
        <h2 class="section-label">${esc(t('dash.branch'))}</h2>
        <div class="branch-list">
          ${s.branches.map((b) => `
            <div>
              <div class="head"><span>${esc(b.label)}</span><span>${b.done} / ${b.total}</span></div>
              <div class="bar ${b.done ? '' : 'is-blue'}"><i style="width:${pct(b.ratio)}"></i></div>
            </div>`).join('')}
        </div>

        <h2 class="section-label" style="margin-top:28px">${esc(t('dash.recent'))}</h2>
        ${recent.length ? `<div class="log-list" style="max-height:none">${recent.map((l) => {
          const skill = catalogue.byId.get(l.skillId);
          return `<div class="log-item">
            <a href="#/skill/${esc(l.skillId)}">${esc(skill?.name || l.skillId)}</a>
            <span class="mono" style="font-size:12px">${esc(formatStandard(l))}</span>
            <time datetime="${esc(l.date)}">${esc(formatDate(l.date, getLang()))}</time>
          </div>`;
        }).join('')}</div>`
          : `<p class="muted" style="font-size:13px;margin-top:12px">${esc(t('dash.recent.none'))}</p>`}
      </div>

      <div class="side-stack">
        <div class="panel">
          <h2 class="section-label">${esc(t('dash.badges'))}</h2>
          <div class="badges">
            ${s.badges.map((b) => `
              <div class="badge ${b.earned ? 'is-earned' : ''}" title="${esc(b.label.replace('\\n', ' '))}">
                ${b.earned ? esc(b.label).replace('\n', '<br>') : '?'}
              </div>`).join('')}
          </div>
        </div>

        <div class="next-unlock">
          <h4>${esc(t('dash.next'))}</h4>
          ${top ? `
            <b><a href="#/skill/${esc(top.skill.id)}" style="color:inherit">${esc(top.skill.name)}</a></b>
            <p style="font-size:13px;color:var(--ink-2);margin-top:5px">
              ${esc(top.skill.branchLabel)} · ${esc(t('skill.standard'))} ${esc(formatStandard(standardFor(top.skill, profile)))}
            </p>
            <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
              <div class="bar" style="flex:1;height:6px"><i style="width:${pct(top.progress)}"></i></div>
              <span class="mono" style="font-size:11px;color:var(--ink-3)">${pct(top.progress)}</span>
            </div>`
            : `<p style="font-size:13px;color:var(--ink-2);margin-top:8px">${esc(t('dash.next.none'))}</p>`}
        </div>
      </div>
    </div>`;
}
