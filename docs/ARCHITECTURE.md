# Architecture

## The constraint that shapes everything

The whole product runs on GitHub and nothing else: Pages serves it, Actions
build it. A small Cloudflare Worker holds accounts and their data. There
is no server to pay for, patch or keep awake.

That rules out a database, sessions and any server-side rendering, so the design
question becomes: *how far can this go on static hosting before something has to
give?* The answer is further than it looks, and the three phases below are
staged so the server arrives only when a requirement — emailed reset, an admin —
actually forces it, not before.

## Phase 1 — personal, now

```
  browser
    ├── index.html + js/ + assets/   ← GitHub Pages (static)
    ├── data/skills.json             ← generated at build time from the workbook
    └── localStorage                 ← your profile
```

- Hash routing (`#/tree`, `#/skill/push-up`). Every URL resolves to
  `index.html`, so Pages needs no rewrite rules and the site works from any
  subpath.
- All fetches are relative to `import.meta.url`, so a project page
  (`/krida-calisthenics-journey/`) works the same as a user page.
- The profile is one JSON object. `js/store/schema.js` versions it and migrates
  forward, so a stored profile from today survives every later change.

### The seam that phase 2 hangs off

Views never touch storage. They read `store.profile`, call a mutator, and
re-render on the `change` event:

```js
store.logSet(skill.id, { sets: 3, amount: 12, type: 'reps' });
```

Under `store` sits an *adapter*, and an adapter is only four methods:

```js
{ id, label, isConfigured(), load() -> profile|null, save(profile) }
```

`js/store/local.js` implements it against localStorage. `js/store/gist.js`
implements the same four methods against the GitHub Gists API. Swapping or
adding a backend touches neither the views nor the unlock engine.

`js/coach.js` sits on the same principle: it holds the resolution logic but no
coaching judgement. Splits, session structure and every set/rep prescription
live in `data/programs.json`, so a coach retunes the product by editing JSON and
a developer is not in the loop. The file names no skills — blocks describe what
to select and the resolver matches that against the athlete's unlock state,
which is what keeps a template valid as someone progresses through the tree.

`js/progress.js` is deliberately pure — every function takes
`(catalogue, profile)` and returns a value. That is what makes phase 3 cheap: an
XP total or a streak can be computed on a CI runner, from a stored profile, with
no browser in sight.

### Fields that do nothing yet, on purpose

`profile.id`, `profile.name` and `profile.visibility` are written from day one.
They are inert with a single local profile, but they are exactly the columns a
multi-user store and a leaderboard need — writing them now avoids migrating
every existing profile later.

## Phase 2 — accounts (built)

Up to five username/password accounts, backed by a Cloudflare Worker
(`worker/`). Guest mode stays entirely local; accounts are the only thing that
needs the server.

The earlier plan tried to avoid a server by encrypting each profile under its
own passphrase. That model shipped and then met a wall this phase's requirements
put in front of it: **emailed password reset, and an admin who can reset other
people's passwords.** Both are impossible under passphrase-encryption — if a
reset could recover your data, so could anyone who triggered one; and there is
no server to send an email or to hold an admin's authority. Those requirements
*are* a server, so this phase adds the smallest honest one.

```
browser (Pages, static)                    Cloudflare Worker (free)
  guest   → localStorage                     POST /signup /login /logout
  account → bearer token ───────────────▶    GET  /me         PUT /profile
            js/store/api.js                   POST /reset/request /reset/confirm
                                              GET/POST/DELETE /admin/*
                                                     │
                                              Cloudflare KV  (users, sessions, resets)
                                              Resend         (reset emails)
```

- Passwords: PBKDF2-SHA256, 210k iterations, per-user salt, verified and hashed
  only on the Worker. The client never sees a hash.
- Sessions and reset tokens are random opaque strings with a KV TTL — revocable,
  and unguessable, unlike a passphrase.
- Reset is deliberately recovery-*less*: it sets a new password. The server
  stores nothing that reveals the old one.
- Admin is the first account created, or whoever `ADMIN_USERNAME` names. The
  admin routes are gated on it server-side, not in the UI.

The store contract held again: `js/store/index.js` grew an `account` mode beside
`guest`, both behind the same `store.profile` + mutators the views already used.
`js/store/api.js` is the whole client; the passphrase-vault files
(`accounts.js`, `gist.js`, `crypto.js`) were retired.

One environment, one Worker, one KV namespace — no staging/production split.

## Phase 3 — leaderboard

**Trigger:** enough people use it that comparing is interesting.

Ranking needs to read everyone's numbers, which is the one thing a purely
client-side design cannot do. It does not need a server either — a scheduled
Action can do the aggregation:

```
 .github/workflows/leaderboard.yml   (nightly)
   1. read the opted-in profile Gists           (visibility === 'public')
   2. compute xp / streak / cleared per person  (reuse js/progress.js)
   3. write data/leaderboard.json               (name, xp, streak, tier only)
   4. commit — Pages redeploys
```

The leaderboard is then a static file the site fetches like any other. It is a
day stale, which for a training leaderboard is fine.

Consent is already modelled and already wired: `profile.visibility` defaults to
`'private'`, Settings exposes the toggle, and `accounts.saveProfile()` writes a
plaintext `public: { name, xp, streak, tier, cleared }` **only** for accounts
that opted in — everything else stays sealed. `accounts.publicBoard()` already
returns exactly the ranked slice a leaderboard would render.

So phase 3 is now small: point a scheduled Action at the shared roster Gist,
read the `public` entries (no passphrase needed — that is why they are in the
clear), and commit `data/leaderboard.json`. Nothing about the encryption has to
be unpicked to make ranking work.

## Why not just use a backend

A Supabase or Firebase project would make phases 2 and 3 an afternoon each. It
would also add an account to keep alive, a bill, a free tier that changes terms,
and a second place where the data lives. For a personal training log that is a
bad trade. If this ever needs real-time features, per-set social feeds or more
than a few hundred users, revisit it — the adapter seam means the migration is a
new file in `js/store/`, not a rewrite.

## The three data files

Only one of them is generated, and the split is deliberate:

| File | Authored by | Changes when |
| --- | --- | --- |
| `data/skills.json` | `tools/build_skills.py` | the workbook changes |
| `data/programs.json` | a coach, by hand | the programming philosophy changes |
| `data/exercise-guide.json` | `tools/build_guide.py` | the archetype rules or how-to cues change |

Keeping them apart is what lets a coach retune every session without touching
code, and lets the catalogue be regenerated without losing curation. A rebuild
overwrites `skills.json` completely — so anything a human decided has to live in
one of the other two, or in the tables at the top of `build_skills.py`.

```
source/skill-tree.xlsx
    │  tools/build_skills.py   (sheet, drawn arrows, cell geometry)
    ▼
data/skills.json  ──┬─▶ tools/build_guide.py  ──▶ data/exercise-guide.json
                    │                              (archetype + how-to per skill)
                    ├─▶ tools/check_data.py  ──▶ Pages deploy
data/programs.json ─┘      reachability, cycles, tier monotonicity,
                           template + prescription + guide integrity
```

CI regenerates `data/skills.json` and fails if it differs from what is committed,
so the generated file can never drift from the workbook it claims to come from.

The exercise animations carry no external dependency: the figure and its poses
are code (`js/exercise/`), and `exercise-guide.json` is generated and checked in
CI like the catalogue. There are no third-party links to rot, which is why the
old video pipeline — and the by-hand link checker it needed — was removed.

## The tree diagram

`js/treegraph.js` is pure geometry — tier on the x axis, barycentre sweeps to
order rows, cubic beziers for edges. It knows nothing about status or progress.
`js/views/tree.js` colours what the layout produces.

That split is why the same layout can serve one branch (15 nodes) and the whole
catalogue (111 nodes, 105 edges) without special cases, and why hover
highlighting is a class toggle over an existing DOM rather than a re-render.
