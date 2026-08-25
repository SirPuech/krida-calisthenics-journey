/** Loads the static skill catalogue and builds the lookups the views need. */

let cache = null;

export async function loadCatalogue() {
  if (cache) return cache;
  // Relative so the site works from a project page (/repo-name/) as well as root.
  const res = await fetch(new URL('../data/skills.json', import.meta.url));
  if (!res.ok) throw new Error(`Could not load the skill catalogue (${res.status}).`);
  const raw = await res.json();

  const byId = new Map(raw.skills.map((s) => [s.id, s]));
  const unlocks = new Map();           // skillId -> skills it opens up
  for (const skill of raw.skills) {
    for (const prereq of skill.prereqs) {
      if (!unlocks.has(prereq)) unlocks.set(prereq, []);
      unlocks.get(prereq).push(skill.id);
    }
  }

  const branchCounts = {};
  for (const skill of raw.skills) {
    branchCounts[skill.branch] = (branchCounts[skill.branch] || 0) + 1;
  }

  cache = {
    ...raw,
    byId,
    unlocks,
    branchCounts,
    skill: (id) => byId.get(id),
    unlockedBy: (id) => (unlocks.get(id) || []).map((x) => byId.get(x)),
    tierOf: (n) => raw.tiers.find((t) => t.tier === n),
    branchLabel: (id) => raw.branches.find((b) => b.id === id)?.label || id,
  };
  return cache;
}
