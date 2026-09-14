# Deploying MindGuard

The 404 on signup happens because **Vercel only serves the frontend**. The
build output is `web/dist` — a static site with no `/api` route — so
`POST /api/auth/register` hits nothing. You need the Django API deployed and
the frontend pointed at it.

---

## 1. Deploy the API to Render

`render.yaml` is already configured. Create a Blueprint from this repo, then
set the variables Render prompts for (`sync: false` in the blueprint).

| Variable | Value | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | long random string | `python -c "import secrets;print(secrets.token_urlsafe(50))"` |
| `ALLOWED_HOSTS` | `your-api.onrender.com` | Host only — no `https://`, no path |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Used to build verification links |
| `CORS_ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Scheme included, **no trailing slash** |
| `DATABASE_URL` | Render Postgres internal URL | **Do not skip** — see below |
| `EMAIL_HOST_USER` | Brevo SMTP login | See §3 |
| `EMAIL_HOST_PASSWORD` | Brevo `xsmtpsib-…` key | Paste in the Render UI only |
| `DEFAULT_FROM_EMAIL` | a Brevo-verified sender address | |
| `OPENAI_API_KEY` | *(optional)* | Without it, text analysis uses the heuristic path |

> **`DATABASE_URL` is not optional in practice.** Without it, Django falls back
> to SQLite on Render's ephemeral disk and **every account is destroyed on each
> redeploy or cold start.** Create a Render Postgres instance and use its
> internal connection string.

Check it came up:

```bash
curl https://your-api.onrender.com/health
# {"status":"ok","service":"mindguard-django-api","version":"1.1.0"}
```

> Render's free tier sleeps after inactivity. The first request can take ~50s,
> which will trip the client's 7s timeout. Hit `/health` once to wake it before
> a demo.

---

## 2. Point the frontend at the API

### Option A — Vercel rewrite (recommended)

Same-origin, so CORS never comes up. Add to `vercel.json`, replacing the host:

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://your-api.onrender.com/api/:path*" },
  { "source": "/verify-email", "destination": "/index.html" },
  { "source": "/reset-password", "destination": "/index.html" }
]
```

Leave `VITE_API_URL` unset — the app already defaults to `/api` in production.

### Option B — environment variable

Set `VITE_API_URL=https://your-api.onrender.com/api` in Vercel, then
**redeploy**. Vite inlines env vars at build time, so changing it without a
rebuild has no effect. This path is cross-origin, so `CORS_ALLOWED_ORIGINS`
must match your Vercel domain exactly.

---

## 3. Email via Brevo

Signup sends a verification link, and `login` returns **403 until the account is
verified** — so if mail does not work, nobody can log in.

Brevo's two credentials are easy to mix up. From **Brevo → SMTP & API → SMTP**:

- **`EMAIL_HOST_USER`** is the *Login* field, formatted like
  `9a1b2c001@smtp-brevo.com`. **It is not your Brevo account email.**
- **`EMAIL_HOST_PASSWORD`** is the `xsmtpsib-…` **SMTP key**. An `xkeysib-…`
  value is the REST API key and will not authenticate over SMTP.

`DEFAULT_FROM_EMAIL` must be an address you have verified as a sender in Brevo,
otherwise Brevo accepts the connection and then rejects the message.

### Diagnosing it

Run this on the deployment (Render → Shell), not locally — the point is to test
the credentials the server actually has:

```bash
python manage.py checkemail                       # config + connection test
python manage.py checkemail --to you@example.com  # send a real message
```

It prints the active configuration (never the key itself), flags common
mistakes, and reports the exact SMTP error. `535 Authentication failed` almost
always means `EMAIL_HOST_USER` is wrong.

### If email cannot be made to work in time

Set `DEMO_AUTO_VERIFY=true`. New accounts are marked verified on creation and
can log in immediately.

> This lets anyone register an address they do not control. It is a demo
> escape hatch, not a production setting — `checkemail` warns when it is on
> with `DEBUG=false`.

---

## 4. Verify end to end

```bash
API=https://your-api.onrender.com

curl -s $API/health

curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"firstName":"Test","lastName":"User","email":"you@example.com",
       "password":"strongpass123","passwordConfirm":"strongpass123","agreeToTerms":true}'
```

Expected responses:

| Response | Meaning |
|---|---|
| `{"message":"Account created. Check your email…"}` | Working. |
| `{"emailDelivered":false,…}` | Account created, SMTP is broken. Run `checkemail`. |
| `{"autoVerified":true}` | `DEMO_AUTO_VERIFY` is on. |
| CORS error in the browser | `CORS_ALLOWED_ORIGINS` does not match your Vercel origin exactly. |
| Still 404 | The rewrite or `VITE_API_URL` is not live — redeploy the frontend. |

---

## 5. Secret hygiene

No credential belongs in this repo. `.env` is gitignored; `.env.example` holds
placeholders only. Set real values in the Render and Vercel dashboards.

**If a key is ever pasted into a chat, a screenshot, a commit, or a shared doc,
treat it as public and rotate it** — in Brevo: SMTP & API → generate a new SMTP
key, then delete the old one.
