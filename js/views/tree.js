import { t } from '../i18n.js';
import { esc } from '../dom.js';
import { statusMap, STATUS } from '../progress.js';

const PER_CELL = 4;
const expanded = new Set();   // `${branch}:${tier}` cells the user opened

const CLASSES = {
  [STATUS.CLEARED]: 'is-cleared',
  [STATUS.ACTIVE]: 'is-active',
  [STATUS.AVAILABLE]: 'is-available',
  [STATUS.LOCKED]: 'is-locked',
};

let branchFilter = 'all';

export function nodeButton(skill, status) {
  const legend = status === STATUS.LOCKED && skill.tier === 4;
  const tag = status === STATUS.CLEARED ? 'DONE'
    : status === STATUS.ACTIVE ? 'NOW'
    : status === STATUS.AVAILABLE ? 'OPEN'
    : legend ? 'LEGEND' : 'LOCK';
  return `<a class="node ${legend ? 'is-legend' : CLASSES[status]}" href="#/skill/${esc(skill.id)}">
    <span>${esc(skill.name)}</span><small>${tag}</small>
  </a>`;
}

export default function renderTree({ catalogue, profile, mount, rerender }) {
  const statuses = statusMap(catalogue, profile);
  const branches = catalogue.branches.filter((b) => branchFilter === 'all' || b.id === branchFilter);

  const cells = branches.map((branch) => {
    const row = catalogue.tiers.map((tier) => {
      const skills = catalogue.skills
        .filter((k) => k.branch === branch.id && k.tier === tier.tier)
        .sort((a, b) => a.depth - b.depth);
      const key = `${branch.id}:${tier.tier}`;
      const open = expanded.has(key);
      const shown = open ? skills : skills.slice(0, PER_CELL);
      const hidden = skills.length - shown.length;
      return `<div class="tree-cell" data-tier="TIER 0${tier.tier} · ${esc(tier.name.toUpperCase())}">
        ${shown.map((k) => nodeButton(k, statuses.get(k.id))).join('')
          || `<span class="muted" style="font-size:12px">${esc(t('tree.empty'))}</span>`}
        ${hidden > 0 ? `<button class="tree-more" data-more="${esc(key)}">${esc(t('tree.more', { n: hidden }))}</button>` : ''}
        ${open && skills.length > PER_CELL ? `<button class="tree-more" data-more="${esc(key)}">${esc(t('tree.less'))}</button>` : ''}
      </div>`;
    }).join('');
    return `<div class="branch-cell">${esc(branch.label)}</div>${row}`;
  }).join('');

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(t('tree.eyebrow'))}</div>
        <h1>${esc(t('tree.title'))}</h1>
      </div>
      <div class="filters">
        <button data-branch="all" class="${branchFilter === 'all' ? 'is-on' : ''}">${esc(t('tree.all'))}</button>
        ${catalogue.branches.map((b) => `
          <button data-branch="${esc(b.id)}" class="${branchFilter === b.id ? 'is-on' : ''}">${esc(b.label)}</button>
        `).join('')}
      </div>
    </div>

    <div class="tree-grid">
      <div class="th-cell"></div>
      ${catalogue.tiers.map((tier) => `
        <div class="th-cell ${tier.tier === 1 ? 't1' : tier.tier === 4 ? 't4' : ''}">${esc(tier.name.toUpperCase())}</div>
      `).join('')}
      ${cells}
    </div>

    <div class="legend">
      <span><i style="background:var(--orange)"></i>${esc(t('legend.cleared'))}</span>
      <span><i style="background:var(--blue)"></i>${esc(t('legend.active'))}</span>
      <span><i style="border:1px solid rgba(255,255,255,.3)"></i>${esc(t('legend.available'))}</span>
      <span><i style="border:1px dashed rgba(255,255,255,.3)"></i>${esc(t('legend.locked'))}</span>
    </div>`;

  mount.querySelectorAll('[data-branch]').forEach((btn) => {
    btn.addEventListener('click', () => { branchFilter = btn.dataset.branch; rerender(); });
  });
  mount.querySelectorAll('[data-more]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.more;
      expanded.has(key) ? expanded.delete(key) : expanded.add(key);
      rerender();
    });
  });
}
