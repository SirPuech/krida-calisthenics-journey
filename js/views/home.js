import { t } from '../i18n.js';
import { esc, pct, formatStandard } from '../dom.js';
import { summarise, standardProgress, STATUS, standardFor } from '../progress.js';

export default function renderHome({ catalogue, profile, mount }) {
  const s = summarise(catalogue, profile);
  const cleared = catalogue.skills
    .filter((k) => profile.cleared[k.id])
    .sort((a, b) => new Date(profile.cleared[b.id].at) - new Date(profile.cleared[a.id].at))
    .slice(0, 2)
    .reverse();

  const path = [
    ...cleared.map((skill) => ({ skill, kind: 'done', note: t('skill.cleared').toUpperCase() })),
    ...s.next.map(({ skill, status, progress }) => ({
      skill,
      kind: status === STATUS.ACTIVE ? 'now' : 'next',
      note: status === STATUS.ACTIVE
        ? `${pct(progress)} · ${formatStandard(standardFor(skill, profile))}`
        : formatStandard(standardFor(skill, profile)),
    })),
  ].slice(0, 4);

  const overall = s.total ? s.counts.cleared / s.total : 0;

  mount.innerHTML = `
    <section class="hero">
      <div>
        <span class="hero-badge">${esc(t('home.badge', { count: catalogue.skills.length }))}</span>
        <h1>${esc(t('home.title.a'))}<br>${esc(t('home.title.b'))}<br><em>${esc(t('home.title.c'))}</em></h1>
        <p class="lede">${esc(t('home.lede'))}</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#/tree">${esc(t('home.cta.tree'))}</a>
          <a class="btn btn-ghost" href="#/program">${esc(t('home.cta.program'))}</a>
        </div>
        <div class="hero-stats">
          <div><b>4</b><span>${esc(t('home.stat.tiers'))}</span></div>
          <div><b>${catalogue.branches.length}</b><span>${esc(t('home.stat.branches'))}</span></div>
          <div><b>${catalogue.skills.length}</b><span>${esc(t('home.stat.skills'))}</span></div>
        </div>
      </div>

      <div class="unlock-card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
          <span class="section-label" style="color:var(--white)">${esc(t('home.path'))}</span>
          <span class="mono" style="font-size:11px;color:var(--ink-3)">${s.counts.cleared} / ${s.total}</span>
        </div>
        ${path.length ? path.map((step, i) => `
          <div class="unlock-row">
            <span class="n ${step.kind}">${String(i + 1).padStart(2, '0')}</span>
            <a href="#/skill/${esc(step.skill.id)}">${esc(step.skill.name)}</a>
            <span class="s">${esc(step.note)}</span>
          </div>
          ${i < path.length - 1 ? `<div class="unlock-link ${step.kind === 'done' ? 'is-hot' : ''}"></div>` : ''}
        `).join('') : `<p class="muted" style="padding:18px 0;font-size:14px">${esc(t('home.path.empty'))}</p>`}
        <div style="margin-top:20px;padding-top:18px;border-top:1px solid var(--line);display:flex;align-items:center;gap:12px">
          <div class="bar is-grad" style="flex:1;height:6px"><i style="width:${pct(overall)}"></i></div>
          <span class="mono" style="font-size:11px;color:var(--ink-3)">${pct(overall)} · TIER ${s.tier}</span>
        </div>
      </div>
    </section>

    <h2 class="section-label" style="margin-top:44px">${esc(t('home.tierIntro'))}</h2>
    <div class="tier-grid">
      ${catalogue.tiers.map((tier) => {
        const skills = catalogue.skills.filter((k) => k.tier === tier.tier);
        const sample = skills.slice(0, 4).map((k) => k.name).join(', ');
        const klass = tier.tier === 1 ? 't1' : tier.tier === 4 ? 't4' : '';
        const label = tier.tier === 1 ? 'style="color:var(--orange)"'
          : tier.tier === 4 ? 'style="color:var(--blue-lift)"' : 'style="color:var(--ink-3)"';
        return `<div class="tier-card ${klass}">
          <div class="mono" style="font:700 11px var(--mono);letter-spacing:.12em" ${label}>TIER 0${tier.tier} · ${skills.length}</div>
          <h3>${esc(tier.name)}</h3>
          <p>${esc(sample)}</p>
        </div>`;
      }).join('')}
    </div>`;
}
