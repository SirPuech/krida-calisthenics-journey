# KRIDA · Calisthenics Journey

A skill-tree progression guide for calisthenics: 111 skills, four tiers, six
branches, each node gated behind a prerequisite, a form video and a rep standard.

Static site, no backend. It builds from `source/skill-tree.xlsx` and deploys
straight to GitHub Pages.

**Phase 1 — what this is right now:** one profile, stored in your browser, for
your own training. Accounts, per-person profiles and a leaderboard are designed
for but not built; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the seams
that make them a small change rather than a rewrite.

---

## Run it locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>. There is no build step and no dependencies —
it is HTML, CSS and ES modules. Open it through a server rather than as a
`file://` URL, or the module imports and the `fetch` of `data/skills.json` will
be blocked by CORS.

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`, which validates the skill
catalogue and publishes the repository root to Pages.

One-time setup, in the repo on github.com:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to `main`. The workflow publishes to
   `https://<user>.github.io/krida-calisthenics-journey/`.

Every path in the site is relative and routing is hash-based, so it works from a
project page, a user page or a subdirectory without configuration.

---

## Layout

```
index.html                app shell — header, nav, mount point
assets/css/app.css        Cyber Kinetic design tokens and components
js/app.js                 bootstrap + hash router
js/data.js                loads data/skills.json, builds the lookups
js/progress.js            unlock engine: status, XP, streak, badges (pure functions)
js/i18n.js                EN / TH interface copy
js/store/                 profile persistence
  schema.js                 profile shape + migrations
  local.js                  localStorage adapter (phase 1 default)
  gist.js                   optional GitHub Gist adapter
  index.js                  the facade every view talks to
js/views/                 one module per screen
data/skills.json          generated skill catalogue — do not hand-edit
source/skill-tree.xlsx    the workbook everything derives from
tools/build_skills.py     regenerates data/skills.json
tools/check_data.py       validates the catalogue (runs in CI)
```

## The skill data

`data/skills.json` is generated. To change it, edit the workbook or the tables in
`tools/build_skills.py`, then:

```bash
python3 tools/build_skills.py && python3 tools/check_data.py
```

CI fails the build if `data/skills.json` does not match what the script produces,
so a hand-edit to the JSON will not survive.

### What comes from the workbook, and what does not

Being clear about this matters, because the two are mixed in the same file:

| Field | Source |
| --- | --- |
| `name`, `sheetName` | The workbook, verbatim. |
| `videos` | The workbook's Form / Tutorial / Alternative columns, with their credits. 82 of 111 skills have links; the legs branch has none. |
| `variations` | The workbook's VP sheet. |
| `branch` | Derived by name matching (`BRANCH_RULES`). |
| `tier`, `depth` | **Derived**, from how far the skill sits from the tree's root cell on the TREE sheet. The workbook states no tiers. |
| `prereqs` | **Derived**, from the arrows drawn on the TREE sheet where they resolve unambiguously (30 edges), and a nearest-shallower-neighbour rule everywhere else (75 edges). |
| `standard` | **A placeholder.** The workbook carries no rep targets. `standard.source == "default"` means the number is a tier-based guess; the app lets you override any of them per skill. |
| `xp` | Derived from the tier. |

Two corrections sit on top of the derivation, both in `tools/build_skills.py`:

- `ENTRY_SKILLS` — the eight skills declared to be tree roots. Arrows near the
  centre of the sheet snap unreliably, so these are stated rather than inferred.
- `TIER_OVERRIDES` — a short list of skills the sheet's layout places closer to
  the root than their real difficulty warrants (Manna, Iron Cross, Hefesto and a
  few others). These are judgement calls, flagged as such in the file.

After both, `enforce_monotonic()` guarantees a purely structural invariant: no
skill sits at a lower tier than something it depends on. `tools/check_data.py`
re-checks that, plus reachability and cycles, on every push.

**If a prerequisite looks wrong to you, it probably is.** Put the correction in
`TIER_OVERRIDES` or `OVERRIDES` in `tools/build_skills.py` and rebuild.

## Your progress

Stored in this browser under `krida.profile.v1`. **Settings → Export JSON** before
you clear site data or move machines.

### Optional: sync through GitHub

Settings → *Sync with GitHub* mirrors your profile to a private Gist so it
follows you between devices.

Create a [fine-grained personal access token](https://github.com/settings/tokens?type=beta)
whose **only** permission is *Gists: read and write*, and paste it in. It is kept
in this browser's localStorage and sent only to `api.github.com`. Leave the gist
id blank the first time and one is created for you.

A token in localStorage is readable by anything that can run script on this
origin. That is an acceptable trade for a personal site with a gist-only token;
it is not the model phase 2 ships to other people, which uses OAuth instead.

## Language

The interface is English and Thai. Skill names stay in English in both, because
the workbook has no Thai column — adding a `nameTh` per skill in
`tools/build_skills.py` is all it takes to switch them on.

## Credit

Skill names, progressions and every video link come from
*The Calisthenics Skill Tree* workbook in `source/`. Videos are embedded from
their original creators — Calisthenicmovement, FitnessFAQs, Artem Morozov,
Calimnastic and others, credited on each skill page.
