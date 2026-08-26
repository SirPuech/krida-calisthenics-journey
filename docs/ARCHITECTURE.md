# Architecture

## The constraint that shapes everything

The whole product runs on GitHub and nothing else: Pages serves it, Actions
build it, and — later — Gists and a Gist-derived JSON file store the data. There
is no server to pay for, patch or keep awake.

That rules out a database, sessions and any server-side rendering, so the design
question becomes: *how far can this go on static hosting before something has to
give?* The answer is further than it looks, and the three phases below are
staged so that the thing that eventually gives — the OAuth secret — is the last
piece added, not the first.

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

Five accounts share one deployment, each sealed with its own passphrase.

The design question was how to authenticate with no server. Real GitHub OAuth
was the obvious answer and was rejected for this stage: the web flow needs a
client secret a static site cannot hold, and GitHub's device-flow endpoints send
no CORS headers, so a browser cannot call them directly either. Both roads lead
to running a proxy — a real dependency for what is currently a private group of
five, several of whom would need to create GitHub accounts first.

So authentication is **passphrase-derived encryption** instead of a login check:

```
passphrase ──PBKDF2(250k, SHA-256)──▶ AES-GCM key ──▶ sealed vault
                                                       │
roster (plaintext)      ────────────────────────────────┤
  id, name, createdAt, updatedAt                        │
  public: { xp, streak, tier, cleared } | null   ◀───────┘ opt-in only
```

Signing in *is* decryption. There is no "check the password and then trust the
client" step to bypass, because the ciphertext genuinely cannot be read without
the key. AES-GCM authenticates, so a wrong passphrase fails to decrypt rather
than returning garbage — that is what makes `WRONG_PASSPHRASE` a real signal.

What it does not do: there is no server, so nothing stops a visitor creating an
account while seats remain, or reading the roster's *names*. This is the right
trade for a private group and the wrong one for a public product.

The store's contract did not change. Views still read `store.profile` and call
mutators; `store.update()` now seals in the background after emitting, so the UI
stays synchronous over an inherently async crypto call.

### If this outgrows five people

Swap the vault for OAuth. `js/store/accounts.js` is the only file that knows how
a profile is unlocked — `signIn`, `saveProfile` and the roster merge are the
seam. A `js/store/github.js` implementing the same calls against an OAuth token
leaves every view and `js/progress.js` untouched. The proxy (Cloudflare Worker,
~30 lines, holds the client secret) becomes worth its cost at that point.

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
| `data/videos-curated.json` | a human, by hand | a link dies or a better tutorial turns up |

Keeping them apart is what lets a coach retune every session without touching
code, and lets the catalogue be regenerated without losing curation. A rebuild
overwrites `skills.json` completely — so anything a human decided has to live in
one of the other two, or in the tables at the top of `build_skills.py`.

```
source/skill-tree.xlsx
    │  tools/build_skills.py   (sheet, drawn arrows, cell geometry)
    │                          + videos-curated.json  (fills gaps, strips dead links)
    ▼
data/skills.json  ──┬─▶ tools/check_data.py  ──▶ Pages deploy
                    │      reachability, cycles, tier monotonicity,
data/programs.json ─┘      template + prescription + curated-video integrity
```

CI regenerates `data/skills.json` and fails if it differs from what is committed,
so the generated file can never drift from the workbook it claims to come from.

`tools/verify_videos.py` sits deliberately **outside** this pipeline. It needs
network and it checks third-party links, which rot on their own schedule; a
video going private should not be able to fail a deploy. It is a maintenance
tool, run by hand, and `check_data.py` covers the structural half in CI instead.

## The tree diagram

`js/treegraph.js` is pure geometry — tier on the x axis, barycentre sweeps to
order rows, cubic beziers for edges. It knows nothing about status or progress.
`js/views/tree.js` colours what the layout produces.

That split is why the same layout can serve one branch (15 nodes) and the whole
catalogue (111 nodes, 105 edges) without special cases, and why hover
highlighting is a class toggle over an existing DOM rather than a re-render.
