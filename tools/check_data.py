#!/usr/bin/env python3
"""Validate data/skills.json. Run by CI before every Pages deploy.

Catches the failure modes that would break the app silently: a skill nothing
can reach, a prerequisite pointing at a missing id, a cycle, or a skill sitting
below one of its own prerequisites.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "skills.json"
PROGRAMS = ROOT / "data" / "programs.json"
CURATED = ROOT / "data" / "videos-curated.json"

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def check_programs(branch_ids, tier_numbers):
    """Validate data/programs.json — the file a coach edits by hand."""
    payload = json.loads(PROGRAMS.read_text())
    problems = []

    focus = payload["focus"]
    for name, spec in focus.items():
        if "label" not in spec:
            problems.append(f"focus {name!r}: no label")
        for branch in spec.get("branches", []):
            if branch not in branch_ids:
                problems.append(f"focus {name!r}: unknown branch {branch!r}")
    if "rest" not in focus:
        problems.append("focus: a 'rest' entry is required")

    block_ids = []
    for block in payload["blocks"]:
        block_ids.append(block["id"])
        if block["pick"] not in ("hold", "reps", "any"):
            problems.append(f"block {block['id']!r}: pick must be hold/reps/any")
        if block.get("include", "working") not in ("working", "owned", "any"):
            problems.append(f"block {block['id']!r}: include must be working/owned/any")
        if not isinstance(block.get("count"), int) or block["count"] < 1:
            problems.append(f"block {block['id']!r}: count must be a positive integer")

    for tier in tier_numbers:
        prescription = payload["prescriptions"].get(str(tier))
        if not prescription:
            problems.append(f"prescriptions: nothing for tier {tier}")
            continue
        for block_id in block_ids:
            spec = prescription.get(block_id)
            if not spec:
                problems.append(f"prescriptions[{tier}]: no {block_id!r} prescription")
            elif not spec.get("sets") or not spec.get("amount"):
                problems.append(f"prescriptions[{tier}].{block_id}: needs sets and amount")

    seen = set()
    for template in payload["templates"]:
        if template["id"] in seen:
            problems.append(f"template {template['id']!r}: duplicate id")
        seen.add(template["id"])
        if template["tier"] not in tier_numbers:
            problems.append(f"template {template['id']!r}: unknown tier {template['tier']}")
        week = template.get("week", {})
        for day in DAYS:
            if day not in week:
                problems.append(f"template {template['id']!r}: missing {day}")
            elif week[day] not in focus:
                problems.append(f"template {template['id']!r}: {day} has unknown focus {week[day]!r}")
        # A 'light' focus (mobility) is a day you show up for but not a
        # training session — sessionsPerWeek counts the hard ones.
        training = sum(1 for d in DAYS
                       if week.get(d) and week[d] != "rest"
                       and not focus.get(week[d], {}).get("light"))
        if training != template.get("sessionsPerWeek"):
            problems.append(
                f"template {template['id']!r}: sessionsPerWeek says "
                f"{template.get('sessionsPerWeek')} but the week has {training} training days")

    for tier in tier_numbers:
        if not any(t["tier"] == tier for t in payload["templates"]):
            problems.append(f"templates: no split written for tier {tier}")

    return problems, payload


def check_curated(skill_ids):
    """Validate data/videos-curated.json — the other file a human hand-edits."""
    if not CURATED.exists():
        return []
    payload = json.loads(CURATED.read_text())
    problems = []
    families = payload.get("families", {})
    dead = set(payload.get("deadLinks", []))

    for name, clips in families.items():
        for clip in clips:
            for field in ("kind", "url", "credit"):
                if not clip.get(field):
                    problems.append(f"families.{name}: a clip has no {field!r}")
            if clip.get("url") in dead:
                problems.append(f"families.{name}: {clip['url']} is in deadLinks")

    for skill_id, entry in payload.get("skills", {}).items():
        if skill_id not in skill_ids:
            problems.append(f"videos-curated: {skill_id!r} is not a skill")
        if entry.get("scope") not in ("skill", "family"):
            problems.append(f"videos-curated[{skill_id}]: scope must be skill or family")
        family = entry.get("family")
        if family and family not in families:
            problems.append(f"videos-curated[{skill_id}]: unknown family {family!r}")
        if not family and not entry.get("videos"):
            problems.append(f"videos-curated[{skill_id}]: neither videos nor family")
        for clip in entry.get("videos", []):
            if clip.get("url") in dead:
                problems.append(f"videos-curated[{skill_id}]: {clip['url']} is in deadLinks")

    return problems


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

    program_problems, programs = check_programs(branch_ids, tier_numbers)
    problems.extend(program_problems)
    problems.extend(check_curated(set(by_id)))

    # Every skill should reach the athlete with at least one video.
    without_video = [s["id"] for s in skills if not s["videos"]]
    dead = set(json.loads(CURATED.read_text()).get("deadLinks", [])) if CURATED.exists() else set()
    for skill in skills:
        for video in skill["videos"]:
            if video["url"] in dead:
                problems.append(f"{skill['id']}: ships a link recorded as dead — {video['url']}")
            if video.get("scope") not in ("skill", "family"):
                problems.append(f"{skill['id']}: video has no scope")
            if video.get("source") not in ("workbook", "curated"):
                problems.append(f"{skill['id']}: video has no source")

    if problems:
        print(f"FAIL — {len(problems)} problem(s):")
        for p in problems[:40]:
            print(f"  · {p}")
        return 1

    print(f"OK — {len(skills)} skills, {sum(len(s['prereqs']) for s in skills)} edges, "
          f"{sum(1 for s in skills if not s['prereqs'])} entry points, no cycles.")
    print(f"OK — {len(programs['templates'])} program templates, "
          f"{len(programs['blocks'])} blocks, {len(programs['focus'])} focus types.")
    counted = sum(len(s["videos"]) for s in skills)
    family = sum(1 for s in skills for v in s["videos"] if v["scope"] == "family")
    print(f"OK — {counted} video attachments, {family} family-scope, "
          f"{len(without_video)} skill(s) with none.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
