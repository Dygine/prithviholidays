# Prithvi Holidays — travel website with an admin panel

The same Prithvi Holidays website as before, with one architectural change: every
piece of content now comes from JSON files in `data/`, and a full admin panel at
`/admin/` edits them.

Nothing about the public design changed. Same colours, fonts, hero carousel,
cards, animations, page structure and URLs. What changed is where the words and
photographs come from.

```
BEFORE                          AFTER
HTML                            data/*.json
 └── hardcoded content           └── js/core.js      (load + cache)
                                     └── js/render.js  (build markup)
                                         └── js/pages.js (per page)
                                             └── the same HTML + CSS
```

No PHP. No database. No build step. No framework. Plain HTML, CSS, vanilla
JavaScript and JSON.

---

## Running it locally

The pages fetch their content, and browsers block `fetch` when a page is opened
directly from disk. So it needs a local web server — any one will do:

```bash
cd prithvi-holidays
python -m http.server 8000
```

Then open:

| What        | Where                              |
| ----------- | ---------------------------------- |
| The website | <http://localhost:8000/>           |
| The admin   | <http://localhost:8000/admin/>     |

The admin asks for a passcode — see **Signing in** below.

If you open `index.html` by double-clicking it, the site tells you this instead
of showing a blank page.

**Optional** — to test the *publish* button locally you need something that can
answer `POST`, which `http.server` cannot. Use the included Node server:

```bash
GITHUB_TOKEN=github_pat_xxx \
GITHUB_REPO=you/prithvi-holidays \
ADMIN_PASSWORD=a-long-password \
node dev-server.mjs
```

---

## File structure

```
prithvi-holidays/
│
├── index.html                  home
├── destinations.html           all destinations, filterable
├── destination-details.html    ?id=dst-hampi-ruins
├── packages.html               all packages, filterable
├── package-details.html        ?id=classic-kerala-loop
├── adventures.html
├── about.html
├── contact.html                enquiry form + FAQs
│
├── css/
│   └── style.css               ORIGINAL stylesheet + a marked CMS section
│
├── js/
│   ├── core.js                 data loading, caching, preview, lookups
│   ├── render.js               rebuilds the original markup from JSON
│   ├── pages.js                one controller per page
│   └── main.js                 loader, nav, reveal, counters (re-runnable)
│
├── images/                     the original photographs, untouched
├── uploads/                    drop NEW photographs here
│
├── data/
│   ├── settings.json           business info, hero, all page copy, SEO
│   ├── masters.json            states, trip styles, travel styles, statuses
│   ├── destinations.json       32 places
│   ├── packages.json           10 packages with full itineraries
│   ├── adventures.json         6 experience categories
│   ├── testimonials.json       5 reviews
│   ├── gallery.json            8 images
│   ├── faqs.json               8 questions
│   ├── enquiries.json          contact form inbox
│   ├── media.json              image list for the admin picker
│   └── admin.json              hashed admin passcode (not the passcode)
│
├── admin/
│   ├── index.html              sign in
│   ├── dashboard.html
│   ├── settings.html           business, hero, home copy, stats, SEO
│   ├── destinations.html  destination-editor.html
│   ├── packages.html      package-editor.html
│   ├── adventures.html    testimonials.html
│   ├── gallery.html       faqs.html
│   ├── enquiries.html     masters.html
│   ├── css/admin.css
│   └── js/
│       ├── store.js            the only thing that touches data
│       ├── ui.js               modals, toasts, validation, media picker
│       └── admin.js            one controller per screen
│
├── api/site.mjs                Vercel publishing endpoint
├── functions/api/site.js       Cloudflare Pages publishing endpoint
├── lib/github.mjs              the publishing core (server-side only)
├── dev-server.mjs              local server that can answer POST
└── tools/
    ├── scan-media.py           rebuild data/media.json
    └── set-passcode.py         change the admin passcode
```

---

## Using the admin

### Adding, editing and deleting a package

1. **Packages → New package.** Give it a name, and optionally pick a destination
   and trip style. It opens straight into the editor.
2. The editor has seven tabs. Everything saves to your draft **as you type** —
   there is no separate save button:

   | Tab            | What lives there                                        |
   | -------------- | ------------------------------------------------------- |
   | **Basic**      | name, destination, trip style, duration, group size, descriptions |
   | **Media**      | main photograph and gallery                             |
   | **Pricing**    | price, "was" price, seats — or the enquire-only note     |
   | **Highlights** | the selling points, drag to reorder                      |
   | **Inclusions** | what is and is not included                              |
   | **Itinerary**  | day builder — add, duplicate, delete, drag to reorder    |
   | **Publishing** | published, featured, the web address, delete             |

3. **Check fields** in the top bar validates every tab at once and jumps to the
   first problem, so a missing required field on a tab you are not looking at
   cannot hide from you.
4. **Deleting**: Publishing tab → *Delete this package*, or the bin icon in the
   list. Both ask first, and both only touch your draft.

Days renumber themselves when you reorder or delete one.

### Changing hero images

**Settings → Home hero.** The carousel is entirely driven by
`settings.hero.images`:

- **Add** — *Add a photograph*, then pick from the grid or paste a path
- **Remove** — the bin on any tile
- **Reorder** — drag the tiles; the one marked **First** is what loads first
- **Replace** — remove and add

The frontend keeps the fade, the Ken Burns zoom, the thumbnail dots, the arrows
and the responsive behaviour exactly as they were. With a single image the
arrows and dots hide themselves, because controls that do nothing are worse than
no controls.

### Photographs

There is no upload button, and that is deliberate — a browser cannot write files
to a deployed static host, so an upload button would be a lie.

Instead:

1. Copy new photographs into `uploads/`
2. Run `python tools/scan-media.py` so the picker knows about them
3. Pick them anywhere in the admin, or type the path directly

You can also paste a full URL to an image hosted anywhere. JSON only ever stores
the **path** — never base64, so the data files stay small and fast.

---

---

## Signing in

The admin is behind a passcode. The one shipped with this build is:

```
Prithvi-lrlt73-9845
```

**Change it before you deploy:**

```bash
python3 tools/set-passcode.py
```

That writes a salted **PBKDF2-SHA256** hash (310,000 iterations) to
`data/admin.json`. Your passcode itself is never stored and cannot be
recovered from that file — if you forget it, run the tool again.

A session lasts 12 hours or until you close the tab, whichever comes first.
Five wrong attempts start a cooldown that doubles with each further failure.

### How strong this actually is

Two different gates, depending on how you deploy:

| Deployment | Gate | Strength |
| ---------- | ---- | -------- |
| With the serverless function + `ADMIN_PASSWORD` | checked **on the server** | real |
| Static hosting only | checked in the browser against the hash | a deterrent |

On static hosting the check happens in the browser, so someone who knows
their way around developer tools could step past it. That is a property of
static sites, not something this code can fix.

It matters less than it sounds, and it is worth being precise about why:
**getting past the gate only lets someone edit a draft in their own browser.**
It does not let them change your website. Publishing goes through the server,
which holds the GitHub token and checks `ADMIN_PASSWORD` separately. So the
worst case is a stranger rearranging content that only they can see.

If you want the admin genuinely locked down, deploy with the function and set
`ADMIN_PASSWORD`. Then the passcode is verified server-side and the local hash
is ignored entirely.

---

## Drafts, preview and publish

### Draft

Every edit writes to `localStorage` under `ph.draft.v1`, debounced so typing does
not thrash storage. The original JSON is untouched. The bar at the bottom of
every admin screen shows whether you have unpublished changes.

**Discard** throws the draft away and returns to the last published state, after
asking and telling you which files it affects.

Moving between admin screens is safe and does **not** prompt you. The draft is
already on disk, so a browser "Leave site? Changes you made may not be saved"
dialog would be both annoying and untrue. Instead any pending write is flushed
the moment the page is hidden, so even an edit typed a fraction of a second
before you navigate is kept. The only time you are warned is when the draft
genuinely could not be saved at all — a full storage quota, or private
browsing with storage disabled.

### Preview

**Preview** in the publish bar opens the real website at `?preview=1`. In preview
mode `core.js` reads the draft from `localStorage` instead of the published JSON,
so you see exactly what you are about to ship — same pages, same CSS, real
content. A bar at the bottom reminds you, with a one-click exit.

A normal visitor **never** sees a draft. Preview is only on when either:

- the URL carries `?preview=1`, or
- `localStorage.ph.preview === '1'` in that person's own browser

Neither can happen by accident, and neither survives to another visitor.

### Publish

The admin compares your working copy with what was loaded and sends **only the
files that actually changed** to `/api/site`. That endpoint validates the
request server-side and writes all the files to GitHub as **one commit**, which
triggers exactly one site rebuild instead of one per file.

If no publishing backend is deployed, the button says so honestly and offers
**Download JSON** instead — a ZIP of `data/` to unzip over your repository and
commit by hand. The result is identical, just manual.

---

## Deploying to production

The site is static, so any host works for the *website*. Publishing from the
admin needs a host that runs a serverless function. Both are included.

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "Prithvi Holidays"
git remote add origin git@github.com:you/prithvi-holidays.git
git push -u origin main
```

### 2. Connect Cloudflare Pages or Vercel

No build command. Output directory is the project root. Cloudflare picks up
`functions/api/site.js` automatically; Vercel picks up `api/site.mjs`.

### 3. Set four environment variables

| Variable         | What                                                    |
| ---------------- | ------------------------------------------------------- |
| `GITHUB_TOKEN`   | fine-grained PAT, **this repo only**, Contents: read+write |
| `GITHUB_REPO`    | `you/prithvi-holidays`                                  |
| `GITHUB_BRANCH`  | `main` (optional)                                       |
| `ADMIN_PASSWORD` | a long password                                         |

Redeploy. The admin now asks for that password and the publish button works.

### Security notes

- **The GitHub token never reaches the browser.** It exists only in the
  serverless function's environment. `lib/github.mjs` is the only file that
  touches it, and it runs on the server.
- **The password is checked server-side**, compared in constant time. Sign-in
  returns a signed token that expires after 12 hours; the password itself is not
  sent again. Changing the password invalidates every open session.
- **Only `data/*.json` and `uploads/*` can be written.** Path traversal and any
  attempt to write `index.html`, a script or a CI workflow is rejected.
- **Without `ADMIN_PASSWORD` set, the admin runs in local mode** and says so on
  the sign-in screen. It does not pretend a JavaScript password is security,
  because it would not be. Do not deploy publicly in this state.

---

## Enquiries — read this before going live

**A static website cannot write to its own files.** The contact form therefore
has two modes, and the difference matters:

| `settings.enquiry.endpoint` | What happens                                        |
| --------------------------- | --------------------------------------------------- |
| **empty** (default)         | the enquiry is saved in **that visitor's own browser** |
| **set to a URL**            | the enquiry is POSTed there as JSON, and you receive it |

With no endpoint, the admin inbox only shows enquiries submitted **in the same
browser you are using**. That is genuinely useful for local testing and demos,
and it is exactly why it is not enough for a live site: a real visitor's enquiry
would sit in their browser and never reach you.

Before going live, set an endpoint under **Settings → Enquiries**. Anything that
accepts a JSON `POST` works — Formspree, Basin, a Google Apps Script web app, or
your own serverless function. The admin shows a warning until you do.

---

## What a purely static frontend cannot do

Stated plainly, because these are the real limits:

1. **No file uploads from the browser.** Photographs go into `uploads/` by FTP,
   git or your host's dashboard, then `tools/scan-media.py` lists them.
2. **No enquiry storage without a backend.** See above.
3. **Browser-checked passcode without a backend.** The gate uses a salted
   PBKDF2-SHA256 hash rather than a plaintext password, but the comparison
   still happens in the browser, so it is a deterrent rather than a vault.
   Deploy with the serverless function and `ADMIN_PASSWORD` for a real one.
   Either way, publishing is protected server-side.
4. **Publishing needs a serverless function** or a manual commit. A browser
   cannot write to a deployed filesystem, and no amount of JavaScript changes
   that.
5. **One editor at a time.** Drafts live in one browser. Two people editing
   simultaneously will overwrite each other on publish.
6. **`localStorage` is roughly 5 MB.** Ample for this data, since images are
   paths rather than base64. The admin warns you if a save ever fails.
7. **Data files are public.** Anything in `data/` is readable by anyone who
   guesses the URL. Never put anything private in there — the enquiry inbox
   included, once a real endpoint is writing to it.

---

## Conventions worth knowing

- **A package's `id` is its URL.** `package-details.html?id=classic-kerala-loop`
  is what people share. Changing it under Publishing breaks links already out in
  the world, so the admin asks twice.
- **Filter options are generated from the data**, never hardcoded. Add a trip
  style under *Lists & Categories* and the chip appears on the packages page as
  soon as a package uses it.
- **`sort` controls order everywhere.** Drag rows in any admin list.
- **`published: false` hides a record everywhere** — grids, search, related
  lists, filter chips and detail pages.
- **Deleting is refused when something depends on it.** Deleting a destination
  used by packages, or a category used by a package, tells you what is using it
  instead of quietly orphaning records.
- **Migrated copy may contain HTML entities** (`&amp;`, `&middot;`) and the
  occasional `<br>`, because it came out of the original HTML. `render.js`
  preserves those and escapes everything else.
