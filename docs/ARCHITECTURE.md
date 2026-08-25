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

`js/progress.js` is deliberately pure — every function takes
`(catalogue, profile)` and returns a value. That is what makes phase 3 cheap: an
XP total or a streak can be computed on a CI runner, from a stored profile, with
no browser in sight.

### Fields that do nothing yet, on purpose

`profile.id`, `profile.name` and `profile.visibility` are written from day one.
They are inert with a single local profile, but they are exactly the columns a
multi-user store and a leaderboard need — writing them now avoids migrating
every existing profile later.

## Phase 2 — accounts

**Trigger:** more than one person wants to use it.

Sign in with GitHub, each person's progress in a Gist their own account owns.
Nobody's data sits in this repo, and there is no database to run.

The obstacle is that GitHub's OAuth web flow needs a client secret to exchange
the code for a token, and a static site cannot hold a secret. Two ways out:

1. **A one-function proxy** (Cloudflare Worker or Vercel function) that does the
   code-for-token exchange and nothing else. ~30 lines, free tier, the only
   non-GitHub piece in the stack.
2. **A GitHub App using the device flow**, which needs no secret in the client.
   The user types a code on github.com. No proxy at all, slightly clumsier
   sign-in.

Option 2 keeps the "GitHub and nothing else" property; option 1 is the nicer
sign-in. Either way the work in this repo is the same:

- a `js/store/github.js` adapter — the same four methods, token from OAuth
  rather than pasted into Settings
- an auth state in `store`, and a sign-in screen
- `profile.id` becomes the GitHub login instead of `'local'`

Nothing in `js/views/` or `js/progress.js` changes.

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

Consent is already modelled: `profile.visibility` defaults to `'private'` and
Settings exposes the toggle. The aggregator reads nothing from a profile that
has not opted in, and publishes only the four fields above — never logs, never
dates.

The registry of which Gists to read is the one piece still to design. The
cheapest version is a `profiles.json` in this repo that sign-up appends to via
the API; the tidier version is a GitHub App that can enumerate installations.

## Why not just use a backend

A Supabase or Firebase project would make phases 2 and 3 an afternoon each. It
would also add an account to keep alive, a bill, a free tier that changes terms,
and a second place where the data lives. For a personal training log that is a
bad trade. If this ever needs real-time features, per-set social feeds or more
than a few hundred users, revisit it — the adapter seam means the migration is a
new file in `js/store/`, not a rewrite.

## Build pipeline

```
source/skill-tree.xlsx
    │  tools/build_skills.py     (parses the sheet, its arrows and its geometry)
    ▼
data/skills.json  ──▶ tools/check_data.py  ──▶ Pages deploy
                       reachability, cycles,
                       tier monotonicity
```

CI regenerates `data/skills.json` and fails if it differs from what is committed,
so the generated file can never drift from the workbook it claims to come from.
