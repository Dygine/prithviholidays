# Deploying Prithvi Holidays

Follow this once. About 20 minutes, all of it free.

The site runs in two modes and works out which one it is in by itself:

| | Browser-only mode | Automatic mode |
|---|---|---|
| Setup | none | four settings |
| Passcode checked | in the browser | on the server |
| Pressing **Publish** | downloads a ZIP you upload yourself | updates the website by itself |
| Time to go live | however long you take | 30–60 seconds |

Right now it is in **browser-only mode**, and everything works. This guide
switches on automatic mode so the client can update the site alone.

---

## Why any of this is needed

A browser can **read** files from a server. A browser can **never write**
files to a server — that rule exists in every browser ever made.

So when the client presses Publish, something on the server side has to write
the change down. There is no PHP here, so a **Cloudflare Worker** asks
**GitHub** to save the files. GitHub asks "prove you are allowed", and that
proof is a **token**, which has to live somewhere the public cannot read it.
That place is an **environment variable**.

Every bit of the setup below comes from that one rule.

---

## Step 1 — Change the passcode

Do this first, before the code is anywhere public.

```bash
cd prithvi-holidays
python3 tools/set-passcode.py
```

Type a passcode twice. It writes a salted hash to `data/admin.json`. The
passcode itself is never saved and cannot be recovered from that file.

---

## Step 2 — Put it on GitHub

```bash
git init
git add .
git commit -m "Prithvi Holidays"
git branch -M main
git remote add origin https://github.com/YOURNAME/prithvi-holidays.git
git push -u origin main
```

Nothing below works until the code is on GitHub, because publishing works by
writing a commit to that repository.

Make the repository **private** if you prefer. Cloudflare can still read it.

---

## Step 3 — Create the GitHub token

This is the key that lets the website save its own content.

1. GitHub → your avatar → **Settings**
2. Bottom of the left menu → **Developer settings**
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
4. Fill in:
   - **Token name**: `prithvi-holidays-publish`
   - **Expiration**: 1 year (put a reminder in your calendar)
   - **Repository access**: *Only select repositories* → pick `prithvi-holidays`
   - **Permissions** → *Repository permissions* → **Contents** → **Read and write**

   Contents is the only permission it needs. Do not grant others.
5. **Generate token**, then **copy it immediately** — GitHub shows it once.

---

## Step 4 — Deploy to Cloudflare

Cloudflare Pages allows commercial sites on the free plan. Vercel's free
Hobby plan does not — it is for personal projects only, so a client business
site on Hobby is against their terms even though it would work.

1. <https://dash.cloudflare.com> → **Compute (Workers)** → **Workers & Pages**
2. **Create** → **Pages** → **Connect to Git**
3. Pick the `prithvi-holidays` repository
4. Build settings:
   - **Framework preset**: `None`
   - **Build command**: *leave empty*
   - **Build output directory**: `/`
5. **Save and Deploy**

You get a `something.pages.dev` address in about a minute. The site is live.
The admin is at `something.pages.dev/admin/` and works in browser-only mode.

---

## Step 5 — The four settings

In your new project → **Settings** → **Variables and secrets**.

Add these four. Use type **Secret** for the token and the password, and
**Text** for the other two.

| Name | Type | Value |
|---|---|---|
| `GITHUB_TOKEN` | Secret | the token from step 3 |
| `GITHUB_REPO` | Text | `YOURNAME/prithvi-holidays` |
| `GITHUB_BRANCH` | Text | `main` |
| `ADMIN_PASSWORD` | Secret | the passcode for the client |

`GITHUB_REPO` is `owner/repository` — no `https://`, no `.git`.

Then **Deployments** → **Retry deployment**, so the new settings are picked
up. Environment variables are read at start-up; without the redeploy the site
carries on in browser-only mode and you will think it failed.

---

## Step 6 — Check it worked

Open `/admin/` and sign in.

- Bottom-left should say **Publishing to YOURNAME/prithvi-holidays**
- Change something small, press **Publish**
- Watch GitHub — a new commit should appear within seconds
- Cloudflare rebuilds, and the change is live in under a minute

If it still says *Local draft only*, the variables did not take. Re-check the
spelling and redeploy.

---

## Step 7 — Point the domain

Your domain is registered at Hostinger. Cloudflare needs to run its DNS.

1. Cloudflare → **Add a domain** → `prithviholidays.com` → **Free** plan
2. Cloudflare scans your existing records and shows you two nameservers
3. Hostinger → **Domains** → **DNS / Nameservers** → *Change nameservers* →
   *Use custom nameservers* → paste both Cloudflare ones
4. Wait. Usually under an hour, occasionally up to 24
5. Back in Cloudflare → your Pages project → **Custom domains** → add
   `prithviholidays.com` and `www.prithviholidays.com`

HTTPS is issued automatically and free.

**Before you switch nameservers**, check whether any email uses this domain.
If it does, copy the MX records across into Cloudflare's DNS first, or the
email stops. If the domain has no email on it, there is nothing to worry
about.

---

## Step 8 — Tell search engines

Once the domain is live:

```bash
python3 tools/build-seo.py
```

That rewrites `sitemap.xml` and `robots.txt` from the real content. Commit
and push. Then submit `https://prithviholidays.com/sitemap.xml` in Google
Search Console.

Re-run it whenever packages are added or removed.

---

## When something breaks

**The admin says "Local draft only" after step 5.**
The variables are not reaching the Worker. Check spelling exactly, confirm
they are on the right project, and redeploy. Nothing is read until a deploy.

**Publish says "That passcode is not right".**
`ADMIN_PASSWORD` differs from what was typed. Watch for a trailing space when
pasting into Cloudflare.

**Publish fails with 401 or 403.**
The token has expired, or it lacks **Contents: Read and write**, or
`GITHUB_REPO` is wrong. Regenerate the token and update the secret.

**Publish fails with 404.**
`GITHUB_REPO` is wrong. It must be `owner/repository`, nothing else.

**Photos do not appear after publishing.**
Check the commit on GitHub actually contains files under `uploads/`. If it
does, the rebuild may still be running — give it a minute.

**The site loads but every page is blank.**
The `data/` folder did not deploy. Confirm the build output directory is `/`
and that `data/*.json` is in the repository.

**Opening index.html by double-clicking shows an error.**
That is correct. The pages fetch their content, and browsers block that from
`file://`. Use `python -m http.server 8000` and open `http://localhost:8000`.

---

## Costs

| | |
|---|---|
| Cloudflare Pages | free, commercial use allowed |
| GitHub | free |
| Domain | you already own it |
| **Total** | **₹0 per year** |
