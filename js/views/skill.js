import { t, getLang } from '../i18n.js';
import { esc, pct, formatStandard, formatDate } from '../dom.js';
import {
  STATUS, statusOf, standardFor, bestLog, standardProgress, meetsStandard,
} from '../progress.js';
import { mountAnimator } from '../exercise/animator.js';

export default function renderSkill(ctx) {
  const { catalogue, guide, store, profile, params, mount, rerender, onLeave } = ctx;
  const skill = catalogue.byId.get(params[0]);
  if (!skill) {
    mount.innerHTML = `<div class="empty">${esc(t('skill.notFound'))} <a href="#/tree">${esc(t('skill.back'))}</a></div>`;
    return;
  }

  const status = statusOf(skill, catalogue, profile);
  const std = standardFor(skill, profile);
  const best = bestLog(skill.id, profile);
  const progress = standardProgress(skill, profile);
  const ready = meetsStandard(skill, profile);
  const logs = profile.logs.filter((l) => l.skillId === skill.id).slice(0, 12);
  const prereqs = skill.prereqs.map((id) => catalogue.byId.get(id)).filter(Boolean);
  const opens = catalogue.unlockedBy(skill.id);
  const how = guide?.skills?.[skill.id];
  const archLabel = how ? (guide.archetypes[how.archetype]?.label || how.archetype) : '';
  const unit = std.type === 'hold' ? t('skill.log.secs') : t('skill.log.reps');
  const isCleared = status === STATUS.CLEARED;
  const custom = Boolean(profile.standards?.[skill.id]);

  mount.innerHTML = `
    <nav class="crumbs">
      <a href="#/tree">${esc(t('skill.back'))}</a><span class="sep">/</span>
      <a href="#/library">${esc(skill.branchLabel)}</a><span class="sep">/</span>
      <span style="color:var(--white)">${esc(skill.name)}</span>
    </nav>

    <div class="skill-layout">
      <div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <span class="chip chip-tier">TIER 0${skill.tier} · ${esc(skill.tierName.toUpperCase())}</span>
          <span class="chip chip-branch">${esc(skill.branchLabel.toUpperCase())} BRANCH</span>
          ${isCleared ? `<span class="chip" style="background:var(--orange);color:var(--onyx)">${esc(t('skill.cleared').toUpperCase())}</span>` : ''}
        </div>
        <h1>${esc(skill.name)}</h1>
        ${skill.sheetName !== skill.name ? `<p class="muted mono" style="font-size:12px;margin-top:8px">${esc(skill.sheetName)}</p>` : ''}

        <figure class="demo">
          <div class="demo-stage" id="demo-stage" aria-label="${esc(t('skill.demo'))}: ${esc(skill.name)}"></div>
          <figcaption class="demo-bar">
            <button type="button" class="demo-play" id="demo-play" aria-pressed="true">
              <span class="demo-ico">❚❚</span><span id="demo-play-label">${esc(t('skill.pause'))}</span>
            </button>
            <span class="demo-tag mono">${esc(t('skill.demo'))} · ${esc(archLabel)}</span>
          </figcaption>
        </figure>

        <div class="metrics">
          <div class="metric"><span>${esc(t('skill.standard'))}</span><b>${esc(formatStandard(std))}</b></div>
          <div class="metric"><span>${esc(t('skill.best'))}</span><b>${best ? esc(formatStandard(best)) : esc(t('skill.none'))}</b></div>
          <div class="metric is-accent"><span>${esc(t('skill.xp'))}</span><b>+${skill.xp}</b></div>
        </div>
        ${!custom ? `<p class="muted" style="font-size:12px;margin-top:10px">${esc(t('skill.defaultNote'))}</p>` : ''}

        <details class="panel" style="margin-top:16px;padding:16px 20px">
          <summary style="cursor:pointer;font:600 13px var(--sans)">${esc(t('skill.editStandard'))}</summary>
          <form class="log-form" id="std-form">
            <div class="field"><label for="std-sets">${esc(t('skill.log.sets'))}</label>
              <input id="std-sets" name="sets" type="number" min="1" max="20" value="${std.sets}" required></div>
            <div class="field"><label for="std-amount">${esc(unit)}</label>
              <input id="std-amount" name="amount" type="number" min="1" max="600" value="${std.amount}" required></div>
            <button class="btn btn-ghost btn-sm" type="submit">${esc(t('skill.saveStandard'))}</button>
            ${custom ? `<button class="btn btn-ghost btn-sm" type="button" data-reset-std>${esc(t('skill.resetStandard'))}</button>` : ''}
          </form>
        </details>

        ${skill.variations.length ? `
          <div class="panel" style="margin-top:16px">
            <h4 class="section-label">${esc(t('skill.variations'))}</h4>
            <div class="pill-row">${skill.variations.map((v) => `<span class="pill">${esc(v)}</span>`).join('')}</div>
          </div>` : ''}
      </div>

      <div class="side-stack">
        ${how ? `
          <div class="panel howto">
            <h4 class="section-label">${esc(t('skill.howto'))}</h4>
            <p class="howto-setup">${esc(how.setup)}</p>
            <ol class="howto-steps">
              ${how.steps.map((step) => `<li>${esc(step)}</li>`).join('')}
            </ol>
            <div class="howto-note is-cue">
              <span>${esc(t('skill.cue'))}</span>${esc(how.cue)}
            </div>
            <div class="howto-note is-mistake">
              <span>${esc(t('skill.mistake'))}</span>${esc(how.mistake)}
            </div>
          </div>` : ''}

        <div class="gate ${status === STATUS.LOCKED ? 'is-locked' : ''}">
          <h4>${esc(prereqs.length === 0 ? t('skill.gate.entry')
            : status === STATUS.LOCKED ? t('skill.gate.locked') : t('skill.gate.open'))}</h4>
          ${prereqs.length === 0
            ? `<p style="font-size:14px;color:var(--ink-2);margin-top:8px">${esc(t('skill.gate.entryBody'))}</p>`
            : `<p style="font-size:12px;color:var(--ink-3);margin-top:8px">${esc(t('skill.gate.needs'))}</p>
               <div class="pill-row">${prereqs.map((p) => `
                 <a class="pill" href="#/skill/${esc(p.id)}" style="${profile.cleared[p.id]
                   ? 'background:rgba(249,115,22,.16);border-color:rgba(249,115,22,.5);color:var(--orange)' : ''}">
                   ${esc(p.name)} ${profile.cleared[p.id] ? '✓' : ''}
                 </a>`).join('')}</div>`}
        </div>

        <div class="panel">
          <h4 class="section-label">${esc(t('skill.log'))}</h4>
          <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
            <div class="bar" style="flex:1"><i style="width:${pct(progress)}"></i></div>
            <span class="mono" style="font-size:11px;color:var(--ink-3)">${pct(progress)}</span>
          </div>
          <form class="log-form" id="log-form">
            <div class="field"><label for="log-sets">${esc(t('skill.log.sets'))}</label>
              <input id="log-sets" name="sets" type="number" min="1" max="20" value="${std.sets}" required></div>
            <div class="field"><label for="log-amount">${esc(unit)}</label>
              <input id="log-amount" name="amount" type="number" min="1" max="600" value="${best?.amount || std.amount}" required></div>
            <button class="btn btn-primary btn-sm" type="submit">${esc(t('skill.log.add'))}</button>
          </form>
          ${logs.length ? `
            <h4 class="section-label" style="margin-top:18px">${esc(t('skill.log.recent'))}</h4>
            <div class="log-list">${logs.map((l) => `
              <div class="log-item">
                <span>${esc(formatStandard(l))}</span>
                <time datetime="${esc(l.date)}">${esc(formatDate(l.date, getLang()))}</time>
                <button type="button" data-del="${esc(l.id)}" aria-label="Delete this set">×</button>
              </div>`).join('')}</div>` : ''}
          <button class="btn ${isCleared ? 'btn-ghost' : 'btn-accent'}" style="width:100%;margin-top:16px"
                  data-clear ${!isCleared && !ready ? 'disabled' : ''}>
            ${esc(isCleared ? t('skill.unclear') : t('skill.markCleared'))}
          </button>
        </div>

        <div class="panel">
          <h4 class="section-label">${esc(t('skill.unlocks'))}</h4>
          ${opens.length
            ? `<div class="pill-row">${opens.map((o) => `<a class="pill" href="#/skill/${esc(o.id)}">${esc(o.name)}</a>`).join('')}</div>`
            : `<p class="muted" style="font-size:13px;margin-top:10px">${esc(t('skill.unlocks.none'))}</p>`}
        </div>
      </div>
    </div>`;

  // --- the 3D demo -------------------------------------------------------
  if (how) {
    const stage = mount.querySelector('#demo-stage');
    let animator = null;
    let disposed = false;
    mountAnimator(stage, how.archetype).then((a) => {
      if (disposed) { a.dispose(); return; }   // navigated away mid-load
      animator = a;
    }).catch((err) => {
      console.warn('[krida] demo failed to start', err);
      stage.classList.add('is-fallback');
      stage.innerHTML = `<span>${esc(t('skill.demoFallback'))}</span>`;
    });
    // Dispose when the view is replaced (navigation or re-render).
    onLeave(() => { disposed = true; if (animator) animator.dispose(); });

    const playBtn = mount.querySelector('#demo-play');
    playBtn.addEventListener('click', () => {
      if (!animator) return;
      const running = animator.toggle();
      playBtn.setAttribute('aria-pressed', String(running));
      playBtn.querySelector('.demo-ico').textContent = running ? '❚❚' : '▶';
      mount.querySelector('#demo-play-label').textContent = running ? t('skill.pause') : t('skill.play');
    });
  }

  // --- forms -------------------------------------------------------------
  mount.querySelector('#log-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    store.logSet(skill.id, { sets: form.get('sets'), amount: form.get('amount'), type: std.type });
    rerender();
  });

  mount.querySelector('#std-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    store.setStandard(skill.id, {
      sets: Number(form.get('sets')), amount: Number(form.get('amount')),
      type: std.type, source: 'user',
    });
    rerender();
  });

  mount.querySelector('[data-reset-std]')?.addEventListener('click', () => {
    store.setStandard(skill.id, null);
    rerender();
  });

  mount.querySelector('[data-clear]').addEventListener('click', () => {
    store.setCleared(skill.id, !isCleared);
    rerender();
  });

  mount.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => { store.removeLog(btn.dataset.del); rerender(); });
  });
}
