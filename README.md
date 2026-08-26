# KRIDA · Calisthenics Journey

A skill-tree progression guide for calisthenics: 111 skills, four tiers, six
branches, each node gated behind a prerequisite, a form video and a rep standard.

Static site, no backend. It builds from `source/skill-tree.xlsx` and deploys
straight to GitHub Pages.

**Phase 2 — what this is right now:** up to five accounts, each with its own
profile, sealed with its own passphrase. A leaderboard is designed for but not
built; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
js/i18n.js                EN / TH interface copy
js/crypto.js              PBKDF2 + AES-GCM vault sealing (WebCrypto)
js/store/                 profile persistence
  schema.js                 profile shape + migrations
  accounts.js               the roster: create, sign in, seal, merge
  local.js                  localStorage adapter (pre-accounts profiles)
  gist.js                   optional shared-Gist adapter
  index.js                  the facade every view talks to
js/views/                 one module per screen
data/skills.json          generated skill catalogue — do not hand-edit
data/programs.json        coach-editable splits and prescriptions — hand-edit this
data/videos-curated.json  curated tutorials + known-dead links — hand-edit this
source/skill-tree.xlsx    the workbook the catalogue derives from
tools/build_skills.py     regenerates data/skills.json
tools/check_data.py       validates the catalogue (runs in CI)
tools/verify_videos.py    checks every video link against YouTube (run by hand)
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
| `videos` | The workbook's Form / Tutorial / Alternative columns, plus curated additions — see below. All 111 skills have at least one working link. |
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

## Videos

The workbook covered 82 of 111 skills and left the whole legs branch empty. Worse,
**43 of its 197 links were dead** — removed, private, or no longer embeddable —
which nothing had ever checked.

Both are fixed. Every skill now has at least one working tutorial, and all 164
links in the catalogue resolve.

`data/videos-curated.json` holds the additions. Two things matter about it:

- **Every URL was verified**, not taken on trust from a search result. The
  `credit` and `title` stored next to each link are what YouTube's oEmbed
  endpoint actually returned for it.
- **`scope` is honest about coverage.** `skill` means the video is about that
  exact movement. `family` means it covers the movement family and is attached
  to a one-leg or elevated variant with no dedicated tutorial of its own — the
  skill page labels those *"Family tutorial — covers the movement, not this
  exact variation"* rather than pretending otherwise. 71 of 237 attachments are
  family-scope.

`deadLinks` records URLs confirmed gone. The build strips them, which is what
lets a curated replacement take over a skill the workbook nominally "covers".

### Re-checking links

Third-party links rot, so this is a manual tool rather than a CI step — a video
going private should not fail your deploy:

```bash
python3 tools/verify_videos.py
```

It reports dead links grouped by source, names any skill left with **no** working
video, and flags curated entries whose stored credit no longer matches the
channel. `--write` records new failures into `deadLinks` for you; `--curated`
checks only the hand-added ones. It never fails the build.

## The program (for a coach)

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

## Accounts

Up to **five** people share one deployment. There is no server, so sign-in works
like this:

- Each account has a **passphrase**, and that passphrase derives an AES-GCM key
  via PBKDF2 (250,000 iterations, WebCrypto). The profile is **encrypted** with
  it before it ever touches localStorage or the shared Gist.
- Names stay in the clear — the sign-in screen needs them, and a future
  leaderboard reads the small opted-in `public` summary without any passphrase.
- Everything else about a person is inside the sealed vault. One member of the
  roster **cannot** read another's training log.

**There is no password reset.** Nothing on the device can decrypt a vault
without its passphrase — that is the point of the design, and the cost of it.
Lose the passphrase and that account's history is gone.

### What this is and is not

It is real encryption at rest: a stolen Gist, or someone poking at localStorage,
gets ciphertext. It is **not** server-enforced authentication — there is no
server to enforce anything. Anyone who can load the page can see the roster's
*names* and create an account while seats remain. That is the right trade for a
private training group; do not treat it as protection against a determined
attacker, and do not put anything in here you would not put in a shared note.

The passphrase is held in `sessionStorage` while you are signed in, so a reload
keeps you in and closing the tab signs you out.

A profile from before accounts existed is offered on first load as *"claim your
existing progress"* — pick a passphrase and it becomes your account.

## Your progress

Sealed in this browser under `krida.accounts.v1`. **Settings → Export JSON**
before you clear site data or move machines.

### Optional: sync through GitHub

Settings → *Sync with GitHub* mirrors the whole roster to one private Gist so
accounts follow the group between devices. **Pulling never opens anyone's
vault** — it merges opaque entries by id, newest `updatedAt` winning, so each
account is only ever written by the person who can decrypt it.

Create a [fine-grained personal access token](https://github.com/settings/tokens?type=beta)
whose **only** permission is *Gists: read and write*, and paste it in. It is kept
in this browser's localStorage and sent only to `api.github.com`. Leave the gist
id blank the first time and one is created for you.

A token in localStorage is readable by anything that can run script on this
origin. That is an acceptable trade for a small private group with a gist-only
token; if this ever opens to strangers, move to OAuth — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Language

The interface is English and Thai. Skill names stay in English in both, because
the workbook has no Thai column — adding a `nameTh` per skill in
`tools/build_skills.py` is all it takes to switch them on.

## Credit

Skill names, progressions and every video link come from
*The Calisthenics Skill Tree* workbook in `source/`. Videos are embedded from
their original creators — Calisthenicmovement, FitnessFAQs, Artem Morozov,
Calimnastic and others, credited on each skill page.
