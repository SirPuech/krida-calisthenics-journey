import { t } from '../i18n.js';
import { esc, pct } from '../dom.js';
import { statusMap, STATUS, summarise, standardProgress } from '../progress.js';
import { layoutTree, edgePath, ancestorsOf } from '../treegraph.js';

// Kept across re-renders so filtering does not reset the viewport.
let branchFilter = 'push';
let zoom = 1;
let hovered = null;

const ZOOM_STEPS = [0.55, 0.7, 0.85, 1, 1.2];

const STATUS_CLASS = {
  [STATUS.CLEARED]: 'n-cleared',
  [STATUS.ACTIVE]: 'n-active',
  [STATUS.AVAILABLE]: 'n-available',
  [STATUS.LOCKED]: 'n-locked',
};

export default function renderTree({ catalogue, profile, mount, rerender }) {
  const statuses = statusMap(catalogue, profile);
  const s = summarise(catalogue, profile);

  const skills = branchFilter === 'all'
    ? catalogue.skills
    : catalogue.skills.filter((k) => k.branch === branchFilter);

  const graph = layoutTree(skills, catalogue);
  const lit = hovered ? ancestorsOf(hovered, catalogue) : null;
  if (lit) lit.add(hovered);

  // Tier progress for the level rail.
  const tierStats = catalogue.tiers.map((tier) => {
    const inTier = skills.filter((k) => k.tier === tier.tier);
    const done = inTier.filter((k) => profile.cleared[k.id]).length;
    return { ...tier, done, total: inTier.length, ratio: inTier.length ? done / inTier.length : 0 };
  });

  const branchDone = skills.filter((k) => profile.cleared[k.id]).length;
  const branchPct = skills.length ? branchDone / skills.length : 0;

  mount.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(t('tree.eyebrow'))}</div>
        <h1>${esc(t('tree.title'))}</h1>
      </div>
      <div class="xp-rail">
        <div class="xp-ring" style="--p:${Math.round(branchPct * 100)}">
          <span>${Math.round(branchPct * 100)}<i>%</i></span>
        </div>
        <div class="xp-facts">
          <b>${s.xp.toLocaleString()} XP</b>
          <span>${esc(t('tree.clearedOf', { done: branchDone, total: skills.length }))}</span>
          ${s.streak ? `<span class="xp-streak">🔥 ${s.streak}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="tree-bar">
      <div class="filters">
        <button data-branch="all" class="${branchFilter === 'all' ? 'is-on' : ''}">${esc(t('tree.all'))}</button>
        ${catalogue.branches.map((b) => `
          <button data-branch="${esc(b.id)}" class="${branchFilter === b.id ? 'is-on' : ''}">${esc(b.label)}</button>
        `).join('')}
      </div>
      <div class="zoomer">
        <button data-zoom="out" aria-label="Zoom out">−</button>
        <span class="mono">${Math.round(zoom * 100)}%</span>
        <button data-zoom="in" aria-label="Zoom in">+</button>
      </div>
    </div>

    <div class="tier-rail">
      ${tierStats.map((tier) => `
        <div class="tier-chip ${tier.ratio === 1 && tier.total ? 'is-done' : ''} t${tier.tier}">
          <span class="mono">TIER 0${tier.tier}</span>
          <b>${esc(tier.name)}</b>
          <div class="bar"><i style="width:${pct(tier.ratio)}"></i></div>
          <span class="mono">${tier.done}/${tier.total}</span>
        </div>`).join('')}
    </div>

    <div class="tree-stage" id="stage">
      <svg class="tree-svg" width="${graph.width * zoom}" height="${graph.height * zoom}"
           viewBox="0 0 ${graph.width} ${graph.height}" role="img"
           aria-label="${esc(t('tree.title'))}">
        <defs>
          <linearGradient id="edgeHot" x1="0" x2="1">
            <stop offset="0%" stop-color="#F97316"/><stop offset="100%" stop-color="#2563EB"/>
          </linearGradient>
        </defs>
        <g class="edges">
          ${graph.edges.map((edge) => {
            const fromCleared = Boolean(profile.cleared[edge.fromId]);
            const toStatus = statuses.get(edge.toId);
            const cls = fromCleared && toStatus === STATUS.CLEARED ? 'e-done'
              : fromCleared ? 'e-open' : 'e-locked';
            const dim = lit && !(lit.has(edge.fromId) && lit.has(edge.toId)) ? ' is-dim' : '';
            return `<path class="edge ${cls}${dim}" d="${edgePath(edge)}"
                          data-from="${esc(edge.fromId)}" data-to="${esc(edge.toId)}"/>`;
          }).join('')}
        </g>
        <g class="nodes">
          ${[...graph.nodes.values()].map(({ skill, x, y, w, h }) => {
            const status = statuses.get(skill.id);
            const dim = lit && !lit.has(skill.id) ? ' is-dim' : '';
            const progress = status === STATUS.ACTIVE ? standardProgress(skill, profile) : 0;
            const mark = status === STATUS.CLEARED ? '✓'
              : status === STATUS.LOCKED ? '🔒' : '';
            return `
              <a class="node-g ${STATUS_CLASS[status]}${dim}" href="#/skill/${esc(skill.id)}"
                 data-node="${esc(skill.id)}" tabindex="0">
                <rect class="node-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>
                ${progress ? `<rect class="node-fill" x="${x}" y="${y}" width="${w * progress}" height="${h}" rx="9"/>` : ''}
                <text class="node-label" x="${x + 13}" y="${y + h / 2 + 4}">${esc(clip(skill.name))}</text>
                ${mark ? `<text class="node-mark" x="${x + w - 12}" y="${y + h / 2 + 4}">${mark}</text>` : ''}
              </a>`;
          }).join('')}
        </g>
      </svg>
    </div>

    <div class="legend">
      <span><i class="sw sw-cleared"></i>${esc(t('legend.cleared'))}</span>
      <span><i class="sw sw-active"></i>${esc(t('legend.active'))}</span>
      <span><i class="sw sw-available"></i>${esc(t('legend.available'))}</span>
      <span><i class="sw sw-locked"></i>${esc(t('legend.locked'))}</span>
      <span class="muted">${esc(t('tree.hint'))}</span>
    </div>`;

  mount.querySelectorAll('[data-branch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      branchFilter = btn.dataset.branch;
      hovered = null;
      rerender();
    });
  });

  mount.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = ZOOM_STEPS.indexOf(zoom);
      const next = btn.dataset.zoom === 'in' ? i + 1 : i - 1;
      zoom = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, next))];
      rerender();
    });
  });

  // Hovering a node lights the whole chain of prerequisites behind it. Done by
  // toggling a class rather than re-rendering, so it stays smooth.
  const svg = mount.querySelector('.tree-svg');
  svg.addEventListener('mouseover', (e) => {
    const node = e.target.closest('[data-node]');
    if (!node || node.dataset.node === hovered) return;
    hovered = node.dataset.node;
    paint(svg, catalogue, hovered);
  });
  svg.addEventListener('mouseleave', () => { hovered = null; paint(svg, catalogue, null); });
}

/**
 * Dim everything that is not on the prerequisite chain behind `skillId`.
 * Class toggles only — no re-render, so hovering stays smooth.
 */
function paint(svg, catalogue, skillId) {
  const lit = skillId ? ancestorsOf(skillId, catalogue) : null;
  if (lit) lit.add(skillId);
  const off = (id) => Boolean(lit) && !lit.has(id);

  svg.querySelectorAll('[data-node]').forEach((el) => {
    el.classList.toggle('is-dim', off(el.dataset.node));
  });
  svg.querySelectorAll('.edge').forEach((el) => {
    // An edge stays lit only when both of its endpoints are on the chain.
    el.classList.toggle('is-dim', off(el.dataset.from) || off(el.dataset.to));
  });
}

function clip(name, max = 21) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
