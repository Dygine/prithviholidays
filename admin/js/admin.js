/* ==========================================================================
   PRITHVI HOLIDAYS — ADMIN CONTROLLERS
   One function per screen, dispatched from <body data-admin="…">.

     login        dashboard      settings
     destinations destination-editor
     packages     package-editor
     adventures   testimonials   gallery   faqs
     enquiries    masters

   Nothing here touches localStorage or fetch — that is the Store's job.
   Nothing here builds a modal or a toast by hand — that is AUI's.
   ========================================================================== */
(function () {
  'use strict';

  var qs = AUI.qs, qsa = AUI.qsa, el = AUI.el, esc = AUI.esc, icon = AUI.icon;
  var plain = AUI.plain, relTime = AUI.relTime, niceDate = AUI.niceDate;

  /* ══════════════════════════════════════════════════════════════════════
     Shared helpers
     ══════════════════════════════════════════════════════════════════ */

  /**
   * A list thumbnail. Resolves photos that are still only in this browser,
   * so something uploaded a moment ago appears in the list straight away
   * rather than as a broken image until publish.
   */
  function thumb(cls, value) {
    var im = el('img', {
      class: cls, alt: '', loading: 'lazy',
      onerror: function () { this.style.visibility = 'hidden'; }
    });
    if (value) { AUI.setImg(im, value); } else { im.style.visibility = 'hidden'; }
    return im;
  }

  /** Standard action buttons for a list row. */
  function rowActions(o) {
    var acts = el('div', { class: 'row-acts' });

    if (o.onUp) {
      acts.appendChild(el('button', {
        class: 'iact', type: 'button', title: 'Move up', 'aria-label': 'Move up',
        html: icon('up', 15), onclick: o.onUp
      }));
    }
    if (o.onDown) {
      acts.appendChild(el('button', {
        class: 'iact', type: 'button', title: 'Move down', 'aria-label': 'Move down',
        html: icon('down', 15), onclick: o.onDown
      }));
    }
    if (o.onToggle) {
      acts.appendChild(el('button', {
        class: 'iact', type: 'button',
        title: o.published ? 'Unpublish' : 'Publish',
        'aria-label': o.published ? 'Unpublish' : 'Publish',
        html: icon(o.published ? 'eyeOff' : 'eye', 15), onclick: o.onToggle
      }));
    }
    if (o.onDuplicate) {
      acts.appendChild(el('button', {
        class: 'iact', type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate',
        html: icon('copy', 15), onclick: o.onDuplicate
      }));
    }
    if (o.onEdit) {
      acts.appendChild(el('button', {
        class: 'iact', type: 'button', title: 'Edit', 'aria-label': 'Edit',
        html: icon('edit', 15), onclick: o.onEdit
      }));
    }
    if (o.onDelete) {
      acts.appendChild(el('button', {
        class: 'iact iact--danger', type: 'button', title: 'Delete', 'aria-label': 'Delete',
        html: icon('trash', 15), onclick: o.onDelete
      }));
    }
    return acts;
  }

  /**
   * Confirm-then-delete. Every destructive action in the admin goes
   * through here, so the wording and the "draft only" reassurance are
   * consistent — nothing is ever removed from the live site until publish.
   */
  function confirmDelete(what, name, extra) {
    return AUI.confirm({
      title: 'Delete ' + what + '?',
      bodyHtml: 'This removes <b>' + esc(plain(name) || 'this item') + '</b> from your working ' +
        'draft. The live website is not affected until you publish.' +
        (extra ? '<br><br>' + extra : ''),
      confirmLabel: 'Delete'
    });
  }

  /** A tiny debounced text filter over a list, shared by every manager. */
  function filterRows(list, q, keys) {
    var needle = String(q || '').trim().toLowerCase();
    if (!needle) { return list; }
    return list.filter(function (x) {
      return keys.map(function (k) { return plain(x[k] || ''); })
        .join(' ').toLowerCase().indexOf(needle) !== -1;
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     LOGIN
     ══════════════════════════════════════════════════════════════════ */

  function login() {
    var box = qs('[data-login]');

    /* Only ever bounce to a page inside the admin — never to whatever
       happens to be sitting in the ?next parameter. */
    function goNext() {
      var next = AUI.param('next') || 'dashboard.html';
      location.href = /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(next) ? next : 'dashboard.html';
    }

    Store.authMode().then(function (m) {
      /* Already signed in this tab — do not make them type it twice. */
      if (Store.isAuthed()) { goNext(); return; }

      /* No gate configured at all. Say so rather than implying a lock. */
      if (m.mode === 'open') {
        box.innerHTML =
          '<div class="notice notice--warn">' + icon('warn', 18) +
          '<div><b>No passcode is set</b>Anyone who can reach this page can edit the content. ' +
          'Run <code>python3 tools/set-passcode.py</code> to set one before putting this ' +
          'online.</div></div>' +
          '<button class="btn btn--primary btn--block" type="button" data-open>' +
          icon('dashboard', 16) + 'Open the admin</button>';
        qs('[data-open]', box).addEventListener('click', function () {
          Store.unlock('').then(goNext);
        });
        return;
      }

      box.innerHTML =
        '<div class="field"><label class="label" for="pw">Passcode</label>' +
        '<input class="input" id="pw" type="password" autocomplete="current-password" ' +
        'data-rules="required" data-label="A passcode"><div class="err"></div></div>' +
        '<button class="btn btn--primary btn--block" type="button" data-go>' +
        icon('lock', 16) + 'Unlock</button>' +
        '<div class="hint mt-2" data-mode></div>';

      qs('[data-mode]', box).innerHTML = m.mode === 'server'
        ? 'Checked on the server. This session lasts 12 hours.'
        : 'This session lasts 12 hours, or until you close the tab.';

      var pw = qs('#pw', box);
      var go = qs('[data-go]', box);
      var err = qs('.err', box);
      var tick = null;

      function showError(msg) {
        err.textContent = msg;
        err.classList.add('show');
        pw.setAttribute('aria-invalid', 'true');
      }

      /* While locked out, count down rather than leaving a dead button. */
      function paintLock() {
        var lk = Store.lockout();
        clearInterval(tick);
        if (!lk.locked) {
          go.classList.remove('is-busy');
          go.innerHTML = icon('lock', 16) + 'Unlock';
          pw.disabled = false;
          return;
        }
        pw.disabled = true;
        go.classList.add('is-busy');
        tick = setInterval(function () {
          var now = Store.lockout();
          if (!now.locked) { paintLock(); return; }
          go.textContent = 'Locked — ' + now.secondsLeft + 's';
        }, 250);
        go.textContent = 'Locked — ' + lk.secondsLeft + 's';
      }

      function submit() {
        if (Store.lockout().locked) { return; }
        if (AUI.validate(box).length) { return; }

        go.classList.add('is-busy');
        go.textContent = 'Checking…';
        err.classList.remove('show');

        Store.unlock(pw.value).then(goNext).catch(function (e) {
          go.classList.remove('is-busy');
          go.innerHTML = icon('lock', 16) + 'Unlock';
          showError(e.message);
          pw.select();
          paintLock();
        });
      }

      go.addEventListener('click', submit);
      pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { submit(); } });
      pw.addEventListener('input', function () {
        err.classList.remove('show');
        pw.setAttribute('aria-invalid', 'false');
      });

      paintLock();
      pw.focus();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     DASHBOARD
     ══════════════════════════════════════════════════════════════════ */

  function dashboard() {
    var pulled = Store.pullLocalEnquiries();
    if (pulled) {
      AUI.toast(pulled + ' new ' + (pulled === 1 ? 'enquiry' : 'enquiries'),
        'Collected from the contact form in this browser.');
    }

    var s = Store.stats();

    var TILES = [
      { n: s.destinations, l: 'Destinations', sub: s.publishedDestinations + ' published', href: 'destinations.html' },
      { n: s.packages, l: 'Packages', sub: s.publishedPackages + ' published', href: 'packages.html' },
      { n: s.draftPackages, l: 'Draft packages', sub: s.draftPackages ? 'not yet live' : 'all live', href: 'packages.html' },
      { n: s.adventures, l: 'Adventures', href: 'adventures.html' },
      { n: s.testimonials, l: 'Testimonials', href: 'testimonials.html' },
      { n: s.gallery, l: 'Gallery images', href: 'gallery.html' },
      { n: s.faqs, l: 'FAQs', href: 'faqs.html' },
      { n: s.enquiries, l: 'Enquiries', sub: s.newEnquiries ? s.newEnquiries + ' unread' : 'all read', href: 'enquiries.html' }
    ];

    qs('[data-stats]').innerHTML = TILES.map(function (t) {
      return '<a class="stat-tile" href="' + esc(t.href) + '"><b>' + t.n + '</b>' +
        '<span>' + esc(t.l) + '</span>' +
        (t.sub ? '<span class="sub">' + esc(t.sub) + '</span>' : '') + '</a>';
    }).join('');

    /* recently edited */
    var recent = Store.recentlyEdited(6);
    var host = qs('[data-recent]');
    if (!recent.length) {
      AUI.emptyState(host, 'edit', 'Nothing edited yet',
        'Once you start changing content it will show up here.');
    } else {
      host.innerHTML = '';
      var EDITOR = {
        packages: 'package-editor.html?id=',
        destinations: 'destination-editor.html?id='
      };
      recent.forEach(function (r) {
        var href = EDITOR[r.coll] ? EDITOR[r.coll] + encodeURIComponent(r.id) : r.coll + '.html';
        host.appendChild(el('a', {
          class: 'row-item', href: href, style: 'text-decoration:none;color:inherit'
        }, [
          el('div', { class: 'row-main', html:
            '<b>' + esc(plain(r.label)) + '</b>' +
            '<div class="meta"><span>' + esc(r.coll) + '</span>' +
            '<span class="dotsep">·</span><span>' + esc(relTime(r.updatedAt)) + '</span></div>'
          }),
          el('div', { class: 'row-acts', html: AUI.badge(r.published) })
        ]));
      });
    }

    /* needs attention */
    var checks = Store.healthChecks();
    var cbox = qs('[data-checks]');
    if (!checks.length) {
      cbox.innerHTML = '<div class="notice notice--ok">' + icon('check', 18) +
        '<div><b>Everything looks fine</b>No missing images, prices or links.</div></div>';
    } else {
      cbox.innerHTML = checks.slice(0, 8).map(function (c) {
        return '<div class="notice notice--' + (c.level === 'warn' ? 'warn' : 'info') + '">' +
          icon(c.level === 'warn' ? 'warn' : 'info', 17) +
          '<div><a href="' + esc(c.href) + '">' + esc(c.text) + '</a></div></div>';
      }).join('') +
      (checks.length > 8 ? '<p class="faint small">and ' + (checks.length - 8) + ' more.</p>' : '');
    }

    /* latest enquiries */
    var enq = Store.sorted('enquiries').slice().reverse().slice(0, 4);
    var ebox = qs('[data-enq]');
    if (!enq.length) {
      ebox.innerHTML = '<p class="faint small">No enquiries yet. They arrive from the ' +
        'contact form.</p>';
    } else {
      ebox.innerHTML = enq.map(function (e) {
        return '<div class="row-item" style="padding:9px 0;border-bottom:1px solid var(--a-line-soft)">' +
          '<div class="row-main"><b>' + esc(e.name || 'Someone') + '</b>' +
          '<div class="meta"><span>' + esc(e.packageName || e.destination || 'General') + '</span>' +
          '<span class="dotsep">·</span><span>' + esc(relTime(e.receivedAt)) + '</span></div></div>' +
          ((e.status || 'new') === 'new'
            ? '<span class="badge badge--new"><span class="dot"></span>New</span>' : '') +
          '</div>';
      }).join('');
    }

    qsa('[data-new]').forEach(function (b) {
      b.addEventListener('click', newPackageFlow);
    });
    qsa('[data-new-dest]').forEach(function (b) {
      b.addEventListener('click', newDestinationFlow);
    });
    qsa('[data-new-adv]').forEach(function (b) {
      b.addEventListener('click', function () { location.href = 'adventures.html?new=1'; });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     CREATE FLOWS
     ══════════════════════════════════════════════════════════════════ */

  function newPackageFlow() {
    var m = AUI.modal({
      title: 'Create a package',
      subtitle: 'Two details to start with. Everything else is on the next screen.',
      size: 'sm',
      body:
        '<div class="field"><label class="label" for="npName">Name <span class="req">*</span></label>' +
        '<input class="input" id="npName" type="text" placeholder="Classic Kerala Loop" ' +
        'data-rules="required" data-label="A name"><div class="err"></div></div>' +
        '<div class="field"><label class="label" for="npDest">Destination</label>' +
        '<select class="select" id="npDest"></select></div>' +
        '<div class="field"><label class="label" for="npCat">Trip style</label>' +
        '<select class="select" id="npCat"></select></div>' +
        '<div class="hint">The web address is built from the name. You can change it later ' +
        'under Publishing, though links already shared will stop working if you do.</div>',
      buttons: [
        { label: 'Cancel', class: 'btn--ghost' },
        {
          label: 'Create and edit', class: 'btn--primary', icon: 'plus',
          onClick: function (a) {
            if (AUI.validate(a.box).length) { return; }
            var p = Store.createPackage({
              name: m.qs('#npName').value.trim(),
              destinationId: m.qs('#npDest').value,
              categoryId: m.qs('#npCat').value
            });
            a.close();
            location.href = 'package-editor.html?id=' + encodeURIComponent(p.id);
          }
        }
      ]
    });

    AUI.masterSelect(m.qs('#npDest'),
      Store.sorted('destinations').map(function (d) { return { id: d.id, name: d.name }; }),
      '', { placeholder: '— choose later —' });
    AUI.masterSelect(m.qs('#npCat'), Store.masterList('categories'), '',
      { placeholder: '— choose later —' });
  }

  function newDestinationFlow() {
    var m = AUI.modal({
      title: 'Create a destination',
      subtitle: 'The name and its state. Photographs and copy come next.',
      size: 'sm',
      body:
        '<div class="field"><label class="label" for="ndName">Name <span class="req">*</span></label>' +
        '<input class="input" id="ndName" type="text" placeholder="Chikmagalur" ' +
        'data-rules="required" data-label="A name"><div class="err"></div></div>' +
        '<div class="field"><label class="label" for="ndRegion">State</label>' +
        '<select class="select" id="ndRegion"></select></div>' +
        '<div class="field"><label class="label" for="ndArea">District or area ' +
        '<span class="opt">shown on the card</span></label>' +
        '<input class="input" id="ndArea" type="text" placeholder="Chikkamagaluru"></div>',
      buttons: [
        { label: 'Cancel', class: 'btn--ghost' },
        {
          label: 'Create and edit', class: 'btn--primary', icon: 'plus',
          onClick: function (a) {
            if (AUI.validate(a.box).length) { return; }
            var d = Store.createDestination({
              name: m.qs('#ndName').value.trim(),
              regionId: m.qs('#ndRegion').value,
              region: m.qs('#ndArea').value.trim()
            });
            a.close();
            location.href = 'destination-editor.html?id=' + encodeURIComponent(d.id);
          }
        }
      ]
    });

    AUI.masterSelect(m.qs('#ndRegion'), Store.masterList('regions'), '',
      { placeholder: '— choose later —' });
  }

  /* ══════════════════════════════════════════════════════════════════════
     DESTINATIONS — list
     ══════════════════════════════════════════════════════════════════ */

  function destinationsPage() {
    var host = qs('[data-list]');
    var state = { q: '', regionId: '' };

    var bar = qs('[data-toolbar]');
    bar.innerHTML =
      '<div class="flex center-y gap-2 wrap">' +
        '<div class="chip-row" role="group" aria-label="Filter by state">' +
          '<button class="chip-btn is-on" type="button" data-region="">All</button>' +
          Store.masterList('regions').map(function (r) {
            return '<button class="chip-btn" type="button" data-region="' + esc(r.id) + '">' +
              esc(plain(r.name)) + '</button>';
          }).join('') +
        '</div><span class="spacer"></span>' +
        '<div class="searchbox">' + icon('search', 15) +
          '<label class="visually-hidden" for="dq">Search destinations</label>' +
          '<input class="input" id="dq" type="search" placeholder="Search…"></div>' +
      '</div>';

    qsa('[data-region]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        state.regionId = b.dataset.region;
        qsa('[data-region]', bar).forEach(function (x) {
          x.classList.toggle('is-on', x === b);
        });
        paint();
      });
    });
    qs('#dq', bar).addEventListener('input', AUI.debounce(function (e) {
      state.q = e.target.value;
      paint();
    }, 180));

    function paint() {
      var all = Store.sorted('destinations');
      var list = filterRows(all, state.q, ['name', 'region', 'state', 'shortDescription']);
      if (state.regionId) {
        list = list.filter(function (d) { return d.regionId === state.regionId; });
      }

      if (!all.length) {
        AUI.emptyState(host, 'pin', 'No destinations yet',
          'Add the places you travel to. Each one gets its own page and can be linked to packages.',
          el('button', {
            class: 'btn btn--primary', type: 'button',
            html: icon('plus', 15) + 'New destination', onclick: newDestinationFlow
          }));
        return;
      }
      if (!list.length) {
        AUI.emptyState(host, 'search', 'Nothing matches that',
          'Try a different search term or clear the state filter.');
        return;
      }

      host.innerHTML = '';
      var rows = el('div', { class: 'rows' });

      list.forEach(function (d) {
        var used = Store.packagesForDestination(d.id).length;
        var meta = [
          plain(d.region) || '—',
          Store.masterName(d.regionId) || d.state || '',
          used ? used + (used === 1 ? ' package' : ' packages') : 'no packages'
        ].filter(Boolean);

        var row = el('div', {
          class: 'row-item', draggable: state.q || state.regionId ? 'false' : 'true'
        }, [
          el('span', { class: 'row-grip', html: icon('grip', 15), title: 'Drag to reorder' }),
          thumb('row-thumb', d.image),
          el('div', { class: 'row-main', html:
            '<b>' + esc(plain(d.name)) + '</b>' +
            '<div class="meta">' + meta.map(function (x) { return '<span>' + esc(x) + '</span>'; })
              .join('<span class="dotsep">·</span>') + '</div>'
          }),
          el('div', { class: 'row-acts', html:
            (d.featured ? '<span class="badge badge--feat">Featured</span> ' : '') +
            AUI.badge(d.published)
          }),
          rowActions({
            published: d.published,
            onToggle: function () {
              Store.togglePublished('destinations', d.id);
              AUI.toast(d.published ? 'Published' : 'Unpublished', plain(d.name));
              paint();
            },
            onEdit: function () {
              location.href = 'destination-editor.html?id=' + encodeURIComponent(d.id);
            },
            onDelete: function () { removeDestination(d, paint); }
          })
        ]);
        rows.appendChild(row);
      });

      host.appendChild(rows);

      if (!state.q && !state.regionId) {
        AUI.sortable(rows, '.row-item', function (from, to) {
          Store.reorder('destinations', from, to);
          paint();
        });
      }
    }

    function removeDestination(d, done) {
      var res = Store.deleteDestination(d.id);
      if (res.ok === false && res.usage && res.usage.count) {
        AUI.modal({
          title: 'That destination is in use',
          size: 'sm',
          body: '<p class="soft small" style="line-height:1.65"><b>' + esc(plain(d.name)) +
            '</b> is linked to ' + res.usage.count +
            (res.usage.count === 1 ? ' package' : ' packages') + ':</p>' +
            '<ul class="soft small" style="margin:10px 0 0 18px;line-height:1.7">' +
            res.usage.where.map(function (n) { return '<li>' + esc(plain(n)) + '</li>'; }).join('') +
            '</ul><p class="soft small mt-3" style="line-height:1.65">Point those packages at a ' +
            'different destination first, or unpublish this one instead of deleting it.</p>',
          buttons: [{ label: 'Close', class: 'btn--ghost' }]
        });
        return;
      }
      /* Nothing references it, so a normal confirm is enough. */
      confirmDelete('destination', d.name).then(function (ok) {
        if (!ok) { return; }
        Store.deleteItem('destinations', d.id);
        AUI.toast('Destination deleted', plain(d.name));
        done();
      });
    }

    qsa('[data-new-dest]').forEach(function (b) {
      b.addEventListener('click', newDestinationFlow);
    });

    if (AUI.param('new')) { newDestinationFlow(); }
    paint();
  }

  /* ══════════════════════════════════════════════════════════════════════
     DESTINATION EDITOR
     ══════════════════════════════════════════════════════════════════ */

  function destinationEditor() {
    var id = AUI.param('id');
    var d = Store.getItem('destinations', id);

    if (!d) {
      AUI.emptyState(qs('[data-editor]'), 'pin', 'That destination could not be found',
        'It may have been deleted, or the link is out of date.',
        el('a', { class: 'btn btn--primary', href: 'destinations.html', text: 'Back to destinations' }));
      return;
    }

    qs('[data-title]').textContent = plain(d.name) || 'Destination';
    qs('[data-crumb-name]').textContent = plain(d.name) || 'Destination';

    var host = qs('[data-editor]');
    host.innerHTML =
      '<div class="panel"><h2>Basic information</h2>' +
        '<p class="panel__sub">What appears on the destination card and page heading.</p>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="dName">Name <span class="req">*</span></label>' +
            '<input class="input" id="dName" data-rules="required" data-label="A name">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="dRegion">State</label>' +
            '<select class="select" id="dRegion"></select>' +
            '<div class="hint">Groups this place into a section on the destinations page.</div></div>' +
          '<div class="field"><label class="label" for="dArea">District or area</label>' +
            '<input class="input" id="dArea" placeholder="Vijayanagara">' +
            '<div class="hint">The small blue label above the name on the card.</div></div>' +
          '<div class="field"><label class="label" for="dSlug">Web address <span class="opt">read only</span></label>' +
            '<input class="input" id="dSlug" readonly>' +
            '<div class="hint">destination-details.html?id=' + esc(d.id) + '</div></div>' +
        '</div></div>' +

      '<div class="panel"><h2>Description</h2>' +
        '<p class="panel__sub">The short line is used for search results and previews; the full ' +
        'text appears on the destination page. Leave a blank line between paragraphs.</p>' +
        '<div class="field"><label class="label" for="dShort">Short description</label>' +
          '<textarea class="textarea" id="dShort" rows="2"></textarea></div>' +
        '<div class="field"><label class="label" for="dLong">Full description</label>' +
          '<textarea class="textarea" id="dLong" rows="8"></textarea></div>' +
      '</div>' +

      '<div class="panel"><h2>Main photograph</h2>' +
        '<p class="panel__sub">Used on the card, the page banner and anywhere this place is linked.</p>' +
        '<div data-image></div></div>' +

      '<div class="panel"><h2>Gallery</h2>' +
        '<p class="panel__sub">Extra photographs shown on the destination page. Drag to reorder.</p>' +
        '<div data-gallery></div></div>' +

      '<div class="panel"><h2>Travel information</h2>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="dBest">Best time to visit</label>' +
            '<input class="input" id="dBest" placeholder="October to February"></div>' +
          '<div class="field"><label class="label" for="dDur">Suggested stay</label>' +
            '<input class="input" id="dDur" placeholder="2 – 3 days"></div>' +
        '</div></div>' +

      '<div class="panel"><h2>Publishing</h2>' +
        '<label class="check"><input type="checkbox" id="dPub">' +
          '<span><b>Published</b><span>Visible on the website. Unpublished places are hidden ' +
          'from every page.</span></span></label>' +
        '<label class="check"><input type="checkbox" id="dFeat">' +
          '<span><b>Featured</b><span>Shows in the Popular Destinations grid on the home page.' +
          '</span></span></label>' +
      '</div>';

    AUI.masterSelect(qs('#dRegion'), Store.masterList('regions'), d.regionId,
      { placeholder: '— no state —' });

    AUI.bind(qs('#dName'), d, 'name', {
      trim: false,
      onChange: function (v) {
        qs('[data-title]').textContent = plain(v) || 'Destination';
        qs('[data-crumb-name]').textContent = plain(v) || 'Destination';
        d.slug = Store.slugify(v);
        qs('#dSlug').value = d.slug;
      }
    });
    qs('#dSlug').value = d.slug || '';

    AUI.bind(qs('#dRegion'), d, 'regionId', {
      onChange: function (v) { d.state = Store.masterName(v); Store.saveData(true); }
    });
    AUI.bind(qs('#dArea'), d, 'region');
    AUI.bind(qs('#dShort'), d, 'shortDescription');
    AUI.bind(qs('#dLong'), d, 'description');
    AUI.bind(qs('#dBest'), d, 'bestTime');
    AUI.bind(qs('#dDur'), d, 'duration');
    AUI.bind(qs('#dPub'), d, 'published');
    AUI.bind(qs('#dFeat'), d, 'featured');

    AUI.imageField(qs('[data-image]'), d, 'image');
    d.gallery = d.gallery || [];
    AUI.galleryField(qs('[data-gallery]'), d.gallery);

    qs('[data-view]').href = '../destination-details.html?id=' + encodeURIComponent(d.id) + '&preview=1';
    qs('[data-view]').addEventListener('click', function () { Store.preview(true); });

    qs('[data-delete]').addEventListener('click', function () {
      var res = Store.deleteDestination(d.id);
      if (res.ok === false && res.usage.count) {
        AUI.toast('Still in use', 'This destination is linked to ' + res.usage.count +
          ' package(s). Repoint them first.', 'warn', 7000);
        return;
      }
      confirmDelete('destination', d.name).then(function (ok) {
        if (!ok) { return; }
        Store.deleteItem('destinations', d.id);
        location.href = 'destinations.html';
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     PACKAGES — list
     ══════════════════════════════════════════════════════════════════ */

  function packagesPage() {
    var host = qs('[data-list]');
    var state = { q: '', categoryId: '', status: '' };

    var bar = qs('[data-toolbar]');
    bar.innerHTML =
      '<div class="flex center-y gap-2 wrap">' +
        '<div class="chip-row" role="group" aria-label="Filter">' +
          '<button class="chip-btn is-on" type="button" data-status="">All</button>' +
          '<button class="chip-btn" type="button" data-status="published">Live</button>' +
          '<button class="chip-btn" type="button" data-status="draft">Draft</button>' +
          '<button class="chip-btn" type="button" data-status="featured">Featured</button>' +
        '</div><span class="spacer"></span>' +
        '<select class="select" id="pcat" aria-label="Filter by trip style" ' +
          'style="flex:0 1 190px"></select>' +
        '<div class="searchbox">' + icon('search', 15) +
          '<label class="visually-hidden" for="pq">Search packages</label>' +
          '<input class="input" id="pq" type="search" placeholder="Search…"></div>' +
      '</div>';

    AUI.masterSelect(qs('#pcat', bar), Store.masterList('categories'), '',
      { placeholder: 'All trip styles' });

    qsa('[data-status]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        state.status = b.dataset.status;
        qsa('[data-status]', bar).forEach(function (x) { x.classList.toggle('is-on', x === b); });
        paint();
      });
    });
    qs('#pcat', bar).addEventListener('change', function (e) {
      state.categoryId = e.target.value;
      paint();
    });
    qs('#pq', bar).addEventListener('input', AUI.debounce(function (e) {
      state.q = e.target.value;
      paint();
    }, 180));

    function paint() {
      var all = Store.sorted('packages');
      var list = filterRows(all, state.q, ['name', 'shortDescription', 'duration']);
      if (state.categoryId) {
        list = list.filter(function (p) { return p.categoryId === state.categoryId; });
      }
      if (state.status === 'published') { list = list.filter(function (p) { return p.published; }); }
      if (state.status === 'draft') { list = list.filter(function (p) { return !p.published; }); }
      if (state.status === 'featured') { list = list.filter(function (p) { return p.featured; }); }

      if (!all.length) {
        AUI.emptyState(host, 'package', 'No packages yet',
          'Create your first travel package to make it appear on the website.',
          el('button', {
            class: 'btn btn--primary', type: 'button',
            html: icon('plus', 15) + 'New package', onclick: newPackageFlow
          }));
        return;
      }
      if (!list.length) {
        AUI.emptyState(host, 'search', 'Nothing matches that',
          'Try a different search term or clear the filters.');
        return;
      }

      host.innerHTML = '';
      var rows = el('div', { class: 'rows' });
      var draggable = !state.q && !state.categoryId && !state.status;

      list.forEach(function (p) {
        var dest = Store.getItem('destinations', p.destinationId);
        var meta = [
          plain(p.duration) || 'no duration',
          Store.masterName(p.categoryId) || 'no style',
          dest ? plain(dest.name) : 'no destination',
          (p.itinerary || []).length + ' day' + ((p.itinerary || []).length === 1 ? '' : 's')
        ];

        rows.appendChild(el('div', { class: 'row-item', draggable: draggable ? 'true' : 'false' }, [
          el('span', { class: 'row-grip', html: icon('grip', 15), title: 'Drag to reorder' }),
          thumb('row-thumb', p.image),
          el('div', { class: 'row-main', html:
            '<b>' + esc(plain(p.name)) + '</b>' +
            '<div class="meta">' + meta.map(function (x) { return '<span>' + esc(x) + '</span>'; })
              .join('<span class="dotsep">·</span>') + '</div>'
          }),
          el('div', { class: 'row-acts', html:
            (p.featured ? '<span class="badge badge--feat">Featured</span> ' : '') +
            AUI.badge(p.published)
          }),
          rowActions({
            published: p.published,
            onToggle: function () {
              Store.togglePublished('packages', p.id);
              AUI.toast(p.published ? 'Published' : 'Unpublished', plain(p.name));
              paint();
            },
            onDuplicate: function () {
              var copy = Store.duplicateItem('packages', p.id);
              AUI.toast('Package duplicated', 'Saved as a draft: ' + plain(copy.name));
              paint();
            },
            onEdit: function () {
              location.href = 'package-editor.html?id=' + encodeURIComponent(p.id);
            },
            onDelete: function () {
              confirmDelete('package', p.name).then(function (ok) {
                if (!ok) { return; }
                Store.deleteItem('packages', p.id);
                AUI.toast('Package deleted', plain(p.name));
                paint();
              });
            }
          })
        ]));
      });

      host.appendChild(rows);
      if (draggable) {
        AUI.sortable(rows, '.row-item', function (from, to) {
          Store.reorder('packages', from, to);
          paint();
        });
      }
    }

    qsa('[data-new]').forEach(function (b) { b.addEventListener('click', newPackageFlow); });
    if (AUI.param('new')) { newPackageFlow(); }
    paint();
  }

  /* ══════════════════════════════════════════════════════════════════════
     PACKAGE EDITOR
     ══════════════════════════════════════════════════════════════════ */

  function packageEditor() {
    var id = AUI.param('id');
    var p = Store.getItem('packages', id);

    if (!p) {
      AUI.emptyState(qs('[data-editor]'), 'package', 'That package could not be found',
        'It may have been deleted, or the link is out of date.',
        el('a', { class: 'btn btn--primary', href: 'packages.html', text: 'Back to packages' }));
      return;
    }

    /* Make sure every list exists before anything binds to it. */
    ['gallery', 'highlights', 'inclusions', 'exclusions', 'itinerary'].forEach(function (k) {
      if (!Array.isArray(p[k])) { p[k] = []; }
    });

    qs('[data-title]').textContent = plain(p.name) || 'Package';
    qs('[data-crumb-name]').textContent = plain(p.name) || 'Package';

    var TABS = [
      { id: 'basic', label: 'Basic' },
      { id: 'media', label: 'Media' },
      { id: 'pricing', label: 'Pricing' },
      { id: 'highlights', label: 'Highlights' },
      { id: 'inclusions', label: 'Inclusions' },
      { id: 'itinerary', label: 'Itinerary' },
      { id: 'publishing', label: 'Publishing' }
    ];

    qs('[data-tabs]').innerHTML = TABS.map(function (t) {
      return '<button class="tab" type="button" role="tab" data-tab="' + t.id + '" ' +
        'aria-selected="false" id="tab-' + t.id + '" aria-controls="panel-' + t.id + '">' +
        esc(t.label) + '</button>';
    }).join('');

    var host = qs('[data-editor]');
    host.innerHTML = TABS.map(function (t) {
      return '<div class="tabpanel" role="tabpanel" id="panel-' + t.id + '" ' +
        'aria-labelledby="tab-' + t.id + '" data-panel="' + t.id + '" hidden></div>';
    }).join('');

    function panel(name) { return qs('[data-panel="' + name + '"]', host); }

    /* ── Basic ─────────────────────────────────────────────────────── */
    panel('basic').innerHTML =
      '<div class="panel"><h2>Basic information</h2>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="pName">Package name <span class="req">*</span></label>' +
            '<input class="input" id="pName" data-rules="required" data-label="A name">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="pDest">Destination <span class="req">*</span></label>' +
            '<select class="select" id="pDest" data-rules="required" data-label="A destination">' +
            '</select><div class="err"></div></div>' +
          '<div class="field"><label class="label" for="pCat">Trip style</label>' +
            '<select class="select" id="pCat"></select>' +
            '<div class="hint">Shown as the tag on the package card.</div></div>' +
          '<div class="field"><label class="label" for="pDur">Duration <span class="req">*</span></label>' +
            '<input class="input" id="pDur" placeholder="7 Days" data-rules="required" ' +
            'data-label="A duration"><div class="err"></div></div>' +
          '<div class="field"><label class="label" for="pGuests">Group size</label>' +
            '<input class="input" id="pGuests" placeholder="2-8 Guests"></div>' +
          '<div class="field"><label class="label" for="pStatus">Booking status</label>' +
            '<select class="select" id="pStatus"></select></div>' +
        '</div>' +
        '<div class="field"><label class="label" for="pShort">Short description</label>' +
          '<textarea class="textarea" id="pShort" rows="2"></textarea>' +
          '<div class="hint">The one-liner under the name on the package card.</div></div>' +
        '<div class="field"><label class="label" for="pLong">Full description</label>' +
          '<textarea class="textarea" id="pLong" rows="8"></textarea>' +
          '<div class="hint">Leave a blank line between paragraphs.</div></div>' +
      '</div>';

    AUI.masterSelect(qs('#pDest'),
      Store.sorted('destinations').map(function (dst) { return { id: dst.id, name: dst.name }; }),
      p.destinationId, { placeholder: '— choose a destination —' });
    AUI.masterSelect(qs('#pCat'), Store.masterList('categories'), p.categoryId,
      { placeholder: '— no style —' });
    AUI.masterSelect(qs('#pStatus'), Store.masterList('bookingStatuses'), p.bookingStatus,
      { placeholder: '— not set —' });

    AUI.bind(qs('#pName'), p, 'name', {
      onChange: function (v) {
        qs('[data-title]').textContent = plain(v) || 'Package';
        qs('[data-crumb-name]').textContent = plain(v) || 'Package';
      }
    });
    AUI.bind(qs('#pDest'), p, 'destinationId');
    AUI.bind(qs('#pCat'), p, 'categoryId');
    AUI.bind(qs('#pDur'), p, 'duration');
    AUI.bind(qs('#pGuests'), p, 'guests');
    AUI.bind(qs('#pStatus'), p, 'bookingStatus');
    AUI.bind(qs('#pShort'), p, 'shortDescription');
    AUI.bind(qs('#pLong'), p, 'description');

    /* ── Media ─────────────────────────────────────────────────────── */
    panel('media').innerHTML =
      '<div class="panel"><h2>Main photograph</h2>' +
        '<p class="panel__sub">Used on the package card and as the page banner.</p>' +
        '<div data-pimage></div></div>' +
      '<div class="panel"><h2>Gallery</h2>' +
        '<p class="panel__sub">Extra photographs on the package page. Drag to reorder.</p>' +
        '<div data-pgallery></div></div>';

    AUI.imageField(qs('[data-pimage]'), p, 'image');
    AUI.galleryField(qs('[data-pgallery]'), p.gallery);

    /* ── Pricing ───────────────────────────────────────────────────── */
    panel('pricing').innerHTML =
      '<div class="panel"><h2>Pricing</h2>' +
        '<p class="panel__sub">This site currently invites an enquiry rather than showing a ' +
        'number. Tick the box below to show a real price instead.</p>' +
        '<label class="check"><input type="checkbox" id="pShow">' +
          '<span><b>Show a price on the website</b><span>When off, the card and page show the ' +
          'note below instead.</span></span></label>' +
        '<div class="field mt-3"><label class="label" for="pNote">Text shown when no price</label>' +
          '<input class="input" id="pNote" placeholder="Enquire for pricing"></div>' +
        '<div class="divider"></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="pPrice">Price per person (₹)</label>' +
            '<input class="input" id="pPrice" type="number" min="0" step="500" ' +
            'data-rules="number|positive" data-label="The price"><div class="err"></div></div>' +
          '<div class="field"><label class="label" for="pWas">Was (₹) <span class="opt">optional</span></label>' +
            '<input class="input" id="pWas" type="number" min="0" step="500" ' +
            'data-rules="number|positive" data-label="The original price">' +
            '<div class="hint">Shown struck through when higher than the price.</div>' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="pSeats">Seats left <span class="opt">optional</span></label>' +
            '<input class="input" id="pSeats" type="number" min="0" ' +
            'data-rules="number|positive" data-label="Seats left"><div class="err"></div></div>' +
        '</div></div>';

    AUI.bind(qs('#pShow'), p, 'showPrice');
    AUI.bind(qs('#pNote'), p, 'priceNote');
    AUI.bind(qs('#pPrice'), p, 'price', { cast: 'number' });
    AUI.bind(qs('#pWas'), p, 'originalPrice', { cast: 'number' });
    AUI.bind(qs('#pSeats'), p, 'seatsLeft', { cast: 'numberOrNull' });

    /* ── Highlights ────────────────────────────────────────────────── */
    panel('highlights').innerHTML =
      '<div class="panel"><h2>Trip highlights</h2>' +
        '<p class="panel__sub">The handful of things that sell this trip. Drag to reorder.</p>' +
        '<div data-highlights></div></div>';
    AUI.repeater(qs('[data-highlights]'), p.highlights, {
      placeholder: 'Sunrise over the Hampi boulder field',
      addLabel: 'Highlight',
      empty: 'No highlights yet. These appear as a list on the package page.'
    });

    /* ── Inclusions / exclusions ───────────────────────────────────── */
    panel('inclusions').innerHTML =
      '<div class="panel"><h2>What\u2019s included</h2>' +
        '<p class="panel__sub">Shown with ticks on the package page.</p>' +
        '<div data-inc></div></div>' +
      '<div class="panel"><h2>Not included</h2>' +
        '<p class="panel__sub">Being explicit here prevents awkward conversations later.</p>' +
        '<div data-exc></div></div>';
    AUI.repeater(qs('[data-inc]'), p.inclusions, {
      placeholder: 'Daily breakfast', addLabel: 'Inclusion', empty: 'Nothing listed yet.'
    });
    AUI.repeater(qs('[data-exc]'), p.exclusions, {
      placeholder: 'Airfare and train tickets', addLabel: 'Exclusion', empty: 'Nothing listed yet.'
    });

    /* ── Itinerary ─────────────────────────────────────────────────── */
    panel('itinerary').innerHTML =
      '<div class="panel"><div class="flex between center-y wrap gap-2">' +
        '<div><h2>Day by day</h2><p class="panel__sub mb-0">Drag the cards to reorder; days ' +
        'renumber themselves.</p></div>' +
        '<button class="btn btn--primary btn--sm" type="button" data-add-day>' +
        icon('plus', 15) + 'Add a day</button></div>' +
        '<div class="mt-3" data-days></div></div>';

    function paintDays() {
      var box = qs('[data-days]');
      box.innerHTML = '';
      box.dataset.sortable = '';

      if (!p.itinerary.length) {
        box.innerHTML = '<div class="rep__empty">No days yet. Add the first one to start ' +
          'building the itinerary.</div>';
        return;
      }

      p.itinerary.forEach(function (day, i) {
        var card = el('div', { class: 'day-card', draggable: 'true', 'data-i': i });
        card.innerHTML =
          '<div class="day-card__head">' +
            '<span class="row-grip" title="Drag to reorder">' + icon('grip', 15) + '</span>' +
            '<span class="day-card__no">Day ' + (i + 1) + '</span>' +
            '<span class="day-card__t">' +
              (plain(day.title) ? esc(plain(day.title)) : '<span>Untitled day</span>') + '</span>' +
            '<span class="row-acts" data-acts></span>' +
          '</div>' +
          '<div class="day-card__body">' +
            '<div class="grid-2">' +
              '<div class="field"><label class="label">Title</label>' +
                '<input class="input" data-f="title" placeholder="Arrival and welcome"></div>' +
              '<div class="field"><label class="label">Location</label>' +
                '<input class="input" data-f="location" placeholder="Madurai"></div>' +
            '</div>' +
            '<div class="field"><label class="label">Description</label>' +
              '<textarea class="textarea" data-f="description" rows="3"></textarea></div>' +
            '<div class="grid-2">' +
              '<div class="field"><label class="label">Activities</label>' +
                '<div data-acts-list></div></div>' +
              '<div class="field"><label class="label">Photograph <span class="opt">optional</span></label>' +
                '<div data-day-img></div></div>' +
            '</div>' +
          '</div>';

        var head = qs('[data-acts]', card);
        head.appendChild(el('button', {
          class: 'iact', type: 'button', title: 'Duplicate this day',
          'aria-label': 'Duplicate day ' + (i + 1), html: icon('copy', 15),
          onclick: function () { Store.duplicateItineraryDay(p.id, i); paintDays(); }
        }));
        head.appendChild(el('button', {
          class: 'iact iact--danger', type: 'button', title: 'Delete this day',
          'aria-label': 'Delete day ' + (i + 1), html: icon('trash', 15),
          onclick: function () {
            AUI.confirm({
              title: 'Delete day ' + (i + 1) + '?',
              body: 'The remaining days renumber themselves. This only changes your draft.',
              confirmLabel: 'Delete day'
            }).then(function (ok) {
              if (!ok) { return; }
              Store.deleteItineraryDay(p.id, i);
              paintDays();
            });
          }
        }));

        var titleInput = qs('[data-f="title"]', card);
        AUI.bind(titleInput, day, 'title', {
          onChange: function (v) {
            qs('.day-card__t', card).innerHTML = plain(v)
              ? esc(plain(v)) : '<span>Untitled day</span>';
          }
        });
        AUI.bind(qs('[data-f="location"]', card), day, 'location');
        AUI.bind(qs('[data-f="description"]', card), day, 'description');

        day.activities = day.activities || [];
        AUI.repeater(qs('[data-acts-list]', card), day.activities, {
          placeholder: 'Guided sightseeing', addLabel: 'Activity', empty: 'No activities listed.'
        });
        AUI.imageField(qs('[data-day-img]', card), day, 'image', {
          emptyText: 'No photograph for this day'
        });

        box.appendChild(card);
      });

      AUI.sortable(box, '.day-card', function (from, to) {
        Store.moveItineraryDay(p.id, from, to);
        paintDays();
      });
    }

    qs('[data-add-day]').addEventListener('click', function () {
      Store.addItineraryDay(p.id);
      paintDays();
      var cards = qsa('.day-card');
      if (cards.length) {
        cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
        var box = qs('[data-f="title"]', cards[cards.length - 1]);
        if (box) { setTimeout(function () { box.focus(); }, 320); }
      }
    });
    paintDays();

    /* ── Publishing ────────────────────────────────────────────────── */
    panel('publishing').innerHTML =
      '<div class="panel"><h2>Visibility</h2>' +
        '<label class="check"><input type="checkbox" id="pPub">' +
          '<span><b>Published</b><span>Visible on the website. Unpublished packages are hidden ' +
          'everywhere, including from search and related lists.</span></span></label>' +
        '<label class="check"><input type="checkbox" id="pFeat">' +
          '<span><b>Featured</b><span>Shows in Sample Journeys on the home page.</span></span></label>' +
      '</div>' +
      '<div class="panel"><h2>Web address</h2>' +
        '<p class="panel__sub">The package page reads this from the URL. Changing it breaks ' +
        'links already shared, so only change it deliberately.</p>' +
        '<div class="field"><label class="label" for="pId">Address slug</label>' +
          '<div class="flex gap-2"><input class="input" id="pId" data-rules="slug" ' +
          'data-label="The address"><button class="btn btn--ghost" type="button" data-rename>' +
          'Change</button></div>' +
          '<div class="hint mono">package-details.html?id=<span data-idpreview>' +
          esc(p.id) + '</span></div><div class="err"></div></div>' +
      '</div>' +
      '<div class="panel"><h2>Danger zone</h2>' +
        '<p class="panel__sub">Deleting removes this package from your working draft. The live ' +
        'site keeps it until you publish.</p>' +
        '<button class="btn btn--danger" type="button" data-del-pkg>' +
        icon('trash', 15) + 'Delete this package</button></div>';

    AUI.bind(qs('#pPub'), p, 'published');
    AUI.bind(qs('#pFeat'), p, 'featured');
    qs('#pId').value = p.id;

    qs('[data-rename]').addEventListener('click', function () {
      var wanted = qs('#pId').value.trim();
      if (!wanted || wanted === p.id) { return; }
      if (AUI.validate(panel('publishing')).length) { return; }

      AUI.confirm({
        title: 'Change the web address?',
        bodyHtml: 'Any link already shared to <code>' + esc(p.id) + '</code> will stop working. ' +
          'Enquiries already recorded against this package are repointed automatically.',
        confirmLabel: 'Change it'
      }).then(function (ok) {
        if (!ok) { qs('#pId').value = p.id; return; }
        var next = Store.renamePackageId(p.id, wanted);
        AUI.toast('Web address changed', 'Now ' + next);
        location.replace('package-editor.html?id=' + encodeURIComponent(next) + '&tab=publishing');
      });
    });

    qs('[data-del-pkg]').addEventListener('click', function () {
      confirmDelete('package', p.name).then(function (ok) {
        if (!ok) { return; }
        Store.deleteItem('packages', p.id);
        location.href = 'packages.html';
      });
    });

    /* ── Tab switching, with the choice remembered in the URL ──────── */
    function showTab(name) {
      var known = TABS.some(function (t) { return t.id === name; });
      if (!known) { name = 'basic'; }
      qsa('[data-tab]').forEach(function (b) {
        b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
      });
      qsa('[data-panel]', host).forEach(function (pn) {
        pn.hidden = pn.dataset.panel !== name;
      });
      var url = new URL(location.href);
      url.searchParams.set('tab', name);
      history.replaceState(null, '', url);
    }

    qsa('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.dataset.tab); });
    });
    showTab(AUI.param('tab') || 'basic');

    qs('[data-view]').href = '../package-details.html?id=' + encodeURIComponent(p.id) + '&preview=1';
    qs('[data-view]').addEventListener('click', function () { Store.preview(true); });

    /* Validation across every tab, not just the visible one. */
    qs('[data-check]').addEventListener('click', function () {
      var problems = AUI.validate(host);
      if (!problems.length) {
        AUI.toast('Looks good', 'Every required field is filled in.');
        return;
      }
      var first = problems[0];
      var pn = first.input.closest('[data-panel]');
      if (pn) { showTab(pn.dataset.panel); }
      setTimeout(function () {
        first.input.focus();
        first.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      AUI.toast(problems.length + ' field' + (problems.length > 1 ? 's need' : ' needs') + ' attention',
        first.message, 'warn');
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     GENERIC LIST MANAGER
     Adventures, testimonials, gallery and FAQs are all "a list of records
     edited in a modal", so they share one implementation. Each supplies
     its own fields and row rendering.
     ══════════════════════════════════════════════════════════════════ */

  function listManager(cfg) {
    var host = qs('[data-list]');
    var state = { q: '' };

    var bar = qs('[data-toolbar]');
    if (bar) {
      bar.innerHTML =
        '<div class="flex center-y gap-2 wrap"><span class="spacer"></span>' +
          '<div class="searchbox">' + icon('search', 15) +
          '<label class="visually-hidden" for="lq">Search</label>' +
          '<input class="input" id="lq" type="search" placeholder="Search…"></div></div>';
      qs('#lq', bar).addEventListener('input', AUI.debounce(function (e) {
        state.q = e.target.value;
        paint();
      }, 180));
    }

    function openEditor(item, isNew) {
      var working = isNew ? item : Store.clone(item);

      var m = AUI.modal({
        title: isNew ? cfg.newTitle : cfg.editTitle,
        subtitle: cfg.subtitle,
        size: cfg.size || 'lg',
        body: '<div data-form></div>',
        buttons: [
          { label: 'Cancel', class: 'btn--ghost' },
          {
            label: isNew ? 'Create' : 'Save changes', class: 'btn--primary',
            icon: isNew ? 'plus' : 'check',
            onClick: function (a) {
              if (AUI.validate(a.box).length) { return; }
              if (isNew) {
                Store.addItem(cfg.coll, working, cfg.prefix);
                AUI.toast(cfg.createdMsg || 'Created', plain(working[cfg.titleKey] || ''));
              } else {
                Store.updateItem(cfg.coll, item.id, working);
                AUI.toast('Saved', plain(working[cfg.titleKey] || ''));
              }
              a.close();
              paint();
            }
          }
        ]
      });

      cfg.form(m.qs('[data-form]'), working, m);
    }

    function paint() {
      var all = Store.sorted(cfg.coll);
      var list = filterRows(all, state.q, cfg.searchKeys);

      if (!all.length) {
        AUI.emptyState(host, cfg.icon, cfg.emptyTitle, cfg.emptyBody,
          el('button', {
            class: 'btn btn--primary', type: 'button',
            html: icon('plus', 15) + cfg.newLabel,
            onclick: function () { openEditor(cfg.blank(), true); }
          }));
        return;
      }
      if (!list.length) {
        AUI.emptyState(host, 'search', 'Nothing matches that', 'Try a different search term.');
        return;
      }

      host.innerHTML = '';
      var rows = el('div', { class: 'rows' });

      list.forEach(function (item, i) {
        var row = el('div', { class: 'row-item', draggable: state.q ? 'false' : 'true' });
        row.appendChild(el('span', {
          class: 'row-grip', html: icon('grip', 15), title: 'Drag to reorder'
        }));
        cfg.row(row, item, i);
        row.appendChild(rowActions({
          published: item.published,
          onToggle: cfg.publishable === false ? null : function () {
            Store.togglePublished(cfg.coll, item.id);
            paint();
          },
          onEdit: function () { openEditor(item, false); },
          onDelete: function () {
            confirmDelete(cfg.what, item[cfg.titleKey]).then(function (ok) {
              if (!ok) { return; }
              Store.deleteItem(cfg.coll, item.id);
              AUI.toast('Deleted', plain(item[cfg.titleKey] || ''));
              paint();
            });
          }
        }));
        rows.appendChild(row);
      });

      host.appendChild(rows);
      if (!state.q) {
        AUI.sortable(rows, '.row-item', function (from, to) {
          Store.reorder(cfg.coll, from, to);
          paint();
        });
      }
    }

    qsa('[data-new]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(cfg.blank(), true); });
    });
    if (AUI.param('new')) { openEditor(cfg.blank(), true); }
    paint();
  }

  /* ── Adventures ────────────────────────────────────────────────────── */

  var ICON_CHOICES = [
    'bi bi-tsunami', 'bi bi-tree', 'bi bi-water', 'bi bi-umbrella', 'bi bi-cup-hot',
    'bi bi-binoculars', 'bi bi-compass', 'bi bi-bicycle', 'bi bi-camera', 'bi bi-sunrise',
    'bi bi-map', 'bi bi-flag', 'bi bi-heart', 'bi bi-stars', 'bi bi-brightness-high'
  ];

  function adventuresPage() {
    listManager({
      coll: 'adventures', prefix: 'adv', what: 'adventure', titleKey: 'name',
      icon: 'compass', newLabel: 'New adventure',
      newTitle: 'New adventure', editTitle: 'Edit adventure',
      subtitle: 'A category of experience shown on the Adventures page.',
      createdMsg: 'Adventure created',
      emptyTitle: 'No adventures yet',
      emptyBody: 'Adventures are the experience categories on the Adventures page — trekking, ' +
        'rafting, wildlife and so on.',
      searchKeys: ['name', 'description'],
      blank: function () {
        return { name: '', description: '', icon: 'bi bi-compass', image: '',
          featured: true, published: true };
      },
      row: function (row, a) {
        row.appendChild(thumb('row-thumb', a.image));
        row.appendChild(el('div', { class: 'row-main', html:
          '<b>' + esc(plain(a.name)) + '</b>' +
          '<div class="excerpt">' + esc(plain(a.description)) + '</div>'
        }));
        row.appendChild(el('div', { class: 'row-acts', html: AUI.badge(a.published) }));
      },
      form: function (box, a) {
        box.innerHTML =
          '<div class="field"><label class="label" for="aName">Name <span class="req">*</span></label>' +
            '<input class="input" id="aName" data-rules="required" data-label="A name">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="aDesc">Description</label>' +
            '<textarea class="textarea" id="aDesc" rows="3"></textarea></div>' +
          '<div class="field"><label class="label" for="aIcon">Icon</label>' +
            '<select class="select" id="aIcon">' +
            ICON_CHOICES.map(function (c) {
              return '<option value="' + esc(c) + '">' + esc(c.replace('bi bi-', '')) + '</option>';
            }).join('') + '</select>' +
            '<div class="hint">A Bootstrap Icons name, shown in the badge on the card.</div></div>' +
          '<div class="field"><label class="label">Photograph</label><div data-aimg></div></div>' +
          '<label class="check"><input type="checkbox" id="aPub">' +
            '<span><b>Published</b><span>Visible on the Adventures page.</span></span></label>';

        AUI.bind(qs('#aName', box), a, 'name');
        AUI.bind(qs('#aDesc', box), a, 'description');
        AUI.bind(qs('#aIcon', box), a, 'icon');
        AUI.bind(qs('#aPub', box), a, 'published');
        AUI.imageField(qs('[data-aimg]', box), a, 'image');
      }
    });
  }

  /* ── Testimonials ──────────────────────────────────────────────────── */

  function testimonialsPage() {
    listManager({
      coll: 'testimonials', prefix: 'tst', what: 'testimonial', titleKey: 'name',
      icon: 'quote', newLabel: 'New testimonial',
      newTitle: 'New testimonial', editTitle: 'Edit testimonial',
      subtitle: 'Shown on the home page and the About page.',
      createdMsg: 'Testimonial created',
      emptyTitle: 'No testimonials yet',
      emptyBody: 'Add what travellers said about their trip. The first three show on the home page.',
      searchKeys: ['name', 'quote', 'location'],
      blank: function () {
        return { name: '', location: '', quote: '', avatar: '', rating: 5, published: true };
      },
      row: function (row, t) {
        row.appendChild(thumb('row-thumb row-thumb--round', t.avatar));
        row.appendChild(el('div', { class: 'row-main', html:
          '<b>' + esc(plain(t.name)) + '</b>' +
          '<div class="meta"><span>' + esc(plain(t.location)) + '</span>' +
          '<span class="dotsep">·</span><span>' +
          '★'.repeat(Math.max(0, Math.min(5, Number(t.rating) || 5))) + '</span></div>' +
          '<div class="excerpt">' + esc(plain(t.quote)) + '</div>'
        }));
        row.appendChild(el('div', { class: 'row-acts', html: AUI.badge(t.published) }));
      },
      form: function (box, t) {
        box.innerHTML =
          '<div class="grid-2">' +
            '<div class="field"><label class="label" for="tName">Name <span class="req">*</span></label>' +
              '<input class="input" id="tName" data-rules="required" data-label="A name">' +
              '<div class="err"></div></div>' +
            '<div class="field"><label class="label" for="tLoc">Trip or location</label>' +
              '<input class="input" id="tLoc" placeholder="Hampi &amp; Badami, 6 days"></div>' +
          '</div>' +
          '<div class="field"><label class="label" for="tQuote">What they said <span class="req">*</span></label>' +
            '<textarea class="textarea" id="tQuote" rows="4" data-rules="required" ' +
            'data-label="A quote"></textarea>' +
            '<div class="hint">Quotation marks are added automatically.</div>' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="tRate">Rating</label>' +
            '<select class="select" id="tRate">' +
            [5, 4, 3, 2, 1].map(function (n) {
              return '<option value="' + n + '">' + '★'.repeat(n) + ' (' + n + ')</option>';
            }).join('') + '</select></div>' +
          '<div class="field"><label class="label">Photograph</label><div data-timg></div></div>' +
          '<label class="check"><input type="checkbox" id="tPub">' +
            '<span><b>Published</b><span>Visible on the website.</span></span></label>';

        AUI.bind(qs('#tName', box), t, 'name');
        AUI.bind(qs('#tLoc', box), t, 'location');
        AUI.bind(qs('#tQuote', box), t, 'quote');
        AUI.bind(qs('#tRate', box), t, 'rating', { cast: 'number' });
        AUI.bind(qs('#tPub', box), t, 'published');
        AUI.imageField(qs('[data-timg]', box), t, 'avatar', { emptyText: 'No photograph' });
      }
    });
  }

  /* ── Gallery ───────────────────────────────────────────────────────── */

  function galleryPage() {
    listManager({
      coll: 'gallery', prefix: 'gal', what: 'image', titleKey: 'title',
      icon: 'image', newLabel: 'Add an image',
      newTitle: 'Add a gallery image', editTitle: 'Edit gallery image',
      subtitle: 'Shown in the Visual Diary grid on the home page.',
      createdMsg: 'Image added',
      emptyTitle: 'The gallery is empty',
      emptyBody: 'Add photographs to fill the Visual Diary section on the home page.',
      searchKeys: ['title', 'caption', 'category'],
      blank: function () {
        return { title: '', caption: '', image: '', category: '',
          featured: true, published: true };
      },
      row: function (row, g) {
        row.appendChild(thumb('row-thumb', g.image));
        row.appendChild(el('div', { class: 'row-main', html:
          '<b>' + esc(plain(g.title)) + '</b>' +
          '<div class="meta">' +
          (g.category ? '<span>' + esc(plain(g.category)) + '</span><span class="dotsep">·</span>' : '') +
          '<span class="mono">' + esc(g.image || 'no image') + '</span></div>' +
          (g.caption ? '<div class="excerpt">' + esc(plain(g.caption)) + '</div>' : '')
        }));
        row.appendChild(el('div', { class: 'row-acts', html: AUI.badge(g.published) }));
      },
      form: function (box, g) {
        box.innerHTML =
          '<div class="field"><label class="label">Photograph <span class="req">*</span></label>' +
            '<div data-gimg></div></div>' +
          '<div class="grid-2">' +
            '<div class="field"><label class="label" for="gTitle">Title <span class="req">*</span></label>' +
              '<input class="input" id="gTitle" data-rules="required" data-label="A title">' +
              '<div class="hint">Shown on hover. Matching a destination name links the tile to it.</div>' +
              '<div class="err"></div></div>' +
            '<div class="field"><label class="label" for="gCat">Category or tag</label>' +
              '<input class="input" id="gCat" list="galCats" placeholder="Karnataka">' +
              '<datalist id="galCats">' +
              Store.masterList('regions').map(function (r) {
                return '<option value="' + esc(plain(r.name)) + '"></option>';
              }).join('') + '</datalist></div>' +
          '</div>' +
          '<div class="field"><label class="label" for="gCap">Caption <span class="opt">optional</span></label>' +
            '<input class="input" id="gCap"></div>' +
          '<label class="check"><input type="checkbox" id="gPub">' +
            '<span><b>Published</b><span>Visible in the gallery.</span></span></label>';

        AUI.bind(qs('#gTitle', box), g, 'title');
        AUI.bind(qs('#gCat', box), g, 'category');
        AUI.bind(qs('#gCap', box), g, 'caption');
        AUI.bind(qs('#gPub', box), g, 'published');
        AUI.imageField(qs('[data-gimg]', box), g, 'image');
      }
    });
  }

  /* ── FAQs ──────────────────────────────────────────────────────────── */

  function faqsPage() {
    listManager({
      coll: 'faqs', prefix: 'faq', what: 'question', titleKey: 'question',
      icon: 'help', newLabel: 'New question',
      newTitle: 'New question', editTitle: 'Edit question',
      subtitle: 'Shown as an accordion at the bottom of the Contact page.',
      createdMsg: 'Question added',
      emptyTitle: 'No questions yet',
      emptyBody: 'Answer the things people ask before they write in. These appear on the ' +
        'Contact page.',
      searchKeys: ['question', 'answer'],
      blank: function () { return { question: '', answer: '', published: true }; },
      row: function (row, f) {
        row.appendChild(el('div', { class: 'row-main', html:
          '<b>' + esc(plain(f.question)) + '</b>' +
          '<div class="excerpt">' + esc(plain(f.answer)) + '</div>'
        }));
        row.appendChild(el('div', { class: 'row-acts', html: AUI.badge(f.published) }));
      },
      form: function (box, f) {
        box.innerHTML =
          '<div class="field"><label class="label" for="fQ">Question <span class="req">*</span></label>' +
            '<input class="input" id="fQ" data-rules="required" data-label="A question">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="fA">Answer <span class="req">*</span></label>' +
            '<textarea class="textarea" id="fA" rows="6" data-rules="required" ' +
            'data-label="An answer"></textarea>' +
            '<div class="hint">Leave a blank line between paragraphs.</div>' +
            '<div class="err"></div></div>' +
          '<label class="check"><input type="checkbox" id="fPub">' +
            '<span><b>Published</b><span>Visible on the Contact page.</span></span></label>';

        AUI.bind(qs('#fQ', box), f, 'question');
        AUI.bind(qs('#fA', box), f, 'answer');
        AUI.bind(qs('#fPub', box), f, 'published');
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     ENQUIRIES
     ══════════════════════════════════════════════════════════════════ */

  var ENQ_STATUS = [
    { id: 'new', label: 'New' },
    { id: 'read', label: 'Read' },
    { id: 'contacted', label: 'Contacted' },
    { id: 'archived', label: 'Archived' }
  ];

  function enquiriesPage() {
    var pulled = Store.pullLocalEnquiries();
    if (pulled) {
      AUI.toast(pulled + ' new ' + (pulled === 1 ? 'enquiry' : 'enquiries'),
        'Collected from the contact form in this browser.');
    }

    var host = qs('[data-list]');
    var state = { q: '', status: '' };

    /* Be honest about where enquiries actually come from. */
    var endpoint = ((Store.db.settings || {}).enquiry || {}).endpoint;
    qs('[data-notice]').innerHTML = endpoint
      ? '<div class="notice notice--ok">' + icon('check', 18) +
        '<div><b>A live endpoint is configured</b>Enquiries are posted to ' +
        esc(endpoint) + ' as well as being kept here.</div></div>'
      : '<div class="notice notice--warn">' + icon('warn', 18) +
        '<div><b>Enquiries are only collected locally</b>Without a form endpoint, a submission ' +
        'is stored in <em>that visitor\u2019s own browser</em> — so on a live site you would ' +
        'never see it. Anything below was submitted in this browser. Set an endpoint under ' +
        '<a href="settings.html#enquiry">Settings → Enquiries</a> before going live.</div></div>';

    var bar = qs('[data-toolbar]');
    bar.innerHTML =
      '<div class="flex center-y gap-2 wrap">' +
        '<div class="chip-row" role="group" aria-label="Filter by status">' +
          '<button class="chip-btn is-on" type="button" data-st="">All</button>' +
          ENQ_STATUS.map(function (s) {
            return '<button class="chip-btn" type="button" data-st="' + s.id + '">' +
              esc(s.label) + '</button>';
          }).join('') +
        '</div><span class="spacer"></span>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-refresh>' +
          icon('refresh', 15) + 'Check for new</button>' +
        '<div class="searchbox">' + icon('search', 15) +
          '<label class="visually-hidden" for="eq">Search enquiries</label>' +
          '<input class="input" id="eq" type="search" placeholder="Search…"></div>' +
      '</div>';

    qsa('[data-st]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        state.status = b.dataset.st;
        qsa('[data-st]', bar).forEach(function (x) { x.classList.toggle('is-on', x === b); });
        paint();
      });
    });
    qs('#eq', bar).addEventListener('input', AUI.debounce(function (e) {
      state.q = e.target.value;
      paint();
    }, 180));
    qs('[data-refresh]', bar).addEventListener('click', function () {
      var n = Store.pullLocalEnquiries();
      AUI.toast(n ? n + ' new enquiry' + (n === 1 ? '' : ' enquiries') : 'Nothing new',
        n ? 'Added to the list.' : 'No new submissions in this browser.', n ? null : 'warn');
      paint();
    });

    function detail(e) {
      if ((e.status || 'new') === 'new') { Store.setEnquiryStatus(e.id, 'read'); }

      var rows = [
        ['Name', e.name], ['Email', e.email], ['Phone', e.phone],
        ['Destination', e.destination], ['Package', e.packageName],
        ['Travel style', e.travelStyle], ['Travel date', e.travelDate],
        ['Travellers', e.travellers], ['Received', niceDate(e.receivedAt)]
      ].filter(function (r) { return r[1]; });

      AUI.modal({
        title: plain(e.name) || 'Enquiry',
        subtitle: relTime(e.receivedAt),
        body:
          '<div class="rows">' + rows.map(function (r) {
            return '<div class="row-item" style="padding:8px 0">' +
              '<div class="row-main"><div class="meta"><span>' + esc(r[0]) + '</span></div>' +
              '<b>' + esc(String(r[1])) + '</b></div></div>';
          }).join('') + '</div>' +
          (e.message
            ? '<div class="field mt-3"><label class="label">Message</label>' +
              '<p class="soft small" style="line-height:1.7;white-space:pre-wrap">' +
              esc(e.message) + '</p></div>'
            : '') +
          '<div class="field mt-3"><label class="label" for="eSt">Status</label>' +
            '<select class="select" id="eSt">' + ENQ_STATUS.map(function (s) {
              return '<option value="' + s.id + '"' +
                ((e.status || 'new') === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>';
            }).join('') + '</select></div>',
        buttons: [
          e.email ? {
            label: 'Reply by email', class: 'btn--ghost', icon: 'mail',
            onClick: function () {
              window.location.href = 'mailto:' + e.email +
                '?subject=' + encodeURIComponent('Your enquiry with Prithvi Holidays');
            }
          } : null,
          {
            label: 'Delete', class: 'btn--danger', icon: 'trash',
            onClick: function (a) {
              confirmDelete('enquiry', e.name).then(function (ok) {
                if (!ok) { return; }
                Store.deleteItem('enquiries', e.id);
                a.close();
                paint();
              });
            }
          },
          { label: 'Close', class: 'btn--primary' }
        ].filter(Boolean),
        onClose: paint
      });

      qs('#eSt').addEventListener('change', function (ev) {
        Store.setEnquiryStatus(e.id, ev.target.value);
        AUI.toast('Status updated', ev.target.options[ev.target.selectedIndex].text);
      });
    }

    function paint() {
      var all = Store.all('enquiries');
      var list = filterRows(all, state.q,
        ['name', 'email', 'phone', 'message', 'destination', 'packageName']);
      if (state.status) {
        list = list.filter(function (e) { return (e.status || 'new') === state.status; });
      }

      if (!all.length) {
        AUI.emptyState(host, 'inbox', 'No enquiries yet',
          'Submissions from the website contact form appear here.');
        return;
      }
      if (!list.length) {
        AUI.emptyState(host, 'search', 'Nothing matches that',
          'Try a different search term or status.');
        return;
      }

      host.innerHTML = '';
      var rows = el('div', { class: 'rows' });

      list.forEach(function (e) {
        var st = e.status || 'new';
        var meta = [
          e.email, e.phone, e.packageName || e.destination, relTime(e.receivedAt)
        ].filter(Boolean);

        rows.appendChild(el('div', { class: 'row-item' }, [
          el('div', {
            class: 'row-main', style: 'cursor:pointer',
            onclick: function () { detail(e); },
            html: '<b>' + esc(plain(e.name) || 'Someone') + '</b>' +
              '<div class="meta">' + meta.map(function (x) {
                return '<span>' + esc(x) + '</span>';
              }).join('<span class="dotsep">·</span>') + '</div>' +
              (e.message ? '<div class="excerpt">' + esc(e.message) + '</div>' : '')
          }),
          el('div', { class: 'row-acts', html:
            st === 'new' ? '<span class="badge badge--new"><span class="dot"></span>New</span>'
              : '<span class="badge badge--draft"><span class="dot"></span>' +
                esc((ENQ_STATUS.filter(function (s) { return s.id === st; })[0] || {}).label || st) +
                '</span>'
          }),
          rowActions({
            onEdit: function () { detail(e); },
            onDelete: function () {
              confirmDelete('enquiry', e.name).then(function (ok) {
                if (!ok) { return; }
                Store.deleteItem('enquiries', e.id);
                paint();
              });
            }
          })
        ]));
      });

      host.appendChild(rows);
    }

    paint();
  }

  /* ══════════════════════════════════════════════════════════════════════
     MASTERS — the lists everything else chooses from
     ══════════════════════════════════════════════════════════════════ */

  var MASTER_META = {
    regions: {
      label: 'States / regions',
      help: 'Groups destinations into sections on the destinations page.',
      extra: true
    },
    categories: {
      label: 'Trip styles',
      help: 'The tag on each package card, and the filter chips on the packages page.'
    },
    travelStyles: {
      label: 'Contact form styles',
      help: 'The Travel Style dropdown on the contact form.'
    },
    bookingStatuses: {
      label: 'Booking statuses',
      help: 'Availability wording shown on a package page.'
    }
  };

  function mastersPage() {
    var host = qs('[data-list]');

    function editor(key, row, isNew) {
      var working = isNew ? row : Store.clone(row);
      var meta = MASTER_META[key];

      var m = AUI.modal({
        title: isNew ? 'New entry' : 'Edit entry',
        subtitle: meta.label,
        size: 'sm',
        body:
          '<div class="field"><label class="label" for="mName">Name <span class="req">*</span></label>' +
            '<input class="input" id="mName" data-rules="required" data-label="A name">' +
            '<div class="err"></div></div>' +
          (meta.extra
            ? '<div class="field"><label class="label" for="mBlurb">Section blurb</label>' +
                '<textarea class="textarea" id="mBlurb" rows="3"></textarea>' +
                '<div class="hint">The line under the heading on the destinations page.</div></div>' +
              '<div class="field"><label class="label" for="mCap">Home card caption</label>' +
                '<input class="input" id="mCap" placeholder="12+ destinations"></div>' +
              '<div class="field"><label class="label">Home card photograph</label>' +
                '<div data-mimg></div></div>'
            : '') +
          '<label class="check"><input type="checkbox" id="mAct">' +
            '<span><b>Active</b><span>Inactive entries stay on existing content but are not ' +
            'offered for new content.</span></span></label>',
        buttons: [
          { label: 'Cancel', class: 'btn--ghost' },
          {
            label: isNew ? 'Create' : 'Save', class: 'btn--primary',
            onClick: function (a) {
              if (AUI.validate(a.box).length) { return; }
              if (isNew) { Store.createMaster(key, working); }
              else { Store.updateMaster(key, row.id, working); }
              a.close();
              paint();
              AUI.toast('Saved', plain(working.name));
            }
          }
        ]
      });

      AUI.bind(m.qs('#mName'), working, 'name');
      AUI.bind(m.qs('#mAct'), working, 'active');
      if (meta.extra) {
        AUI.bind(m.qs('#mBlurb'), working, 'blurb');
        AUI.bind(m.qs('#mCap'), working, 'homeCaption');
        AUI.imageField(m.qs('[data-mimg]'), working, 'homeImage');
      }
    }

    function paint() {
      host.innerHTML = '';

      Store.MASTER_KEYS.forEach(function (key) {
        var meta = MASTER_META[key];
        var list = Store.masterList(key).slice()
          .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });

        var card = el('div', { class: 'card mb-3' });
        card.innerHTML =
          '<div class="card__head"><div><h2>' + esc(meta.label) + '</h2>' +
          '<p>' + esc(meta.help) + '</p></div></div>' +
          '<div class="card__body card__body--flush" data-rows></div>';

        card.querySelector('.card__head').appendChild(el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          html: icon('plus', 15) + 'Add',
          onclick: function () {
            editor(key, { name: '', active: true }, true);
          }
        }));

        var rows = qs('[data-rows]', card);
        if (!list.length) {
          rows.innerHTML = '<p class="faint small" style="padding:16px 18px">Nothing here yet.</p>';
        } else {
          list.forEach(function (r) {
            var usage = Store.masterUsage(key, r.id);
            rows.appendChild(el('div', { class: 'row-item' }, [
              el('div', { class: 'row-main', html:
                '<b>' + esc(plain(r.name)) + '</b>' +
                '<div class="meta"><span class="mono">' + esc(r.id) + '</span>' +
                (usage.count ? '<span class="dotsep">·</span><span>used ' + usage.count +
                  '&times;</span>' : '') + '</div>'
              }),
              el('div', { class: 'row-acts', html:
                r.active === false ? '<span class="badge badge--draft">Inactive</span>' : ''
              }),
              rowActions({
                onUp: function () { Store.moveMaster(key, r.id, -1); paint(); },
                onDown: function () { Store.moveMaster(key, r.id, 1); paint(); },
                onEdit: function () { editor(key, r, false); },
                onDelete: function () {
                  var res = Store.deleteMaster(key, r.id);
                  if (res.ok === false && res.usage.count) {
                    AUI.modal({
                      title: 'That entry is in use',
                      size: 'sm',
                      body: '<p class="soft small" style="line-height:1.65"><b>' +
                        esc(plain(r.name)) + '</b> is used by ' + res.usage.count + ' item' +
                        (res.usage.count === 1 ? '' : 's') + ':</p>' +
                        '<ul class="soft small" style="margin:10px 0 0 18px;line-height:1.7">' +
                        res.usage.where.map(function (n) {
                          return '<li>' + esc(plain(n)) + '</li>';
                        }).join('') + '</ul>' +
                        '<p class="soft small mt-3" style="line-height:1.65">Change those first, ' +
                        'or mark this entry inactive instead of deleting it.</p>',
                      buttons: [{ label: 'Close', class: 'btn--ghost' }]
                    });
                    return;
                  }
                  AUI.toast('Deleted', plain(r.name));
                  paint();
                }
              })
            ]));
          });
        }
        host.appendChild(card);
      });
    }

    paint();
  }

  /* ══════════════════════════════════════════════════════════════════════
     SETTINGS
     ══════════════════════════════════════════════════════════════════ */

  function settingsPage() {
    var s = Store.db.settings;

    /* Guarantee every nested group exists before anything binds to it. */
    s.hero = s.hero || {};
    s.hero.images = s.hero.images || [];
    s.home = s.home || {};
    s.pages = s.pages || {};
    s.cta = s.cta || {};
    s.footer = s.footer || {};
    s.seo = s.seo || {};
    s.enquiry = s.enquiry || {};
    s.stats = s.stats || [];
    s.nav = s.nav || [];

    var TABS = [
      { id: 'business', label: 'Business' },
      { id: 'hero', label: 'Home hero' },
      { id: 'home', label: 'Home page' },
      { id: 'stats', label: 'Statistics' },
      { id: 'pages', label: 'Other pages' },
      { id: 'seo', label: 'SEO' },
      { id: 'enquiry', label: 'Enquiries' }
    ];

    qs('[data-tabs]').innerHTML = TABS.map(function (t) {
      return '<button class="tab" type="button" role="tab" data-tab="' + t.id + '" ' +
        'aria-selected="false" id="tab-' + t.id + '" aria-controls="panel-' + t.id + '">' +
        esc(t.label) + '</button>';
    }).join('');

    var host = qs('[data-editor]');
    host.innerHTML = TABS.map(function (t) {
      return '<div class="tabpanel" role="tabpanel" id="panel-' + t.id + '" ' +
        'aria-labelledby="tab-' + t.id + '" data-panel="' + t.id + '" hidden></div>';
    }).join('');

    function panel(n) { return qs('[data-panel="' + n + '"]', host); }

    /* ── Business ──────────────────────────────────────────────────── */
    panel('business').innerHTML =
      '<div class="panel"><h2>Business details</h2>' +
        '<p class="panel__sub">Used in the footer, the contact page and every call or email link.</p>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="sName">Business name <span class="req">*</span></label>' +
            '<input class="input" id="sName" data-rules="required" data-label="The business name">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="sTag">Tagline</label>' +
            '<input class="input" id="sTag"></div>' +
          '<div class="field"><label class="label" for="sPhone">Phone</label>' +
            '<input class="input" id="sPhone" data-rules="phone" data-label="The phone number">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="sWa">WhatsApp number</label>' +
            '<input class="input" id="sWa" placeholder="918220136068">' +
            '<div class="hint">Digits only, including the country code. Leave empty to hide the ' +
            'floating WhatsApp button.</div></div>' +
          '<div class="field"><label class="label" for="sEmail">Email</label>' +
            '<input class="input" id="sEmail" type="email" data-rules="email" ' +
            'data-label="The email address"><div class="err"></div></div>' +
          '<div class="field"><label class="label" for="sHours">Office hours</label>' +
            '<input class="input" id="sHours"></div>' +
        '</div>' +
        '<div class="field"><label class="label" for="sAddr">Address</label>' +
          '<input class="input" id="sAddr"></div>' +
      '</div>' +

      '<div class="panel"><h2>Logo</h2>' +
        '<p class="panel__sub">Shown in the navigation bar and the footer.</p>' +
        '<div data-logo></div></div>' +

      '<div class="panel"><h2>Social links</h2>' +
        '<p class="panel__sub">Leave one empty to hide that icon in the footer.</p>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="sIg">Instagram</label>' +
            '<input class="input" id="sIg" data-rules="url" data-label="The Instagram link">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="sFb">Facebook</label>' +
            '<input class="input" id="sFb" data-rules="url" data-label="The Facebook link">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="sTw">X / Twitter</label>' +
            '<input class="input" id="sTw" data-rules="url" data-label="The X link">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="sYt">YouTube</label>' +
            '<input class="input" id="sYt" data-rules="url" data-label="The YouTube link">' +
            '<div class="err"></div></div>' +
        '</div>' +
        '<div class="field"><label class="label" for="sMap">Map embed URL</label>' +
          '<input class="input" id="sMap">' +
          '<div class="hint">The iframe source shown on the contact page.</div></div>' +
      '</div>' +

      '<div class="panel"><h2>Footer</h2>' +
        '<div class="field"><label class="label" for="fAbout">About text</label>' +
          '<textarea class="textarea" id="fAbout" rows="3"></textarea></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="fNt">Newsletter heading</label>' +
            '<input class="input" id="fNt"></div>' +
          '<div class="field"><label class="label" for="fLegal">Legal line</label>' +
            '<input class="input" id="fLegal"></div>' +
        '</div>' +
        '<div class="field"><label class="label" for="fNb">Newsletter blurb</label>' +
          '<textarea class="textarea" id="fNb" rows="2"></textarea></div>' +
        '<div class="field"><label class="label">Top Places links</label>' +
          '<div data-places></div>' +
          '<div class="hint">Type a destination name exactly as it appears under Destinations ' +
          'and the link goes straight to that page.</div></div>' +
      '</div>';

    AUI.bind(qs('#sName'), s, 'businessName');
    AUI.bind(qs('#sTag'), s, 'tagline');
    AUI.bind(qs('#sPhone'), s, 'phone');
    AUI.bind(qs('#sWa'), s, 'whatsapp');
    AUI.bind(qs('#sEmail'), s, 'email');
    AUI.bind(qs('#sHours'), s, 'officeHours');
    AUI.bind(qs('#sAddr'), s, 'address');
    AUI.bind(qs('#sIg'), s, 'instagram');
    AUI.bind(qs('#sFb'), s, 'facebook');
    AUI.bind(qs('#sTw'), s, 'twitter');
    AUI.bind(qs('#sYt'), s, 'youtube');
    AUI.bind(qs('#sMap'), s, 'googleMaps');
    AUI.imageField(qs('[data-logo]'), s, 'logo');

    AUI.bind(qs('#fAbout'), s.footer, 'about');
    AUI.bind(qs('#fNt'), s.footer, 'newsletterTitle');
    AUI.bind(qs('#fNb'), s.footer, 'newsletterBody');
    AUI.bind(qs('#fLegal'), s.footer, 'legal');
    s.footer.topPlaces = s.footer.topPlaces || [];
    AUI.repeater(qs('[data-places]'), s.footer.topPlaces, {
      placeholder: 'Hampi Ruins', addLabel: 'Place', empty: 'No links yet.'
    });

    /* ── Hero ──────────────────────────────────────────────────────── */
    panel('hero').innerHTML =
      '<div class="panel"><h2>Hero images</h2>' +
        '<p class="panel__sub">The home page carousel. Drag to reorder — the first image is the ' +
        'one visitors see before the carousel advances. With one image the arrows and dots are ' +
        'hidden automatically.</p>' +
        '<div data-heroimgs></div></div>' +

      '<div class="panel"><h2>Hero text</h2>' +
        '<div class="field"><label class="label" for="hTag">Small label above the heading</label>' +
          '<input class="input" id="hTag"></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="hTitle">Heading</label>' +
            '<input class="input" id="hTitle" placeholder="Answer The"></div>' +
          '<div class="field"><label class="label" for="hAccent">Heading accent</label>' +
            '<input class="input" id="hAccent" placeholder="Call of India">' +
            '<div class="hint">Rendered in italic blue after the heading.</div></div>' +
        '</div>' +
        '<div class="field"><label class="label" for="hSub">Subtitle</label>' +
          '<textarea class="textarea" id="hSub" rows="3"></textarea></div>' +
      '</div>' +

      '<div class="panel"><h2>Hero buttons</h2>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label" for="hB1">Primary button</label>' +
            '<input class="input" id="hB1"></div>' +
          '<div class="field"><label class="label" for="hL1">Primary link</label>' +
            '<input class="input" id="hL1" data-rules="url" data-label="The primary link">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="hB2">Secondary button</label>' +
            '<input class="input" id="hB2"></div>' +
          '<div class="field"><label class="label" for="hL2">Secondary link</label>' +
            '<input class="input" id="hL2" data-rules="url" data-label="The secondary link">' +
            '<div class="err"></div></div>' +
          '<div class="field"><label class="label" for="hInt">Slide interval (ms)</label>' +
            '<input class="input" id="hInt" type="number" min="1500" step="500" ' +
            'data-rules="number" data-label="The interval"><div class="err"></div></div>' +
        '</div></div>';

    AUI.galleryField(qs('[data-heroimgs]'), s.hero.images, {
      markFirst: true,
      empty: 'No hero images yet. The home page needs at least one.'
    });
    AUI.bind(qs('#hTag'), s.hero, 'tag');
    AUI.bind(qs('#hTitle'), s.hero, 'title');
    AUI.bind(qs('#hAccent'), s.hero, 'accent');
    AUI.bind(qs('#hSub'), s.hero, 'subtitle');
    AUI.bind(qs('#hB1'), s.hero, 'primaryButton');
    AUI.bind(qs('#hL1'), s.hero, 'primaryButtonLink');
    AUI.bind(qs('#hB2'), s.hero, 'secondaryButton');
    AUI.bind(qs('#hL2'), s.hero, 'secondaryButtonLink');
    AUI.bind(qs('#hInt'), s.hero, 'interval', { cast: 'number' });

    /* ── Home page ─────────────────────────────────────────────────── */
    var HOME_SECTIONS = [
      { k: 'intro', t: 'Welcome section', body: true },
      { k: 'regions', t: 'States grid heading' },
      { k: 'destinations', t: 'Popular destinations heading' },
      { k: 'steps', t: 'How it works heading', body: true },
      { k: 'packages', t: 'Sample journeys heading' },
      { k: 'testimonials', t: 'Testimonials heading', body: true },
      { k: 'gallery', t: 'Gallery heading', body: true }
    ];

    panel('home').innerHTML =
      HOME_SECTIONS.map(function (sec) {
        return '<div class="panel"><h2>' + esc(sec.t) + '</h2><div class="grid-3">' +
          '<div class="field"><label class="label">Kicker</label>' +
            '<input class="input" data-h="' + sec.k + 'Kicker"></div>' +
          '<div class="field"><label class="label">Title</label>' +
            '<input class="input" data-h="' + sec.k + 'Title"></div>' +
          '<div class="field"><label class="label">Accent</label>' +
            '<input class="input" data-h="' + sec.k + 'Accent"></div>' +
          '</div>' +
          (sec.body
            ? '<div class="field"><label class="label">Body text</label>' +
              '<textarea class="textarea" data-h="' + sec.k + 'Body" rows="3"></textarea></div>'
            : '') +
          '</div>';
      }).join('') +

      '<div class="panel"><h2>Why travellers choose us</h2>' +
        '<div class="grid-3">' +
          '<div class="field"><label class="label">Kicker</label>' +
            '<input class="input" data-h="whyKicker"></div>' +
          '<div class="field"><label class="label">Title</label>' +
            '<input class="input" data-h="whyTitle"></div>' +
          '<div class="field"><label class="label">Accent</label>' +
            '<input class="input" data-h="whyAccent"></div>' +
        '</div>' +
        '<div class="field"><label class="label">Body text</label>' +
          '<textarea class="textarea" data-h="whyBody" rows="3"></textarea></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label">Badge number</label>' +
            '<input class="input" data-h="whyBadgeNumber"></div>' +
          '<div class="field"><label class="label">Badge label</label>' +
            '<input class="input" data-h="whyBadgeLabel"></div>' +
        '</div>' +
        '<div class="field"><label class="label">Photograph</label><div data-whyimg></div></div>' +
      '</div>' +

      '<div class="panel"><h2>Closing call to action</h2>' +
        '<p class="panel__sub">The band above the footer on every page.</p>' +
        '<div class="grid-3">' +
          '<div class="field"><label class="label">Kicker</label>' +
            '<input class="input" data-c="kicker"></div>' +
          '<div class="field"><label class="label">Title</label>' +
            '<input class="input" data-c="title"></div>' +
          '<div class="field"><label class="label">Accent</label>' +
            '<input class="input" data-c="accent"></div>' +
        '</div>' +
        '<div class="field"><label class="label">Text after the accent</label>' +
          '<input class="input" data-c="titleAfter"></div>' +
        '<div class="field"><label class="label">Body</label>' +
          '<textarea class="textarea" data-c="body" rows="3"></textarea></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label">Primary button</label>' +
            '<input class="input" data-c="primaryButton"></div>' +
          '<div class="field"><label class="label">Primary link</label>' +
            '<input class="input" data-c="primaryButtonLink"></div>' +
          '<div class="field"><label class="label">Secondary button</label>' +
            '<input class="input" data-c="secondaryButton"></div>' +
          '<div class="field"><label class="label">Secondary link</label>' +
            '<input class="input" data-c="secondaryButtonLink"></div>' +
        '</div>' +
        '<div class="field"><label class="label">Background photograph</label>' +
          '<div data-ctaimg></div></div>' +
      '</div>';

    qsa('[data-h]', panel('home')).forEach(function (inp) {
      AUI.bind(inp, s.home, inp.dataset.h);
    });
    qsa('[data-c]', panel('home')).forEach(function (inp) {
      AUI.bind(inp, s.cta, inp.dataset.c);
    });
    AUI.imageField(qs('[data-whyimg]'), s.home, 'whyImage');
    AUI.imageField(qs('[data-ctaimg]'), s.cta, 'image');

    /* ── Statistics ────────────────────────────────────────────────── */
    panel('stats').innerHTML =
      '<div class="panel"><div class="flex between center-y wrap gap-2">' +
        '<div><h2>Statistics band</h2><p class="panel__sub mb-0">The counting numbers on the ' +
        'home page and Adventures page.</p></div>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-add-stat>' +
        icon('plus', 15) + 'Add a statistic</button></div>' +
        '<div class="mt-3" data-stats></div></div>';

    function paintStats() {
      var box = qs('[data-stats]');
      box.innerHTML = '';
      box.dataset.sortable = '';

      if (!s.stats.length) {
        box.innerHTML = '<div class="rep__empty">No statistics yet.</div>';
      }

      s.stats.forEach(function (st, i) {
        var card = el('div', { class: 'day-card', draggable: 'true', 'data-i': i });
        card.innerHTML =
          '<div class="day-card__body"><div class="grid-3">' +
            '<div class="field"><label class="label">Number</label>' +
              '<input class="input" type="number" data-f="value"></div>' +
            '<div class="field"><label class="label">Suffix</label>' +
              '<input class="input" data-f="suffix" placeholder="+"></div>' +
            '<div class="field"><label class="label">Label</label>' +
              '<input class="input" data-f="label"></div>' +
          '</div>' +
          '<div class="flex between center-y">' +
            '<label class="check" style="padding:0"><input type="checkbox" data-f="enabled">' +
            '<span><b>Shown on the website</b></span></label>' +
            '<span class="row-acts" data-acts></span></div></div>';

        AUI.bind(qs('[data-f="value"]', card), st, 'value', { cast: 'number' });
        AUI.bind(qs('[data-f="suffix"]', card), st, 'suffix');
        AUI.bind(qs('[data-f="label"]', card), st, 'label');
        AUI.bind(qs('[data-f="enabled"]', card), st, 'enabled');

        qs('[data-acts]', card).appendChild(el('button', {
          class: 'iact iact--danger', type: 'button', title: 'Remove',
          'aria-label': 'Remove statistic', html: icon('trash', 15),
          onclick: function () {
            s.stats.splice(i, 1);
            Store.saveData(true);
            paintStats();
          }
        }));
        box.appendChild(card);
      });

      AUI.sortable(box, '.day-card', function (from, to) {
        s.stats.splice(to, 0, s.stats.splice(from, 1)[0]);
        Store.saveData(true);
        paintStats();
      });
    }

    qs('[data-add-stat]').addEventListener('click', function () {
      s.stats.push({
        id: 'stat-' + (s.stats.length + 1), value: 0, suffix: '+', label: '', enabled: true
      });
      Store.saveData(true);
      paintStats();
    });
    paintStats();

    /* ── Other pages ───────────────────────────────────────────────── */
    var PAGE_KEYS = [
      { k: 'destinations', t: 'Destinations page' },
      { k: 'packages', t: 'Packages page' },
      { k: 'adventures', t: 'Adventures page' },
      { k: 'contact', t: 'Contact page' }
    ];

    panel('pages').innerHTML =
      PAGE_KEYS.map(function (pk) {
        return '<div class="panel"><h2>' + esc(pk.t) + '</h2>' +
          '<div class="grid-2">' +
            '<div class="field"><label class="label">Page title</label>' +
              '<input class="input" data-p="' + pk.k + '.title"></div>' +
            '<div class="field"><label class="label">Kicker</label>' +
              '<input class="input" data-p="' + pk.k + '.kicker"></div>' +
            '<div class="field"><label class="label">Heading</label>' +
              '<input class="input" data-p="' + pk.k + '.headingTitle"></div>' +
            '<div class="field"><label class="label">Heading accent</label>' +
              '<input class="input" data-p="' + pk.k + '.headingAccent"></div>' +
          '</div>' +
          '<div class="field"><label class="label">Intro text</label>' +
            '<textarea class="textarea" data-p="' + pk.k + '.body" rows="3"></textarea></div>' +
          '<div class="field"><label class="label">Banner photograph</label>' +
            '<div data-pimg="' + pk.k + '"></div></div></div>';
      }).join('') +

      '<div class="panel"><h2>About page</h2>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label">Page title</label>' +
            '<input class="input" data-p="about.title"></div>' +
          '<div class="field"><label class="label">Story kicker</label>' +
            '<input class="input" data-p="about.storyKicker"></div>' +
          '<div class="field"><label class="label">Story heading</label>' +
            '<input class="input" data-p="about.storyTitle"></div>' +
          '<div class="field"><label class="label">Story accent</label>' +
            '<input class="input" data-p="about.storyAccent"></div>' +
          '<div class="field"><label class="label">Badge number</label>' +
            '<input class="input" data-p="about.badgeNumber"></div>' +
          '<div class="field"><label class="label">Badge label</label>' +
            '<input class="input" data-p="about.badgeLabel"></div>' +
        '</div>' +
        '<div class="field"><label class="label">Story text</label>' +
          '<textarea class="textarea" data-p="about.storyBody" rows="6"></textarea></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label class="label">Banner photograph</label>' +
            '<div data-pimg="about"></div></div>' +
          '<div class="field"><label class="label">Story photograph</label>' +
            '<div data-aboutstory></div></div>' +
        '</div>' +
        '<div class="field"><label class="label">Progress bars</label>' +
          '<div data-skills></div></div>' +
        '<div class="field"><label class="label">Team</label><div data-team></div></div>' +
      '</div>';

    qsa('[data-p]', panel('pages')).forEach(function (inp) {
      var parts = inp.dataset.p.split('.');
      s.pages[parts[0]] = s.pages[parts[0]] || {};
      AUI.bind(inp, s.pages[parts[0]], parts[1]);
    });
    qsa('[data-pimg]', panel('pages')).forEach(function (box) {
      var k = box.dataset.pimg;
      s.pages[k] = s.pages[k] || {};
      AUI.imageField(box, s.pages[k], 'image');
    });
    AUI.imageField(qs('[data-aboutstory]'), s.pages.about, 'storyImage');

    /* Progress bars: label + percentage pairs. */
    s.pages.about.skills = s.pages.about.skills || [];
    function paintSkills() {
      var box = qs('[data-skills]');
      box.innerHTML = '';
      box.dataset.sortable = '';

      if (!s.pages.about.skills.length) {
        box.appendChild(el('div', { class: 'rep__empty', text: 'No progress bars.' }));
      }

      s.pages.about.skills.forEach(function (sk, i) {
        var row = el('div', { class: 'rep__row', draggable: 'true', 'data-i': i });
        row.appendChild(el('span', { class: 'rep__grip', html: icon('grip', 15) }));

        var label = el('input', { class: 'input', placeholder: 'Personalised Itineraries' });
        label.value = sk.label || '';
        label.addEventListener('input', function () { sk.label = label.value; Store.saveData(); });

        var pct = el('input', {
          class: 'input', type: 'number', min: '0', max: '100',
          style: 'flex:0 0 92px', 'aria-label': 'Percentage'
        });
        pct.value = sk.value || 0;
        pct.addEventListener('input', function () {
          sk.value = Number(pct.value) || 0;
          Store.saveData();
        });

        row.appendChild(label);
        row.appendChild(pct);
        row.appendChild(el('button', {
          class: 'rep__del', type: 'button', html: icon('trash', 15),
          'aria-label': 'Remove progress bar',
          onclick: function () {
            s.pages.about.skills.splice(i, 1);
            Store.saveData(true);
            paintSkills();
          }
        }));
        box.appendChild(row);
      });

      box.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm rep__add', type: 'button',
        html: icon('plus', 15) + 'Add a bar',
        onclick: function () {
          s.pages.about.skills.push({ label: '', value: 90 });
          Store.saveData(true);
          paintSkills();
        }
      }));

      AUI.sortable(box, '.rep__row', function (from, to) {
        s.pages.about.skills.splice(to, 0, s.pages.about.skills.splice(from, 1)[0]);
        Store.saveData(true);
        paintSkills();
      });
    }
    paintSkills();

    /* Team members. */
    s.pages.about.team = s.pages.about.team || [];
    function paintTeam() {
      var box = qs('[data-team]');
      box.innerHTML = '';

      if (!s.pages.about.team.length) {
        box.appendChild(el('div', { class: 'rep__empty', text: 'No team members listed.' }));
      }

      s.pages.about.team.forEach(function (mem, i) {
        var card = el('div', { class: 'day-card' });
        card.innerHTML =
          '<div class="day-card__body"><div class="grid-2">' +
            '<div class="field"><label class="label">Name</label>' +
              '<input class="input" data-f="name"></div>' +
            '<div class="field"><label class="label">Role</label>' +
              '<input class="input" data-f="role"></div>' +
            '<div class="field"><label class="label">LinkedIn</label>' +
              '<input class="input" data-f="linkedin"></div>' +
            '<div class="field"><label class="label">Instagram</label>' +
              '<input class="input" data-f="instagram"></div>' +
          '</div>' +
          '<div class="field"><label class="label">Photograph</label><div data-mimg></div></div>' +
          '<span class="row-acts" data-acts></span></div>';

        ['name', 'role', 'linkedin', 'instagram'].forEach(function (k) {
          AUI.bind(qs('[data-f="' + k + '"]', card), mem, k);
        });
        AUI.imageField(qs('[data-mimg]', card), mem, 'photo');

        qs('[data-acts]', card).appendChild(el('button', {
          class: 'iact iact--danger', type: 'button', html: icon('trash', 15),
          title: 'Remove', 'aria-label': 'Remove team member',
          onclick: function () {
            s.pages.about.team.splice(i, 1);
            Store.saveData(true);
            paintTeam();
          }
        }));
        box.appendChild(card);
      });

      box.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm rep__add', type: 'button',
        html: icon('plus', 15) + 'Add a team member',
        onclick: function () {
          s.pages.about.team.push({
            id: 'team-' + (s.pages.about.team.length + 1),
            name: '', role: '', photo: '', linkedin: '#', instagram: '#'
          });
          Store.saveData(true);
          paintTeam();
        }
      }));
    }
    paintTeam();

    /* ── SEO ───────────────────────────────────────────────────────── */
    panel('seo').innerHTML =
      '<div class="panel"><h2>Search and sharing</h2>' +
        '<p class="panel__sub">Each page builds its own title from its content; these are the ' +
        'site-wide defaults and the fallback description.</p>' +
        '<div class="field"><label class="label" for="seoT">Site title suffix</label>' +
          '<input class="input" id="seoT"></div>' +
        '<div class="field"><label class="label" for="seoD">Default description</label>' +
          '<textarea class="textarea" id="seoD" rows="3"></textarea>' +
          '<div class="hint">Around 155 characters reads best in search results. ' +
          '<span data-seolen></span></div></div>' +
        '<div class="field"><label class="label" for="seoU">Site address</label>' +
          '<input class="input" id="seoU" placeholder="https://prithviholidays.com"></div>' +
        '<div class="field"><label class="label">Sharing image</label>' +
          '<div data-ogimg></div>' +
          '<div class="hint">Shown when a link is shared on social media. 1200×630 works best.</div>' +
        '</div></div>';

    AUI.bind(qs('#seoT'), s.seo, 'titleSuffix');
    AUI.bind(qs('#seoU'), s.seo, 'siteUrl');
    AUI.imageField(qs('[data-ogimg]'), s.seo, 'ogImage');

    var seoD = qs('#seoD');
    var seoLen = qs('[data-seolen]');
    function showLen() {
      var n = seoD.value.length;
      seoLen.textContent = 'Currently ' + n + '.';
      seoLen.style.color = (n > 165 || (n && n < 70)) ? 'var(--a-warn)' : '';
    }
    AUI.bind(seoD, s.seo, 'description', { onChange: showLen });
    showLen();

    /* ── Enquiries ─────────────────────────────────────────────────── */
    panel('enquiry').innerHTML =
      '<div class="panel"><h2>Where enquiries go</h2>' +
        '<div class="notice notice--info">' + icon('info', 18) +
          '<div><b>This matters before you go live</b>A static website cannot write to its own ' +
          'files. With no endpoint set, a submission is saved in <em>that visitor\u2019s browser</em> ' +
          'and nowhere else — you will never see it. Point this at a form service and every ' +
          'enquiry reaches you properly.</div></div>' +
        '<div class="field"><label class="label" for="eEnd">Form endpoint URL</label>' +
          '<input class="input" id="eEnd" placeholder="https://formspree.io/f/xxxxxxx" ' +
          'data-rules="url" data-label="The endpoint">' +
          '<div class="hint">Any service that accepts a JSON POST works — Formspree, Basin, ' +
          'a Google Apps Script web app, or your own serverless function.</div>' +
          '<div class="err"></div></div>' +
        '<div class="field"><label class="label" for="eTitle">Thank-you heading</label>' +
          '<input class="input" id="eTitle"></div>' +
        '<div class="field"><label class="label" for="eBody">Thank-you message</label>' +
          '<textarea class="textarea" id="eBody" rows="3"></textarea></div>' +
        '<div class="field"><label class="label" for="eSuccess">Inline confirmation text</label>' +
          '<textarea class="textarea" id="eSuccess" rows="2"></textarea>' +
          '<div class="hint">The green line that appears under the contact form button.</div></div>' +
      '</div>' +

      '<div class="panel"><h2>Data files</h2>' +
        '<p class="panel__sub">Download the JSON to commit by hand, or replace a file wholesale.</p>' +
        '<div class="flex gap-2 wrap" data-exports></div></div>' +
      '<div class="panel"><h2>Publishing</h2><div data-conn></div></div>';

    AUI.bind(qs('#eEnd'), s.enquiry, 'endpoint');
    AUI.bind(qs('#eTitle'), s.enquiry, 'successTitle');
    AUI.bind(qs('#eBody'), s.enquiry, 'successBody');
    s.pages.contact = s.pages.contact || {};
    AUI.bind(qs('#eSuccess'), s.pages.contact, 'successMessage');

    var exports = qs('[data-exports]');
    Store.FILES.forEach(function (f) {
      exports.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        html: icon('download', 15) + f + '.json',
        onclick: function () { Store.exportOne(f); }
      }));
    });
    exports.appendChild(el('button', {
      class: 'btn btn--primary btn--sm', type: 'button',
      html: icon('download', 15) + 'All as a ZIP',
      onclick: function () { Store.exportZip(); }
    }));

    var m = AUI.modeInfo();

    var access = m.mode === 'server'
      ? '<div class="notice notice--ok">' + icon('check', 18) +
        '<div><b>Access is checked on the server</b>The passcode is verified against ' +
        'ADMIN_PASSWORD by the publishing function, and the session expires after 12 hours. ' +
        'This is the strongest option.</div></div>'
      : m.mode === 'local'
        ? '<div class="notice notice--info">' + icon('info', 18) +
          '<div><b>Passcode gate is on</b>Checked in the browser against the hash in ' +
          '<code>data/admin.json</code>. It keeps people out of the admin, but someone ' +
          'determined could work around it — which costs them little, since publishing still ' +
          'needs the server. Change it with <code>python3 tools/set-passcode.py</code>.</div></div>'
        : '<div class="notice notice--warn">' + icon('warn', 18) +
          '<div><b>No passcode is set</b>Anyone who reaches this page can edit content. Run ' +
          '<code>python3 tools/set-passcode.py</code> before going online.</div></div>';

    var publishing = m.configured
      ? '<div class="notice notice--ok">' + icon('check', 18) +
        '<div><b>Publishing is connected</b>Changes commit to ' + esc(m.repo) + ' on the ' +
        esc(m.branch || 'main') + ' branch.</div></div>'
      : '<div class="notice notice--warn">' + icon('warn', 18) +
        '<div><b>Publishing is not connected</b>The admin works and saves drafts, but the ' +
        'publish button has no server to reach. Deploy to Cloudflare Pages or Vercel and set ' +
        'GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH and ADMIN_PASSWORD. Until then, use ' +
        'Download JSON and commit by hand.</div></div>';

    qs('[data-conn]').innerHTML = access + publishing;

    /* ── Tabs ──────────────────────────────────────────────────────── */
    function showTab(name) {
      var known = TABS.some(function (t) { return t.id === name; });
      if (!known) { name = 'business'; }
      qsa('[data-tab]').forEach(function (b) {
        b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
      });
      qsa('[data-panel]', host).forEach(function (pn) {
        pn.hidden = pn.dataset.panel !== name;
      });
      history.replaceState(null, '', '#' + name);
    }
    qsa('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.dataset.tab); });
    });
    showTab((location.hash || '').replace('#', '') || 'business');

    qs('[data-check]').addEventListener('click', function () {
      var problems = AUI.validate(host);
      if (!problems.length) { AUI.toast('Looks good', 'No problems found.'); return; }
      var first = problems[0];
      var pn = first.input.closest('[data-panel]');
      if (pn) { showTab(pn.dataset.panel); }
      setTimeout(function () {
        first.input.focus();
        first.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      AUI.toast(problems.length + ' field' + (problems.length > 1 ? 's need' : ' needs') +
        ' attention', first.message, 'warn');
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     DISPATCH
     ══════════════════════════════════════════════════════════════════ */

  var PAGES = {
    dashboard:            { fn: dashboard,          nav: 'dashboard.html',    title: 'Dashboard',          sub: 'Everything at a glance' },
    settings:             { fn: settingsPage,       nav: 'settings.html',     title: 'Home & Settings',    sub: 'Business details and page copy' },
    destinations:         { fn: destinationsPage,   nav: 'destinations.html', title: 'Destinations',       sub: 'The places you travel to' },
    'destination-editor': { fn: destinationEditor,  nav: 'destinations.html', title: 'Destination editor', sub: 'Edit one place' },
    packages:             { fn: packagesPage,       nav: 'packages.html',     title: 'Packages',           sub: 'Every journey on the site' },
    'package-editor':     { fn: packageEditor,      nav: 'packages.html',     title: 'Package editor',     sub: 'Edit one journey' },
    adventures:           { fn: adventuresPage,     nav: 'adventures.html',   title: 'Adventures',         sub: 'Experience categories' },
    testimonials:         { fn: testimonialsPage,   nav: 'testimonials.html', title: 'Testimonials',       sub: 'What travellers said' },
    gallery:              { fn: galleryPage,        nav: 'gallery.html',      title: 'Gallery',            sub: 'Photographs on the home page' },
    faqs:                 { fn: faqsPage,           nav: 'faqs.html',         title: 'FAQs',               sub: 'Questions and answers' },
    enquiries:            { fn: enquiriesPage,      nav: 'enquiries.html',    title: 'Enquiries',          sub: 'From the contact form' },
    masters:              { fn: mastersPage,        nav: 'masters.html',      title: 'Lists & Categories', sub: 'The lists everything chooses from' }
  };

  function start() {
    var page = document.body.dataset.admin;
    if (page === 'login') { login(); return; }

    var cfg = PAGES[page];
    if (!cfg) {
      console.warn('[admin] No controller for data-admin="' + page + '"');
      return;
    }

    AUI.guard(cfg.nav, cfg.title, cfg.sub)
      .then(function () { cfg.fn(); })
      .catch(function (e) { console.error('[admin]', e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
}());
