import { t, getLang } from '../i18n.js';
import { esc, formatStandard } from '../dom.js';
import { DAYS, today } from '../store/schema.js';
import { statusMap, STATUS, standardFor, streak } from '../progress.js';

const LABELS = {
  en: { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN' },
  th: { mon: 'จ.', tue: 'อ.', wed: 'พ.', thu: 'พฤ.', fri: 'ศ.', sat: 'ส.', sun: 'อา.' },
};

/** Monday-based index for the current day. */
function todayKey() {
  return DAYS[(new Date().getDay() + 6) % 7];
}

/** The Monday of the current week, as YYYY-MM-DD. */
function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return today(d);
}

export default function renderProgram({ catalogue, store, profile, mount, rerender }) {
  const statuses = statusMap(catalogue, profile);
  const now = todayKey();
  const monday = weekStart();
  const trainedDays = new Set(profile.logs.filter((l) => l.date >= monday).map((l) => l.date));

  // Which weekday each logged date falls on, so a day card can show "done".
  const doneDays = new Set([...trainedDays].map((date) => {
    const d = new Date(`${date}T00:00:00`);
    return DAYS[(d.getDay() + 6) % 7];
  }));

  const suggestFor = (branch) => catalogue.skills
    .filter((k) => k.branch === branch)
    .filter((k) => statuses.get(k.id) === STATUS.ACTIVE || statuses.get(k.id) === STATUS.AVAILABLE)
    .sort((a, b) => {
      const rank = (k) => (statuses.get(k.id) === STATUS.ACTIVE ? 0 : 1);
      return rank(a) - rank(b) || a.depth - b.depth;
    })
    .slice(0, 3);

  const options = [
    ...catalogue.branches.map((b) => ({ id: b.id, label: b.label })),
    { id: 'rest', label: t('program.rest') },
  ];

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(t('program.eyebrow'))}</div>
        <h1>${esc(t('program.title'))}</h1>
      </div>
      <div class="stat-row">
        <div class="stat is-accent"><b>${streak(profile)}</b><span>${esc(t('program.streak'))}</span></div>
        <div class="stat"><b>${doneDays.size}/7</b><span>${esc(t('program.sessions'))}</span></div>
      </div>
    </div>

    <p class="muted" style="font-size:13px;margin-bottom:18px">${esc(t('program.help'))}</p>

    <div class="week">
      ${DAYS.map((day) => {
        const branch = profile.program[day] || 'rest';
        const rest = branch === 'rest';
        const done = doneDays.has(day);
        const isToday = day === now;
        const picks = rest ? [] : suggestFor(branch);
        const klass = [done ? 'is-done' : '', isToday ? 'is-today' : '', rest ? 'is-rest' : ''].filter(Boolean).join(' ');
        return `<div class="day ${klass}">
          <h3>${esc(LABELS[getLang()][day])}${isToday ? ` · ${esc(t('program.today'))}` : ''}</h3>
          <select class="field" data-day="${esc(day)}" aria-label="${esc(LABELS.en[day])} focus"
                  style="padding:6px 8px;border-radius:6px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);color:var(--ink);font:700 14px var(--sans)">
            ${options.map((o) => `<option value="${esc(o.id)}" ${o.id === branch ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
          ${rest ? '' : `<ul>${picks.length
            ? picks.map((k) => `<li><a href="#/skill/${esc(k.id)}">${esc(k.name)}</a> ${esc(formatStandard(standardFor(k, profile)))}</li>`).join('')
            : `<li class="muted">${esc(t('program.nothing'))}</li>`}</ul>`}
          <span class="tail ${done ? 'is-done' : ''}">${done ? esc(t('program.done')) : ''}</span>
        </div>`;
      }).join('')}
    </div>`;

  mount.querySelectorAll('[data-day]').forEach((select) => {
    select.addEventListener('change', () => {
      store.setProgramDay(select.dataset.day, select.value);
      rerender();
    });
  });
}
