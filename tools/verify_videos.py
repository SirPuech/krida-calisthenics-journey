#!/usr/bin/env python3
"""Check every video link in data/skills.json against YouTube's oEmbed endpoint.

Run by hand, not in CI — it needs network and third-party links rot on their own
schedule, which should not be able to fail a deploy.

    python3 tools/verify_videos.py            # check everything
    python3 tools/verify_videos.py --curated  # only the hand-added ones
    python3 tools/verify_videos.py --write    # record dead links in videos-curated.json
"""
import concurrent.futures as futures
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "skills.json"
CURATED = ROOT / "data" / "videos-curated.json"
OEMBED = "https://www.youtube.com/oembed?format=json&url="


def check(url):
    try:
        req = urllib.request.Request(
            OEMBED + urllib.parse.quote(url, safe=""),
            headers={"User-Agent": "krida-link-check"},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            payload = json.load(response)
        return True, payload.get("author_name", ""), payload.get("title", "")
    except urllib.error.HTTPError as err:
        # 401/403 mean the video exists but blocks embedding; 404 means it is gone.
        return False, f"HTTP {err.code}", "removed or private" if err.code == 404 else "not embeddable"
    except Exception as err:                                  # noqa: BLE001
        return False, type(err).__name__, str(err)[:60]


def main():
    only_curated = "--curated" in sys.argv
    skills = json.loads(DATA.read_text())["skills"]

    targets = []
    for skill in skills:
        for video in skill["videos"]:
            if only_curated and video.get("source") != "curated":
                continue
            targets.append((skill["id"], video))

    # De-duplicate: the same clip is attached to every skill in a family.
    unique = {}
    for skill_id, video in targets:
        unique.setdefault(video["url"], []).append(skill_id)

    print(f"checking {len(unique)} distinct links across {len(targets)} attachments…\n")
    failures, mismatches = [], []

    with futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = dict(zip(unique, pool.map(check, unique)))

    by_skill = {}
    for url, (ok, author, title) in results.items():
        video = next(v for s in skills for v in s["videos"] if v["url"] == url)
        if not ok:
            failures.append((url, author, title, unique[url], video.get("source")))
            for skill_id in unique[url]:
                by_skill.setdefault(skill_id, []).append(url)
            continue
        # Credit drift only means something for curated links, where the credit
        # is the channel by construction. The workbook credits the athlete in
        # the clip, not whoever uploaded it, so comparing the two is noise.
        stored = video.get("credit", "")
        if video.get("source") == "curated" and stored and author \
                and stored.lower()[:12] not in author.lower():
            mismatches.append((url, stored, author))

    if failures:
        print("Dead links\n")
        for source in ("curated", "workbook"):
            group = [f for f in failures if f[4] == source]
            if not group:
                continue
            print(f"  from the {source}: {len(group)}")
            for url, code, why, users, _ in sorted(group, key=lambda f: f[3][0]):
                print(f"    {code:9s} {why:16s} {users[0]:28s} {url}")
            print()

    for url, stored, author in mismatches:
        print(f"DRIFT credit says {stored!r} but the channel is {author!r}\n      {url}")

    stranded = [s["id"] for s in skills
                if s["videos"] and all(v["url"] in by_skill.get(s["id"], []) for v in s["videos"])]

    print(f"{len(unique) - len(failures)}/{len(unique)} links resolve.")
    if stranded:
        print(f"{len(stranded)} skill(s) now have no working video at all:")
        for skill_id in stranded:
            print(f"    {skill_id}")
    if mismatches:
        print(f"{len(mismatches)} curated credit mismatch(es) — update data/videos-curated.json.")
    if "--write" in sys.argv:
        curated = json.loads(CURATED.read_text())
        known = set(curated.get("deadLinks", []))
        found = {f[0] for f in failures}
        curated["deadLinks"] = sorted(known | found)
        CURATED.write_text(json.dumps(curated, ensure_ascii=False, indent=2) + "\n")
        print(f"\nrecorded {len(found - known)} newly dead link(s) in "
              f"{CURATED.relative_to(ROOT)} — rerun tools/build_skills.py")

    # Dead third-party links are a maintenance signal, not a build failure.
    return 0


if __name__ == "__main__":
    sys.exit(main())
