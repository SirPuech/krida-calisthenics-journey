# KRIDA · Calisthenics Journey

A skill-tree progression guide for calisthenics: 111 skills, four tiers, six
branches, each node gated behind a prerequisite, a 3D form animation and a rep standard.

Static site, no backend. It builds from `source/skill-tree.xlsx` and deploys
straight to GitHub Pages.

**Phase 2 — what this is right now:** up to five accounts, each with its own
account, username + password with emailed reset, backed by a small Cloudflare
Worker. A leaderboard is designed for but not built; see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
js/data.js                loads the JSON data files, builds the lookups
js/progress.js            unlock engine: status, XP, streak, badges (pure functions)
js/coach.js               session builder — resolves programs.json against your unlocks
js/exercise/              the Three.js exercise animator
  figure.js                 low-poly humanoid rig
  poses.js                  per-archetype joint keyframes + apparatus + camera
  animator.js               scene, loop, apparatus, mount/dispose
js/i18n.js                EN / TH interface copy
js/store/                 profile persistence
  schema.js                 profile shape + migrations
  local.js                  localStorage (guest profiles)
  api.js                    client for the auth Worker
  index.js                  the facade every view talks to (guest + account)
worker/                   the Cloudflare Worker: accounts, sessions, reset email
js/views/                 one module per screen
data/skills.json          generated skill catalogue — do not hand-edit
data/programs.json        coach-editable splits and prescriptions — hand-edit this
data/exercise-guide.json  generated: animation archetype + how-to per skill
source/skill-tree.xlsx    the workbook the catalogue derives from
tools/build_skills.py     regenerates data/skills.json
tools/build_guide.py      regenerates data/exercise-guide.json
tools/check_data.py       validates the catalogue + guide (runs in CI)
exercise-lab.html         dev harness: renders any archetype for tuning poses
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
| how-to / animation | Not in `skills.json` — see `data/exercise-guide.json` and **Exercise animations** below. |
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

## Exercise animations

Every skill's page shows a **Three.js animation** of the movement — a rigged
low-poly figure that performs the rep or holds the position, on the right
apparatus (bar, rings, parallettes, floor, wall) and framed from the angle that
reads best — alongside a written **how-to**: setup, numbered steps, a key cue,
and the common mistake.

There are no videos. The workbook's links covered only 82 of 111 skills and 43
of them were already dead; the animations cover all 111 and never rot.

`data/exercise-guide.json` maps each skill to one of ~19 movement **archetypes**
plus its instruction text. It is generated:

```bash
python3 tools/build_guide.py && python3 tools/check_data.py
```

The archetype rules and the coaching cues live in `tools/build_guide.py`; the
last step of each skill's instructions (the target and prerequisites) is pulled
from the skill's own data. To retune a movement's animation, edit its pose
keyframes in `js/exercise/poses.js` and preview them in `exercise-lab.html`
(open it and pick an archetype, or "Show all" for a grid). Because each archetype
is shared by a family of skills, one pose fix improves every skill that uses it.

Three.js loads on demand from a CDN the first time an animation mounts, so pages
that never open a skill stay light. Each animation disposes its WebGL context on
navigation, so browsing skill after skill never exhausts the browser's context
limit.

## The program (for a coach)## The program (for a coach)

`data/programs.json` is the one file a calisthenics coach can retune the whole
app from. Nothing generates it — edit it directly and the change is live on the
next deploy. It holds no skill names at all; it describes **what to pick**, and
`js/coach.js` resolves that against whatever the athlete has actually unlocked.

Three things live in it:

- **`templates`** — the weekly splits, each tagged with the tier it is written
  for. The app auto-selects the closest match to the athlete's level, and they
  can pick a different one. Add a template and it appears in the dropdown.
- **`prescriptions`** — sets, reps/seconds and rest per tier, per block. Change
  the tier-2 strength line and every intermediate strength block changes.
- **`blocks`** — the shape of a session, in order. Each block says which
  movement type to pick (`hold` / `reps` / `any`), which pool to draw from
  (`working` = unlocked but not yet cleared, `owned` = already cleared), how far
  from the athlete's level (`tierOffset`), and how many.

The default structure is skill work → strength → accessory: statics first on a
fresh nervous system, dynamic strength as the main work, then cleared skills a
tier down for accessory volume.

**Training level** drives all of it. `Auto` follows the highest tier the athlete
has cleared anything in; they can also pin a level to deliberately train below
or above it. Any day's focus can be overridden without leaving the split.

`tools/check_data.py` validates this file too — unknown branches, missing
prescriptions, a template whose week does not match its advertised
`sessionsPerWeek`, or a tier with no split written for it will all fail CI.

Thai copy goes in `labelTh` / `noteTh` alongside each English field, and
templates take optional `nameTh` / `summaryTh`. Anything untranslated falls back
to English rather than rendering blank.

**What it is not:** general programming based on tier, not individual coaching.
It knows nothing about injuries, sleep or recovery, and the app says so on the
program page.

## Guests and accounts

**Nothing is behind a login.** The landing page offers *Join as guest*, and a
guest can use the entire site — the tree, the programs, every animation, logging
sets, the dashboard. A guest's progress is saved on their device.

Accounts are opt-in, from **Settings → Account**, and are **username + password**
with **emailed password reset**. They are backed by a small Cloudflare Worker
(`worker/`), which is the only server in the stack; deploy it and set its URL in
`data/config.json` to switch accounts on. Until then the site runs guest-only
and says so. See [worker/README.md](worker/README.md).

- **Sign up / sign in** with a username and password. Signing up offers to carry
  the guest's progress across, so nobody starts over for having looked first.
- **Forgot password** emails a reset link (valid one hour).
- **The owner** — the first account created, or whoever `ADMIN_USERNAME` names —
  can manage users from Settings: email anyone a reset link, set a password
  directly, or remove an account.
- Up to **five** accounts share one deployment (`SEAT_LIMIT`).

Passwords are hashed on the server (PBKDF2, per-user salt); the profile is stored
per-user and follows you between devices. Details:

- The session token is kept in `localStorage`, so you stay signed in across
  reloads until you sign out.
- **There is no password recovery** — a reset sets a *new* password. The server
  never stores anything that can reveal the old one. That is standard, and it is
  exactly why an emailed reset can exist here when the earlier device-only model
  could not have had one.
- A guest's own on-device profile is what an account claims on sign-up, so
  looking around first costs nothing.

### What this is and is not

Accounts are real server-enforced auth: passwords are verified and hashed on the
Worker, sessions are revocable server-side tokens, and one member cannot read
another's data. It is **not** anonymous — the Worker stores each member's
profile and email. That is the right trade for a small named group; the seat
limit and the admin controls assume you know who your five people are.

Guest mode remains fully local and needs no server.

## Your progress

An account's progress lives on the server and follows you between devices. A
guest's lives in this browser under `krida.profile.v1`. Either way,
**Settings → Export JSON** saves a copy before you clear site data or switch
machines.

## The leaderboard, later

`profile.visibility` still defaults to `private` with a Settings toggle. With the
Worker in place, a phase-3 leaderboard is a scheduled job that reads the opted-in
profiles server-side and writes a `data/leaderboard.json` the site fetches — no
change to the auth model. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Language

The interface is English and Thai. Skill names stay in English in both, because
the workbook has no Thai column — adding a `nameTh` per skill in
`tools/build_skills.py` is all it takes to switch them on.

## Credit

Skill names and progressions come from *The Calisthenics Skill Tree* workbook in
`source/`. The exercise animations are generated in-house (`js/exercise/`), so
there are no third-party embeds to credit or maintain.
