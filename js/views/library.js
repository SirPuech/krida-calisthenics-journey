import { t } from '../i18n.js';
import { esc } from '../dom.js';
import { statusMap, STATUS } from '../progress.js';

const state = { q: '', tier: null, branch: null, status: null };

const STATUS_LABEL = {
  [STATUS.CLEARED]: 'legend.cleared',
  [STATUS.ACTIVE]: 'legend.active',
  [STATUS.AVAILABLE]: 'legend.available',
  [STATUS.LOCKED]: 'legend.locked',
};

export default function renderLibrary({ catalogue, profile, mount, rerender }) {
  const statuses = statusMap(catalogue, profile);
  const q = state.q.trim().toLowerCase();

  const rows = catalogue.skills.filter((k) => {
    if (state.tier && k.tier !== state.tier) return false;
    if (state.branch && k.branch !== state.branch) return false;
    if (state.status && statuses.get(k.id) !== state.status) return false;
    if (q && !`${k.name} ${k.sheetName} ${k.branchLabel}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const facet = (label, items, key) => `
    <div class="facet">
      <h4>${esc(label)}</h4>
      <div class="facet-list">
        <button data-facet="${key}" data-value="">${esc(t('lib.any'))}<span>${catalogue.skills.length}</span></button>
        ${items.map((i) => `
          <button data-facet="${key}" data-value="${esc(i.value)}" class="${String(state[key]) === String(i.value) ? 'is-on' : ''}">
            ${esc(i.label)}<span>${i.count}</span>
          </button>`).join('')}
      </div>
    </div>`;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(t('lib.eyebrow', { count: catalogue.skills.length }))}</div>
        <h1>${esc(t('lib.title'))}</h1>
      </div>
      <input class="search" id="lib-search" type="search" value="${esc(state.q)}"
             placeholder="${esc(t('lib.search'))}" aria-label="${esc(t('lib.search'))}">
    </div>

    <div class="lib-layout">
      <aside class="facets">
        ${facet(t('lib.tier'), catalogue.tiers.map((x) => ({
          value: x.tier, label: x.name,
          count: catalogue.skills.filter((k) => k.tier === x.tier).length,
        })), 'tier')}
        ${facet(t('lib.branch'), catalogue.branches.map((b) => ({
          value: b.id, label: b.label, count: catalogue.branchCounts[b.id] || 0,
        })), 'branch')}
        ${facet(t('lib.status'), Object.values(STATUS).map((s) => ({
          value: s, label: t(STATUS_LABEL[s]).split(' — ')[0],
          count: catalogue.skills.filter((k) => statuses.get(k.id) === s).length,
        })), 'status')}
      </aside>

      <div class="table-scroll">
        <div class="table">
          <div class="trow thead">
            <span>${esc(t('lib.col.skill'))}</span><span>${esc(t('lib.col.branch'))}</span>
            <span>${esc(t('lib.col.tier'))}</span><span>${esc(t('lib.col.prereq'))}</span>
            <span>${esc(t('lib.col.video'))}</span>
          </div>
          ${rows.length ? rows.map((k) => {
            const status = statuses.get(k.id);
            const locked = status === STATUS.LOCKED;
            const colour = status === STATUS.CLEARED ? 'color:var(--orange)'
              : status === STATUS.ACTIVE ? 'color:var(--blue-lift)' : '';
            const prereq = k.prereqs.map((p) => catalogue.byId.get(p)?.name).filter(Boolean).join(' · ') || '—';
            return `<a class="trow ${locked ? 'is-locked' : ''}" href="#/skill/${esc(k.id)}">
              <span>${esc(k.name)}</span>
              <span class="dim">${esc(k.branchLabel)}</span>
              <span class="tag" style="${colour}">T${k.tier}</span>
              <span class="dim">${esc(prereq)}</span>
              <span class="tag" style="${colour}">${k.videos.length
                ? esc(t('lib.links', { n: k.videos.length })) : esc(t('lib.noLinks'))}</span>
            </a>`;
          }).join('') : `<div class="empty" style="border:0">${esc(t('lib.empty'))}</div>`}
        </div>
      </div>
    </div>`;

  const search = mount.querySelector('#lib-search');
  search.addEventListener('input', () => {
    state.q = search.value;
    rerender();
    const next = mount.querySelector('#lib-search');
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });

  mount.querySelectorAll('[data-facet]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { facet: key, value } = btn.dataset;
      const parsed = key === 'tier' ? (value ? Number(value) : null) : (value || null);
      state[key] = String(state[key]) === String(parsed) ? null : parsed;
      rerender();
    });
  });
}
