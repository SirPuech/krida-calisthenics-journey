/**
 * Layout for the skill-tree diagram.
 *
 * Tier becomes the column, so the graph reads left to right exactly like the
 * unlock order. Within a column, nodes are ordered by the mean row of their
 * prerequisites (the barycentre heuristic) which pulls connected nodes level
 * with each other and takes most of the crossings out.
 *
 * Pure geometry — no DOM, no state.
 */
export const NODE_W = 168;
export const NODE_H = 42;
export const GAP_X = 88;
export const GAP_Y = 14;
export const PAD = 28;
const BAND_GAP = 26;     // extra space between two branches in one column
const PASSES = 4;

export function layoutTree(skills, catalogue) {
  const included = new Set(skills.map((s) => s.id));
  const tiers = [1, 2, 3, 4];

  // Column membership, seeded in a stable order so layout is deterministic.
  const columns = tiers.map((tier) => skills
    .filter((s) => s.tier === tier)
    .sort((a, b) => a.branch.localeCompare(b.branch) || a.depth - b.depth
      || a.name.localeCompare(b.name)));

  const rowOf = new Map();
  columns.forEach((col) => col.forEach((s, i) => rowOf.set(s.id, i)));

  // Barycentre sweeps: forward pulls a node level with its prerequisites,
  // backward pulls it level with what it unlocks.
  for (let pass = 0; pass < PASSES; pass += 1) {
    const forward = pass % 2 === 0;
    const order = forward ? [1, 2, 3] : [2, 1, 0];
    for (const ci of order) {
      const col = columns[ci];
      const weight = new Map();
      for (const skill of col) {
        const neighbours = forward
          ? skill.prereqs.filter((id) => included.has(id))
          : catalogue.unlockedBy(skill.id).filter((s) => included.has(s.id)).map((s) => s.id);
        const rows = neighbours.map((id) => rowOf.get(id)).filter((r) => r !== undefined);
        weight.set(skill.id, rows.length
          ? rows.reduce((a, b) => a + b, 0) / rows.length
          : rowOf.get(skill.id));
      }
      col.sort((a, b) => weight.get(a.id) - weight.get(b.id)
        || a.branch.localeCompare(b.branch));
      col.forEach((s, i) => rowOf.set(s.id, i));
    }
  }

  // Place. A branch change inside a column opens a small gap so the bands read.
  const nodes = new Map();
  let maxBottom = 0;
  columns.forEach((col, ci) => {
    let y = PAD;
    let previousBranch = null;
    col.forEach((skill) => {
      if (previousBranch && skill.branch !== previousBranch) y += BAND_GAP;
      previousBranch = skill.branch;
      nodes.set(skill.id, {
        skill,
        x: PAD + ci * (NODE_W + GAP_X),
        y,
        w: NODE_W,
        h: NODE_H,
      });
      y += NODE_H + GAP_Y;
    });
    maxBottom = Math.max(maxBottom, y);
  });

  const edges = [];
  for (const skill of skills) {
    for (const prereqId of skill.prereqs) {
      const from = nodes.get(prereqId);
      const to = nodes.get(skill.id);
      if (!from || !to) continue;         // prerequisite filtered out of view
      edges.push({ from, to, fromId: prereqId, toId: skill.id });
    }
  }

  return {
    nodes,
    edges,
    width: PAD * 2 + 4 * NODE_W + 3 * GAP_X,
    height: maxBottom + PAD,
    columns,
  };
}

/** Cubic bezier from the right edge of one node to the left edge of the next. */
export function edgePath({ from, to }) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const bend = Math.max(30, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

/** Every skill this one depends on, transitively — used to light up a path. */
export function ancestorsOf(skillId, catalogue, limit = 400) {
  const seen = new Set();
  const stack = [skillId];
  while (stack.length && seen.size < limit) {
    const id = stack.pop();
    for (const prereq of catalogue.byId.get(id)?.prereqs || []) {
      if (!seen.has(prereq)) { seen.add(prereq); stack.push(prereq); }
    }
  }
  return seen;
}
