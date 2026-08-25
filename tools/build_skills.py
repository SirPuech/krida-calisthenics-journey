#!/usr/bin/env python3
"""Regenerate data/skills.json from source/skill-tree.xlsx.

The workbook is the single source of truth for skill names, video credits and
progression variations. Everything this script derives (branch, tier, prereqs,
rep standards) is written into the JSON so it can be hand-corrected there —
re-running this script overwrites those corrections, so edit the workbook or
the OVERRIDES table below rather than data/skills.json if you want the change
to survive a rebuild.

Usage:  python3 tools/build_skills.py
"""
import json, re, sys, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "source" / "skill-tree.xlsx"
OUT = ROOT / "data" / "skills.json"

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
XDR = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

# Geometry of the TREE sheet: every column is 61px and every row 21px, so a
# shape's EMU extent converts back to cell coordinates exactly.
COL_EMU, ROW_EMU = 581025.0, 200025.0
# The "Calisthenics/Gymnastics" root cell. The tree radiates from it in every
# direction — right for push/core/legs, left for pull, down for rings, up for
# handstand — so difficulty tracks 2D distance from here, not column alone.
ROOT_ROW, ROOT_COL = 21, 16
ROW_WEIGHT = 1.5       # a row step is a bigger jump than a column step
ARROW_TOLERANCE = 1.6  # cells; beyond this an arrow endpoint is too ambiguous

ROOT_NAME = "__root__"

NON_SKILL = ("Legend", "Warning", "When clicking", "Unlock Path",
             "Unlocked Skills", "Legendary Skills", "Calisthenics/Gym")

# TREE sheet shorthand -> the full name used on the video sheet.
ALIASES = {
    "Psuedo PU": "Psuedo Push-Up",
    "OA Pull-Up": "OA PU (One Arm; Pull-Up)",
    "OA Back Lever": "OA BL (One Arm; Back Lever)",
    "OA Back Lever PU": "OA BL PU (One Arm; Back Lever; Pull Up)",
    "Back Lever Pull-Up": "Back Lever PU (Pull Up)",
    "Maltese Press to Inv. IC": "Maltese to Inv. IC (Inverted Iron Cross)",
}

# Ordered branch rules — first pattern that matches a name wins.
BRANCH_RULES = [
    ("legs",      r"squat|leg ext|leg press|nordic|hamstring|pistol|shrimp|shrip|sissy|hawaiian"),
    ("core",      r"plank|dragon|l-sit|v-sit|manna|tuck.sit|reverse planche|leg ext\. lever"),
    ("handstand", r"\bhs\b|handstand|tigerbend|planche press|maltese press"),
    ("rings",     r"\bring|iron cross|\bic\b|butterfly|azarian|van gelder|zanetti|carmona|victorian|bulgarian"),
    ("pull",      r"pull|chin|\bmu\b|muscle up|front lever|back lever|\bbl\b|hefesto|pelikan|\bfl\b"),
    ("push",      r"push|dip|planche|maltese|morozov"),
]
BRANCH_LABELS = {
    "push": "Push", "pull": "Pull", "core": "Core",
    "handstand": "Handstand", "rings": "Rings", "legs": "Legs",
}

# Radial depth -> tier.
TIER_BANDS = [(10, 1), (16, 2), (24, 3)]  # else tier 4
TIER_NAMES = {1: "Beginner", 2: "Intermediate", 3: "Advanced", 4: "Master"}
TIER_XP = {1: 100, 2: 250, 3: 500, 4: 1000}

HOLD_RE = re.compile(
    r"lever|planche|plank|l-sit|v-sit|manna|tuck.sit|\bhs\b|handstand|cross|"
    r"maltese|victorian|lean|pelikan|butterfly|hold|inv\.", re.I)
# Default rep standards by tier — the workbook carries none, so these are
# starting points the app lets you override per skill.
DEFAULT_REPS = {1: (3, 12), 2: (3, 8), 3: (3, 5), 4: (3, 3)}
DEFAULT_HOLDS = {1: (3, 20), 2: (3, 15), 3: (3, 10), 4: (3, 5)}

# The tree's starting nodes. Arrows this close to the root snap unreliably, so
# these are declared rather than derived: they never get a prerequisite.
ENTRY_SKILLS = {
    "push-up", "pull-up", "plank", "squat", "tuck-sit",
    "wall-hs", "ring-turn-out", "hamstring-bridge",
}

# Hand corrections applied last, keyed by skill id. Put anything the geometry
# gets wrong here — it survives a rebuild, unlike edits to data/skills.json.
#
# The tier below is a judgement call, not sheet data: these skills sit close to
# the root in the workbook's layout, so the radial derivation understates them.
# Everything downstream of them is lifted automatically by enforce_monotonic().
TIER_OVERRIDES = {
    "manna": 4,
    "iron-cross": 4,
    "inverted-iron-cross": 4,
    "butterfly": 4,
    "pelikan": 4,
    "hefesto": 3,
    "front-lever": 3,
    "v-sit": 3,
    "back-lever": 2,
}

# Free-form patches applied after everything else, keyed by skill id.
OVERRIDES = {}


def depth_of(row, col):
    return round(abs(col - ROOT_COL) + ROW_WEIGHT * abs(row - ROOT_ROW), 2)


def slug(name):
    s = re.sub(r"\(.*?\)", "", name)
    s = s.replace("Psuedo", "Pseudo").replace("Nodrdic", "Nordic").replace("Shrip", "Shrimp")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s


def canon(name):
    s = re.sub(r"\(.*?\)", "", name)
    s = s.replace("Psuedo", "Pseudo").replace("Nodrdic", "Nordic").replace("Shrip", "Shrimp")
    s = s.replace("-", " ").replace(".", " ")
    return re.sub(r"\s+", " ", s).strip().lower()


def display(name):
    """Strip the workbook's disambiguation parentheses for on-screen use."""
    s = re.sub(r"\s*\(.*?\)", "", name).strip()
    s = s.replace("Psuedo", "Pseudo").replace("Nodrdic", "Nordic").replace("Shrip", "Shrimp")
    return s or name


class Book:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
        self.strings = ["".join(t.text or "" for t in si.iter(M + "t"))
                        for si in root.findall(M + "si", )]
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        rid = {r.get("Id"): r.get("Target") for r in rels}
        self.sheets = {}
        for s in wb.find(M + "sheets"):
            t = rid[s.get(R + "id")]
            self.sheets[s.get("name")] = t if t.startswith("xl/") else "xl/" + t.lstrip("/")

    def rows(self, sheet):
        path = self.sheets[sheet]
        root = ET.fromstring(self.z.read(path))
        relpath = path.replace("worksheets/", "worksheets/_rels/") + ".rels"
        links = {}
        if relpath in self.z.namelist():
            rr = ET.fromstring(self.z.read(relpath))
            targets = {x.get("Id"): x.get("Target") for x in rr}
            for h in root.iter(M + "hyperlink"):
                rid = h.get(R + "id")
                if rid in targets:
                    links[h.get("ref")] = targets[rid]
        out = []
        for row in root.iter(M + "row"):
            cells = {}
            for c in row.findall(M + "c"):
                ref, t = c.get("r"), c.get("t")
                v, inline = c.find(M + "v"), c.find(M + "is")
                if t == "s" and v is not None:
                    val = self.strings[int(v.text)]
                elif t == "inlineStr" and inline is not None:
                    val = "".join(x.text or "" for x in inline.iter(M + "t"))
                else:
                    val = v.text if v is not None else ""
                val = (val or "").strip()
                if val or ref in links:
                    letters = re.match(r"([A-Z]+)", ref).group(1)
                    n = 0
                    for ch in letters:
                        n = n * 26 + ord(ch) - 64
                    cells[n - 1] = {"v": val, "href": links.get(ref)}
            if cells:
                out.append([cells.get(i, {"v": "", "href": None})
                            for i in range(max(cells) + 1)])
        return out


def tree_cells(book):
    """Every skill name on the TREE sheet, with its grid position.

    The root cell is kept as a snap target so arrows leaving the middle of the
    tree resolve to it instead of to whichever skill happens to sit nearby.
    """
    cells = []
    for ri, row in enumerate(book.rows("TREE")):
        for ci, cell in enumerate(row):
            v = cell["v"]
            if v and not v.startswith(NON_SKILL):
                cells.append({"row": ri, "col": ci, "name": v})
    cells.append({"row": ROOT_ROW, "col": ROOT_COL, "name": ROOT_NAME, "root": True})
    return cells


def arrows(book, cells):
    """Prerequisite edges drawn as arrow connectors on the TREE sheet."""
    d = ET.fromstring(book.z.read("xl/drawings/drawing1.xml"))
    edges, dropped = [], 0

    def point(el):
        c = int(el.find(XDR + "col").text) + int(el.find(XDR + "colOff").text) / COL_EMU
        r = int(el.find(XDR + "row").text) + int(el.find(XDR + "rowOff").text) / ROW_EMU
        return c, r

    def nearest(x, y):
        best, bd = None, 1e9
        for c in cells:
            d2 = (c["col"] + .5 - x) ** 2 + ((c["row"] + .5 - y) * 1.1) ** 2
            if d2 < bd:
                bd, best = d2, c
        return best, bd ** .5

    for anchor in list(d):
        cxn = anchor.find(XDR + "cxnSp")
        if cxn is None:
            continue
        x0, y0 = point(anchor.find(XDR + "from"))
        xfrm = cxn.find(XDR + "spPr").find(A + "xfrm")
        if anchor.tag.endswith("twoCellAnchor"):
            x1, y1 = point(anchor.find(XDR + "to"))
        else:
            ext = anchor.find(XDR + "ext")
            x1 = x0 + int(ext.get("cx")) / COL_EMU
            y1 = y0 + int(ext.get("cy")) / ROW_EMU
        if xfrm.get("flipH") == "1":
            x0, x1 = x1, x0
        if xfrm.get("flipV") == "1":
            y0, y1 = y1, y0
        a, da = nearest(x0, y0)
        b, db = nearest(x1, y1)
        if a is None or b is None or a is b or da > ARROW_TOLERANCE or db > ARROW_TOLERANCE:
            dropped += 1
            continue
        edges.append((a, b))
    return edges, dropped


def enforce_monotonic(skills, by_id):
    """A skill can never sit at a lower tier than something it depends on.

    Purely structural: it encodes "you cannot reach this without clearing that
    first", so it fixes ordering without adding any opinion of its own. Walking
    in depth order means every prerequisite is final before its dependants.
    """
    lifted = 0
    for skill in sorted(skills, key=lambda s: s["depth"]):
        for prereq in skill["prereqs"]:
            floor = by_id[prereq]["tier"]
            if skill["tier"] < floor:
                skill["tier"] = floor
                lifted += 1
    return lifted


def build():
    book = Book(XLSX)
    cells = tree_cells(book)

    # --- videos, keyed by canonical name -------------------------------------
    videos, variations = {}, {}
    LABELS = ["form", "tutorial", "alt"]
    for row in book.rows("Sheet2")[1:]:
        if len(row) < 3 or not row[2]["v"]:
            continue
        key = canon(row[2]["v"])
        vids = []
        for i, kind in zip((3, 4, 5), LABELS):
            if i >= len(row):
                continue
            cell = row[i]
            if not cell["href"] or "/" * 5 in cell["v"]:
                continue
            credit = re.search(r"\(([^)]*)\)", cell["v"])
            vids.append({"kind": kind, "url": cell["href"],
                         "credit": credit.group(1).strip() if credit else ""})
        videos[key] = vids

    # --- variations: each VP column is one skill's progression ladder ---------
    vp = book.rows("VP")
    width = max(len(r) for r in vp)
    for col in range(width):
        header, items = None, []

        def flush():
            if header and items:
                variations.setdefault(canon(header), []).extend(items)

        for row in vp:
            cell = row[col] if col < len(row) else {"v": "", "href": None}
            v = cell["v"]
            if not v:                      # a blank cell closes the block
                flush()
                header, items = None, []
                continue
            if header is None:             # first cell of a block is the skill
                header = v
            else:
                items.append(v)
        flush()

    # --- skills --------------------------------------------------------------
    by_id, skills = {}, []
    for c in cells:
        if c.get("root"):
            c["id"] = ROOT_NAME
            continue
        name = ALIASES.get(c["name"], c["name"])
        sid = slug(name)
        if sid in by_id:          # the same skill can appear twice on the sheet
            continue
        depth = depth_of(c["row"], c["col"])
        tier = next((t for lim, t in TIER_BANDS if depth <= lim), 4)
        branch = next((b for b, pat in BRANCH_RULES if re.search(pat, name, re.I)), "push")
        lookup = canon(name)
        is_hold = bool(HOLD_RE.search(name))
        sets, amount = (DEFAULT_HOLDS if is_hold else DEFAULT_REPS)[tier]
        skill = {
            "id": sid,
            "name": display(name),
            "sheetName": c["name"],
            "branch": branch,
            "branchLabel": BRANCH_LABELS[branch],
            "tier": tier,
            "tierName": TIER_NAMES[tier],
            "depth": depth,
            "xp": TIER_XP[tier],
            "standard": {"sets": sets, "type": "hold" if is_hold else "reps",
                         "amount": amount, "source": "default"},
            "prereqs": [],
            "videos": videos.get(lookup, []),
            "variations": variations.get(lookup, []),
            "pos": {"row": c["row"], "col": c["col"]},
        }
        by_id[sid] = skill
        skills.append(skill)
        c["id"] = sid

    # --- prerequisites: drawn arrows first, then the row-band fallback --------
    edges, dropped = arrows(book, cells)
    from_arrows = 0
    for a, b in edges:
        if a.get("root") or b.get("root"):
            continue
        src, dst = by_id[a["id"]], by_id[b["id"]]
        if src["depth"] > dst["depth"]:       # arrows point away from the root
            src, dst = dst, src
        if src["depth"] == dst["depth"] or src["id"] in dst["prereqs"]:
            continue
        if dst["id"] in ENTRY_SKILLS:
            continue
        # Near the root a cross-branch arrow is far more likely to be a bad snap
        # than a real dependency; deeper in the tree branches genuinely merge.
        if src["branch"] != dst["branch"] and dst["depth"] <= 12:
            continue
        dst["prereqs"].append(src["id"])
        from_arrows += 1

    from_bands = 0
    for c in cells:
        if c.get("root"):
            continue
        skill = by_id[c["id"]]
        if skill["prereqs"] or skill["id"] in ENTRY_SKILLS or skill["depth"] <= 3:
            continue
        best, bd = None, 1e9
        for other in cells:
            if other.get("root"):
                continue
            o = by_id[other["id"]]
            if o is skill or o["depth"] >= skill["depth"]:
                continue
            drow, dcol = abs(other["row"] - c["row"]), abs(other["col"] - c["col"])
            if drow > 4 or dcol > 6:
                continue
            # a jump to another branch is allowed but heavily penalised, so it
            # only wins when nothing in the same branch is anywhere near
            cost = drow * ROW_WEIGHT + dcol + (0 if o["branch"] == skill["branch"] else 12)
            if cost < bd:
                bd, best = cost, o
        if best:
            skill["prereqs"].append(best["id"])
            from_bands += 1

    for sid, tier in TIER_OVERRIDES.items():
        if sid in by_id:
            by_id[sid]["tier"] = tier

    lifted = enforce_monotonic(skills, by_id)

    for skill in skills:
        skill["tierName"] = TIER_NAMES[skill["tier"]]
        skill["xp"] = TIER_XP[skill["tier"]]

    for sid, patch in OVERRIDES.items():
        if sid in by_id:
            by_id[sid].update(patch)

    skills.sort(key=lambda s: (s["tier"], s["branch"], s["depth"], s["name"]))
    payload = {
        "version": 1,
        "generatedFrom": XLSX.name,
        "root": {"row": ROOT_ROW, "col": ROOT_COL},
        "branches": [{"id": b, "label": BRANCH_LABELS[b]} for b, _ in BRANCH_RULES],
        "tiers": [{"tier": t, "name": TIER_NAMES[t], "xp": TIER_XP[t]} for t in (1, 2, 3, 4)],
        "notes": [
            "Skill names, video credits and variations come straight from the workbook.",
            "branch / tier / prereqs are derived: tier from distance to the root column, "
            "prereqs from the arrows drawn on the TREE sheet with a nearest-neighbour fallback.",
            "standard.source == 'default' means the rep target is a placeholder, not sheet data.",
        ],
        "skills": skills,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1))

    with_video = sum(1 for s in skills if s["videos"])

    # Every skill has to be reachable from an entry skill, or it can never be
    # unlocked in the app. Walk the graph forward and report anything stranded.
    children = {}
    for skill in skills:
        for prereq in skill["prereqs"]:
            children.setdefault(prereq, []).append(skill["id"])
    frontier = [s["id"] for s in skills if not s["prereqs"]]
    seen = set(frontier)
    while frontier:
        for child in children.get(frontier.pop(), []):
            if child not in seen:
                seen.add(child)
                frontier.append(child)
    orphans = [s["id"] for s in skills if s["id"] not in seen]
    print(f"skills            {len(skills)}")
    print(f"  with videos     {with_video}")
    print(f"  with variations {sum(1 for s in skills if s['variations'])}")
    print(f"prereq edges      {from_arrows} from arrows + {from_bands} from neighbours "
          f"({dropped} arrows too ambiguous, dropped)")
    print(f"tiers lifted      {lifted} (to stay >= their prerequisites)")
    print(f"entry skills      {sum(1 for s in skills if not s['prereqs'])}")
    print(f"unreachable       {len(orphans)}{' ' + ', '.join(orphans) if orphans else ''}")
    for t in (1, 2, 3, 4):
        print(f"  tier {t} {TIER_NAMES[t]:13s} {sum(1 for s in skills if s['tier'] == t)}")
    print(f"-> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(build())
