import { t, getLang } from '../i18n.js';
import { esc, pct, formatStandard } from '../dom.js';
import { DAYS, today } from '../store/schema.js';
import { STATUS, streak, currentTier } from '../progress.js';
import {
  resolveLevel, templatesFor, activeTemplate, focusForDay, buildSession, formatPrescription, coachText,
} from '../coach.js';

const LABELS = {
  en: { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN' },
  th: { mon: 'จ.', tue: 'อ.', wed: 'พ.', thu: 'พฤ.', fri: 'ศ.', sat: 'ส.', sun: 'อา.' },
};

/** Which day card is open. Defaults to today, resets on a full reload only. */
let selectedDay = null;

const todayKey = () => DAYS[(new Date().getDay() + 6) % 7];

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return today(d);
}

export default function renderProgram(ctx) {
  const { catalogue, programs, store, profile, mount, rerender } = ctx;
  const lang = getLang();
  const label = (record, field = 'label') => coachText(record, field, lang);
  const now = todayKey();
  if (!selectedDay) selectedDay = now;

  const { tier, auto } = resolveLevel(catalogue, profile);
  const template = activeTemplate(programs, catalogue, profile);
  const options = templatesFor(programs, tier);

  const monday = weekStart();
  const loggedDays = new Set(profile.logs
    .filter((l) => l.date >= monday)
    .map((l) => DAYS[(new Date(`${l.date}T00:00:00`).getDay() + 6) % 7]));

  const focusOf = (day) => focusForDay(programs, template, profile, day);
  const session = buildSession(catalogue, programs, profile, focusOf(selectedDay), tier);
  // Mobility days are not counted: sessionsPerWeek means hard sessions, and
  // the week counter has to agree with the number on the split label.
  const isTraining = (day) => {
    const f = programs.focus[focusOf(day)];
    return f && f.branches.length && !f.light;
  };
  const trainingDays = DAYS.filter(isTraining).length;
  const derived = currentTier(catalogue, profile);

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(t('program.eyebrow'))}</div>
        <h1>${esc(t('program.title'))}</h1>
      </div>
      <div class="stat-row">
        <div class="stat is-accent"><b>${streak(profile)}</b><span>${esc(t('program.streak'))}</span></div>
        <div class="stat"><b>${[...loggedDays].filter(isTraining).length}/${trainingDays}</b><span>${esc(t('program.sessions'))}</span></div>
      </div>
    </div>

    <div class="coach-bar">
      <div class="field">
        <label for="prog-level">${esc(t('program.level'))}</label>
        <select id="prog-level">
          <option value="auto" ${auto ? 'selected' : ''}>
            ${esc(t('program.level.auto', { tier: derived, name: catalogue.tierOf(derived)?.name || '' }))}
          </option>
          ${catalogue.tiers.map((x) => `
            <option value="${x.tier}" ${!auto && tier === x.tier ? 'selected' : ''}>
              ${esc(t('program.level.tier', { tier: x.tier, name: x.name }))}
            </option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="prog-template">${esc(t('program.split'))}</label>
        <select id="prog-template">
          ${options.map((x) => `
            <option value="${esc(x.id)}" ${x.id === template.id ? 'selected' : ''}>
              ${esc(label(x, 'name'))} · ${x.sessionsPerWeek}${esc(t('program.perWeek'))} · ${esc(t('program.level.tier', { tier: x.tier, name: catalogue.tierOf(x.tier)?.name || '' }))}
            </option>`).join('')}
        </select>
      </div>
      <p class="coach-summary">${esc(label(template, 'summary'))}</p>
    </div>

    <div class="week">
      ${DAYS.map((day) => {
        const focusId = focusOf(day);
        const focus = programs.focus[focusId];
        const rest = focusId === 'rest';
        const overridden = Boolean(profile.program?.days?.[day]);
        const klass = [
          loggedDays.has(day) ? 'is-done' : '',
          day === now ? 'is-today' : '',
          rest ? 'is-rest' : '',
          day === selectedDay ? 'is-open' : '',
        ].filter(Boolean).join(' ');
        return `<button type="button" class="day day-pick ${klass}" data-day="${esc(day)}"
                        aria-pressed="${day === selectedDay}">
          <h3>${esc(LABELS[getLang()][day])}${day === now ? ` · ${esc(t('program.today'))}` : ''}</h3>
          <span class="focus">${esc(label(focus))}</span>
          ${overridden ? `<span class="day-flag">${esc(t('program.custom'))}</span>` : ''}
          <span class="tail ${loggedDays.has(day) ? 'is-done' : ''}">${loggedDays.has(day) ? esc(t('program.done')) : ''}</span>
        </button>`;
      }).join('')}
    </div>

    <section class="session">
      <div class="session-head">
        <div>
          <div class="section-label">${esc(LABELS.en[selectedDay])} · ${esc(t('program.session'))}</div>
          <h2>${esc(label(programs.focus[focusOf(selectedDay)]))}</h2>
        </div>
        <div class="field">
          <label for="day-focus">${esc(t('program.focus'))}</label>
          <select id="day-focus">
            ${Object.entries(programs.focus).map(([id, f]) => `
              <option value="${esc(id)}" ${id === focusOf(selectedDay) ? 'selected' : ''}>${esc(label(f))}</option>
            `).join('')}
          </select>
        </div>
      </div>

      ${session ? session.blocks.map((block) => `
        <div class="block ${block.items.length ? '' : 'is-empty'}">
          <div class="block-head">
            <h3>${esc(label(block))}</h3>
            <span class="mono">${esc(formatPrescription(block.prescription))} · ${esc(t('program.rest'))} ${esc(block.prescription?.rest || '—')}</span>
          </div>
          <p class="block-note">${esc(label(block, 'note'))}</p>
          ${block.items.length ? '' : `<p class="block-empty">${esc(t('program.blockEmpty'))}</p>`}
          <div class="block-items">
            ${block.items.map((item) => `
              <a class="block-item" href="#/skill/${esc(item.skill.id)}">
                <span class="bi-name">${esc(item.skill.name)}</span>
                <span class="bi-dose mono">${esc(formatPrescription(block.prescription))}</span>
                <span class="bi-meta mono">T${item.skill.tier} · ${esc(t('program.target'))} ${esc(formatStandard(item.standard))}</span>
                <span class="bi-bar"><span class="bar"><i style="width:${pct(item.progress)}"></i></span></span>
                ${item.status === STATUS.ACTIVE ? `<span class="bi-tag">${esc(t('legend.active'))}</span>` : ''}
              </a>`).join('')}
          </div>
        </div>`).join('')
        : `<div class="empty">${esc(t('program.restDay'))}</div>`}

      ${session && !session.total ? `<div class="empty">${esc(t('program.nothing'))}</div>` : ''}

      <p class="coach-disclaimer">${esc(t('program.disclaimer'))}</p>
    </section>`;

  mount.querySelector('#prog-level').addEventListener('change', (e) => {
    store.setProgramLevel(e.target.value);
    rerender();
  });
  mount.querySelector('#prog-template').addEventListener('change', (e) => {
    store.setProgramTemplate(e.target.value);
    rerender();
  });
  mount.querySelector('#day-focus').addEventListener('change', (e) => {
    // Writing the template's own value back would pin it; only store a change.
    const templateFocus = template?.week?.[selectedDay] || 'rest';
    store.setProgramDay(selectedDay, e.target.value === templateFocus ? null : e.target.value);
    rerender();
  });
  mount.querySelectorAll('[data-day]').forEach((btn) => {
    btn.addEventListener('click', () => { selectedDay = btn.dataset.day; rerender(); });
  });
}
