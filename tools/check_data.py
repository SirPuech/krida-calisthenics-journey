#!/usr/bin/env python3
"""Validate data/skills.json. Run by CI before every Pages deploy.

Catches the failure modes that would break the app silently: a skill nothing
can reach, a prerequisite pointing at a missing id, a cycle, or a skill sitting
below one of its own prerequisites.
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "skills.json"


def main():
    payload = json.loads(DATA.read_text())
    skills = payload["skills"]
    by_id = {s["id"]: s for s in skills}
    problems = []

    if len(by_id) != len(skills):
        problems.append("duplicate skill ids")

    branch_ids = {b["id"] for b in payload["branches"]}
    tier_numbers = {t["tier"] for t in payload["tiers"]}

    for skill in skills:
        for field in ("id", "name", "branch", "tier", "xp", "standard", "prereqs"):
            if field not in skill:
                problems.append(f"{skill.get('id', '?')}: missing '{field}'")
        if skill["branch"] not in branch_ids:
            problems.append(f"{skill['id']}: unknown branch {skill['branch']!r}")
        if skill["tier"] not in tier_numbers:
            problems.append(f"{skill['id']}: unknown tier {skill['tier']!r}")
        if skill["id"] in skill["prereqs"]:
            problems.append(f"{skill['id']}: is its own prerequisite")
        for prereq in skill["prereqs"]:
            if prereq not in by_id:
                problems.append(f"{skill['id']}: prerequisite {prereq!r} does not exist")
            elif by_id[prereq]["tier"] > skill["tier"]:
                problems.append(
                    f"{skill['id']} (T{skill['tier']}) sits below its prerequisite "
                    f"{prereq} (T{by_id[prereq]['tier']})")
        std = skill.get("standard") or {}
        if not std.get("sets") or not std.get("amount"):
            problems.append(f"{skill['id']}: standard has no sets/amount")

    # Reachability: walk forward from the skills that have no prerequisites.
    children = {}
    for skill in skills:
        for prereq in skill["prereqs"]:
            children.setdefault(prereq, []).append(skill["id"])
    frontier = [s["id"] for s in skills if not s["prereqs"]]
    if not frontier:
        problems.append("no entry skills — nothing can ever be unlocked")
    seen = set(frontier)
    while frontier:
        for child in children.get(frontier.pop(), []):
            if child not in seen:
                seen.add(child)
                frontier.append(child)
    for skill in skills:
        if skill["id"] not in seen:
            problems.append(f"{skill['id']}: unreachable from any entry skill")

    # Cycles: a DFS over the prerequisite edges.
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {s["id"]: WHITE for s in skills}

    def visit(node, trail):
        if colour[node] == GREY:
            problems.append(f"cycle: {' -> '.join(trail + [node])}")
            return
        if colour[node] == BLACK:
            return
        colour[node] = GREY
        for prereq in by_id[node]["prereqs"]:
            if prereq in by_id:
                visit(prereq, trail + [node])
        colour[node] = BLACK

    sys.setrecursionlimit(10000)
    for skill in skills:
        visit(skill["id"], [])

    if problems:
        print(f"FAIL — {len(problems)} problem(s):")
        for p in problems[:40]:
            print(f"  · {p}")
        return 1

    print(f"OK — {len(skills)} skills, {sum(len(s['prereqs']) for s in skills)} edges, "
          f"{sum(1 for s in skills if not s['prereqs'])} entry points, no cycles.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
