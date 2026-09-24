# KRIDA auth Worker

The backend a static site cannot be: username/password accounts, sessions,
per-user training profiles, and password reset by email — with an owner/admin
who can manage everyone's resets. It runs on Cloudflare's free tier.

One Worker, one environment. No separate staging and production.

## What it does

| Route | Who | Purpose |
| --- | --- | --- |
| `POST /api/signup` | anyone (until seats full) | create an account; first account is the owner/admin |
| `POST /api/login` | anyone | sign in, get a session token |
| `GET /api/me` · `POST /api/logout` | signed in | restore session / end it |
| `PUT /api/profile` | signed in | save training progress |
| `PUT /api/password` | signed in | change own password |
| `POST /api/reset/request` | anyone | email a reset link (always answers the same, so it can't probe who has an account) |
| `POST /api/reset/confirm` | anyone with a valid token | set a new password |
| `GET /api/admin/users` | admin | list members |
| `POST /api/admin/reset` | admin | email a member a reset link |
| `POST /api/admin/set-password` | admin | set a member's password directly |
| `DELETE /api/admin/user` | admin | remove a member |

Passwords are PBKDF2-SHA256 (100k iterations, the Workers cap) with a per-user salt. Sessions and
reset tokens are random opaque strings with a TTL, stored server-side, so they
are revocable and never guessable. Data lives in one Cloudflare KV namespace.

## Deploy (about 10 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and a
free [Resend account](https://resend.com) for the reset emails.

```bash
cd worker
npm install -g wrangler      # or: npx wrangler ...
wrangler login               # opens the browser once
```

**1. Create the KV namespace** and paste the id it prints into `wrangler.toml`
(the `kv_namespaces` id field):

```bash
wrangler kv namespace create KV
```

**2. Set the email secret** (from resend.com → API Keys):

```bash
wrangler secret put RESEND_API_KEY
```

**3. Check the `[vars]` in `wrangler.toml`:**

- `SITE_URL` — your published site, used to build reset links. Default is the
  GitHub Pages URL; change it if yours differs.
- `ALLOW_ORIGIN` — the origin the browser calls from (e.g. `https://sirpuech.github.io`).
- `RESET_FROM` — until you verify your own domain in Resend, leave the default
  `onboarding@resend.dev`; it can only email your own Resend account address,
  which is fine for testing. To email anyone, verify a domain in Resend and set
  this to an address on it.
- `SEAT_LIMIT` — how many accounts may exist (default 5).

Optional: `wrangler secret put ADMIN_USERNAME` pins who the admin is. If you skip
it, the **first account created becomes the admin** — so create yours first.

**4. Deploy:**

```bash
wrangler deploy
```

It prints a URL like `https://krida-auth.<you>.workers.dev`.

**5. Point the site at it.** Put that URL in `data/config.json`:

```json
{ "apiBase": "https://krida-auth.<you>.workers.dev" }
```

Commit and push — the site picks it up on the next deploy. Until `apiBase` is
set, the site runs guest-only and says so on the Settings page.

## Notes

- The site works fully as a guest with no Worker at all. Accounts are the only
  thing that needs it.
- No password reset can recover the old password — reset sets a new one. That is
  by design; the server never stores a recoverable password.
- To test the whole thing locally without deploying: `wrangler dev` runs it on
  `http://localhost:8787` with a local KV, and you can temporarily point
  `data/config.json` there.
