/* ============================================================================
   PRITHVI HOLIDAYS — PAGE CONTROLLERS
   ----------------------------------------------------------------------------
   One controller per page, dispatched from <body data-page="…">. Each loads
   only the JSON it needs, hands it to the render layer, then re-applies the
   scroll effects to the markup it just inserted.
   ========================================================================= */
(function () {
  'use strict';

  var qs = PH.qs, qsa = PH.qsa, esc = PH.fmt.esc, rich = PH.fmt.rich;

  /* ══════════════════════════════════════════════════════════════════════
     Shared chrome — navbar, footer, floating buttons, SEO
     ══════════════════════════════════════════════════════════════════ */

  function chrome(s, destinations) {
    var active = location.pathname.split('/').pop() || 'index.html';

    var nav = qs('.navbar');
    if (nav) { nav.innerHTML = R.navbar(s, active); }

    var foot = qs('footer');
    if (foot) { foot.innerHTML = R.footer(s, destinations); }

    var wa = qs('[data-whatsapp]');
    if (wa) { wa.outerHTML = R.whatsapp(s); }

    FX.nav();
    FX.newsletter();
    FX.toTop();
  }

  function seo(o) {
    if (o.title) { document.title = o.title; }

    function meta(sel, attr, val) {
      if (!val) { return; }
      var tag = qs(sel);
      if (!tag) {
        tag = document.createElement('meta');
        var m = /\[(property|name)="([^"]+)"\]/.exec(sel);
        if (m) { tag.setAttribute(m[1], m[2]); }
        document.head.appendChild(tag);
      }
      tag.setAttribute(attr, val);
    }

    meta('meta[name="description"]', 'content', o.description);
    meta('meta[property="og:title"]', 'content', o.title);
    meta('meta[property="og:description"]', 'content', o.description);
    meta('meta[property="og:type"]', 'content', o.type || 'website');
    if (o.image) { meta('meta[property="og:image"]', 'content', PH.img(o.image)); }

    var canon = qs('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement('link');
      canon.setAttribute('rel', 'canonical');
      document.head.appendChild(canon);
    }
    canon.setAttribute('href', location.href.split('#')[0]);
  }

  /** Every page's data load funnels through here so chrome is never forgotten. */
  function boot(extra) {
    var names = ['settings', 'masters', 'destinations'].concat(extra || []);
    return PH.data.load.apply(null, names).then(function (d) {
      chrome(d.settings, d.destinations);
      previewBanner();
      return d;
    });
  }

  /** A quiet reminder when the visitor is looking at unpublished work. */
  function previewBanner() {
    if (!PH.data.previewOn() || qs('.preview-bar')) { return; }
    var bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.innerHTML = '<span><i class="bi bi-eye"></i> Preview — showing unpublished draft content.</span>' +
      '<button type="button">Exit preview</button>';
    bar.querySelector('button').addEventListener('click', function () {
      try { localStorage.removeItem(PH.data.PREVIEW_KEY); } catch (e) {}
      location.href = location.pathname;
    });
    document.body.appendChild(bar);
    document.body.classList.add('has-preview-bar');
  }

  function fail(err) {
    console.error('[PH]', err);
    var host = qs('[data-fail]') || qs('main') || document.body;
    var box = document.createElement('div');
    box.className = 'load-error container-x';
    box.innerHTML = '<h2>This page could not load its content</h2>' +
      '<p>' + esc(err && err.message ? err.message : 'Unknown error') + '</p>' +
      '<p>If you are running this locally, serve the folder over HTTP — ' +
      '<code>python -m http.server 8000</code> — rather than opening the file directly.</p>';
    host.appendChild(box);
  }

  /** Render into a node and wake the animations back up. */
  function paint(sel, html) {
    var node = qs(sel);
    if (!node) { return null; }
    node.innerHTML = html;
    FX.all(node);
    return node;
  }

  function ctaSection(s, override) {
    paint('[data-cta]', R.cta(s.cta, override));
  }

  /* ══════════════════════════════════════════════════════════════════════
     HOME
     ══════════════════════════════════════════════════════════════════ */
  var PAGES = {};

  PAGES.home = function () {
    boot(['packages', 'testimonials', 'gallery']).then(function (d) {
      var s = d.settings, h = s.home || {};

      paint('[data-hero]', R.hero(s));

      /* intro */
      paint('[data-intro]', R.heading({
        kicker: h.introKicker, title: h.introTitle, accent: h.introAccent, body: h.introBody
      }));

      /* regions */
      var regions = PH.get.list('regions');
      var pubDest = PH.get.published(d.destinations);
      paint('[data-regions-head]', R.heading({
        kicker: h.regionsKicker, title: h.regionsTitle, accent: h.regionsAccent
      }));
      paint('[data-regions]', regions.map(function (r, i) {
        var count = pubDest.filter(function (x) { return x.regionId === r.id; }).length;
        return R.regionCard(r, i, count);
      }).join(''));

      /* featured destinations */
      paint('[data-destinations-head]', R.heading({
        kicker: h.destinationsKicker, title: h.destinationsTitle, accent: h.destinationsAccent
      }));
      var featured = pubDest.filter(function (x) { return x.featured; });
      if (!featured.length) { featured = pubDest.slice(0, 9); }
      paint('[data-destinations]', featured.map(R.destinationCard).join(''));

      /* how it works */
      paint('[data-steps-head]', R.heading({
        kicker: h.stepsKicker, title: h.stepsTitle, accent: h.stepsAccent,
        body: h.stepsBody, centred: true, width: '46ch'
      }));
      paint('[data-steps]', (h.steps || []).map(function (f, i) {
        return R.feature(f, i);
      }).join(''));

      /* featured packages */
      paint('[data-packages-head]', R.heading({
        kicker: h.packagesKicker, title: h.packagesTitle, accent: h.packagesAccent
      }));
      var pubPkg = PH.get.published(d.packages);
      var featPkg = pubPkg.filter(function (p) { return p.featured; });
      if (!featPkg.length) { featPkg = pubPkg; }
      paint('[data-packages]', featPkg.slice(0, 4).map(R.packageCard).join(''));

      /* why us */
      paint('[data-why]',
        '<div class="col-lg-6 reveal">' +
          '<div class="frame"><img src="' + esc(PH.img(h.whyImage)) + '" alt="' +
            esc(s.businessName) + '">' +
          '<div class="badge"><span class="num">' + rich(h.whyBadgeNumber) + '</span>' +
          '<span class="lbl">' + rich(h.whyBadgeLabel) + '</span></div></div>' +
        '</div>' +
        '<div class="col-lg-6 reveal" data-d="1">' +
          R.heading({ kicker: h.whyKicker, title: h.whyTitle, accent: h.whyAccent, body: h.whyBody }) +
          '<div class="row g-3 mt-2">' +
            (h.why || []).map(function (f, i) {
              return R.feature(f, i % 2, 'col-sm-6');
            }).join('') +
          '</div>' +
        '</div>');

      /* stats */
      paint('[data-stats]', (s.stats || []).filter(function (x) { return x.enabled !== false; })
        .map(R.stat).join(''));

      /* testimonials */
      paint('[data-testimonials-head]', R.heading({
        kicker: h.testimonialsKicker, title: h.testimonialsTitle, accent: h.testimonialsAccent,
        body: h.testimonialsBody, centred: true, width: '46ch'
      }));
      paint('[data-testimonials]',
        PH.get.published(d.testimonials).slice(0, 3).map(R.testimonial).join(''));

      /* gallery */
      paint('[data-gallery-head]', R.heading({
        kicker: h.galleryKicker, title: h.galleryTitle, accent: h.galleryAccent,
        body: h.galleryBody, centred: true, width: '46ch'
      }));
      paint('[data-gallery]', PH.get.published(d.gallery).map(R.galleryTile).join(''));

      ctaSection(s);

      seo({
        title: 'India Travel & Tours — ' + s.businessName,
        description: (s.seo || {}).description,
        image: (s.seo || {}).ogImage
      });
    }).catch(fail);
  };

  /* index.html is the home page; accept either name. */
  PAGES.index = PAGES.home;

  /* ══════════════════════════════════════════════════════════════════════
     DESTINATIONS
     ══════════════════════════════════════════════════════════════════ */

  PAGES.destinations = function () {
    boot().then(function (d) {
      var s = d.settings, page = (s.pages || {}).destinations || {};

      paint('[data-page-hero]', R.pageHero(page, 'Destinations'));
      paint('[data-intro]', R.heading({
        kicker: page.kicker, title: page.headingTitle, accent: page.headingAccent, body: page.body
      }));

      var all = PH.get.published(d.destinations);
      var regions = PH.get.list('regions');
      var host = qs('[data-regions]');
      var state = { q: '', regionId: PH.param('region') || '' };

      /* Filter chips are generated from the regions that actually have
         published destinations — never hard-coded. */
      var chips = regions.filter(function (r) {
        return all.some(function (x) { return x.regionId === r.id; });
      });

      var bar = qs('[data-filters]');
      if (bar) {
        bar.innerHTML =
          '<div class="filter-bar reveal in">' +
            '<div class="chips" role="group" aria-label="Filter by state">' +
              '<button type="button" class="chip" data-region="">All states</button>' +
              chips.map(function (r) {
                return '<button type="button" class="chip" data-region="' + esc(r.id) + '">' +
                  rich(r.name) + '</button>';
              }).join('') +
            '</div>' +
            '<div class="search"><i class="bi bi-search"></i>' +
              '<label class="visually-hidden" for="destSearch">Search destinations</label>' +
              '<input id="destSearch" type="search" placeholder="Search a place…" ' +
              'value="' + esc(state.q) + '"></div>' +
          '</div>';

        qsa('[data-region]', bar).forEach(function (b) {
          b.addEventListener('click', function () {
            state.regionId = b.dataset.region;
            draw();
          });
        });
        qs('#destSearch', bar).addEventListener('input', PH.debounce(function (e) {
          state.q = e.target.value;
          draw();
        }, 180));
      }

      function draw() {
        qsa('[data-region]').forEach(function (b) {
          b.classList.toggle('is-on', b.dataset.region === state.regionId);
          b.setAttribute('aria-pressed', b.dataset.region === state.regionId ? 'true' : 'false');
        });

        var matched = PH.get.filterDestinations(all, state);

        if (!matched.length) {
          host.innerHTML = '<div class="container-x">' + R.emptyState(
            'No destinations match that',
            'Try a different state, or clear the search to see all ' + all.length + ' places.',
            '<button type="button" class="btn btn-outline-ink" data-clear>Clear filters</button>'
          ) + '</div>';
          qs('[data-clear]').addEventListener('click', function () {
            state.q = ''; state.regionId = '';
            var box = qs('#destSearch'); if (box) { box.value = ''; }
            draw();
          });
          FX.all(host);
          return;
        }

        /* Group into the same three state sections the page always had.
           A search across states collapses to one flat grid instead. */
        var groups = state.q
          ? [{ region: null, items: matched }]
          : regions.map(function (r) {
              return { region: r, items: matched.filter(function (x) { return x.regionId === r.id; }) };
            }).filter(function (g) { return g.items.length; });

        host.innerHTML = groups.map(function (g, gi) {
          var head = g.region
            ? '<div class="text-center center reveal" style="margin-bottom:44px">' +
                R.heading({
                  kicker: g.region.name,
                  title: g.region.sectionTitle || g.region.name,
                  body: g.region.blurb, centred: true, width: '52ch'
                }) +
              '</div>'
            : '<div class="text-center center reveal" style="margin-bottom:44px">' +
                R.heading({
                  kicker: 'Search results',
                  title: matched.length + ' place' + (matched.length === 1 ? '' : 's') + ' found',
                  centred: true
                }) +
              '</div>';

          return '<section class="section' + (gi % 2 ? ' bg-soft' : '') + '">' +
            '<div class="container-x">' + head +
            '<div class="row g-4">' + g.items.map(R.destinationCard).join('') + '</div>' +
            '</div></section>';
        }).join('');

        FX.all(host);
      }

      draw();
      ctaSection(s, {
        title: "Can't Decide?", accent: "We'll Help You Choose", titleAfter: '',
        body: 'Tell us how many days you have and what you love — beaches, temples, hills or ' +
          'wildlife — and our travel designers will shape the perfect South India route for you.',
        secondaryButton: 'See Sample Itineraries', secondaryButtonLink: 'packages.html'
      });

      seo({
        title: page.title + ' — ' + s.businessName,
        description: page.body,
        image: page.image
      });
    }).catch(fail);
  };

  /* ══════════════════════════════════════════════════════════════════════
     DESTINATION DETAILS
     ══════════════════════════════════════════════════════════════════ */

  PAGES['destination-details'] = function () {
    boot(['packages']).then(function (d) {
      var s = d.settings;
      var dest = PH.get.byId(PH.get.published(d.destinations), PH.param('id'));

      if (!dest) {
        paint('[data-page-hero]', R.pageHero(
          { title: 'Destination not found', image: (s.pages.destinations || {}).image },
          'Destinations'));
        paint('[data-body]', '<div class="container-x">' + R.emptyState(
          'We could not find that destination',
          'It may have been renamed or unpublished.',
          '<a class="btn btn-grad" href="destinations.html">Browse all destinations ' +
          '<i class="bi bi-arrow-right"></i></a>') + '</div>');
        ctaSection(s);
        seo({ title: 'Destination not found — ' + s.businessName });
        return;
      }

      paint('[data-page-hero]', R.pageHero(
        { title: dest.name, image: dest.image },
        'Destinations'));

      var trips = PH.get.published(d.packages).filter(function (p) {
        return p.destinationId === dest.id;
      });

      var facts = [];
      if (dest.region) { facts.push(['bi-geo-alt', 'Region', dest.region]); }
      if (dest.state) { facts.push(['bi-map', 'State', dest.state]); }
      if (dest.bestTime) { facts.push(['bi-calendar-check', 'Best time', dest.bestTime]); }
      if (dest.duration) { facts.push(['bi-clock', 'Suggested stay', dest.duration]); }

      paint('[data-body]',
        '<div class="container-x"><div class="row g-5">' +
          '<div class="col-lg-7 reveal">' +
            R.heading({ kicker: dest.state || 'Destination', title: 'About', accent: dest.name }) +
            '<div class="prose mt-3">' + PH.fmt.paras(dest.description, 'lead-soft') + '</div>' +
            R.galleryStrip(dest.gallery, dest.name) +
          '</div>' +
          '<div class="col-lg-5 reveal" data-d="1">' +
            '<div class="fact-card">' +
              '<h3>Trip facts</h3>' +
              facts.map(function (f) {
                return '<div class="fact"><i class="bi ' + f[0] + '"></i>' +
                  '<div><b>' + esc(f[1]) + '</b><span>' + rich(f[2]) + '</span></div></div>';
              }).join('') +
              '<a class="btn btn-grad w-100 mt-3" href="contact.html?destination=' +
                encodeURIComponent(dest.name) + '">Plan a trip here ' +
                '<i class="bi bi-arrow-right"></i></a>' +
            '</div>' +
          '</div>' +
        '</div></div>');

      var tripHost = qs('[data-trips]');
      if (tripHost) {
        if (trips.length) {
          tripHost.innerHTML = '<div class="container-x">' +
            '<div class="text-center center reveal" style="margin-bottom:48px">' +
              R.heading({
                kicker: 'Ready-made routes', title: 'Journeys that include',
                accent: dest.name, centred: true
              }) +
            '</div>' +
            '<div class="row g-4">' + trips.map(R.packageCard).join('') + '</div></div>';
        } else {
          tripHost.innerHTML = '<div class="container-x">' +
            '<div class="row g-4">' + R.emptyState(
              'No fixed package for ' + dest.name + ' yet',
              'We build these routes to order — tell us your dates and we will design one.',
              '<a class="btn btn-grad" href="contact.html?destination=' +
                encodeURIComponent(dest.name) + '">Plan a custom trip ' +
                '<i class="bi bi-arrow-right"></i></a>') + '</div></div>';
        }
        FX.all(tripHost);
      }

      ctaSection(s);
      seo({
        title: dest.name + ' — ' + s.businessName,
        description: dest.shortDescription || dest.description,
        image: dest.image
      });
    }).catch(fail);
  };

  /* ══════════════════════════════════════════════════════════════════════
     PACKAGES
     ══════════════════════════════════════════════════════════════════ */

  PAGES.packages = function () {
    boot(['packages']).then(function (d) {
      var s = d.settings, page = (s.pages || {}).packages || {};

      paint('[data-page-hero]', R.pageHero(page, 'Packages'));
      paint('[data-intro]', R.heading({
        kicker: page.kicker, title: page.headingTitle, accent: page.headingAccent,
        body: page.body, centred: true, width: '52ch'
      }));

      var all = PH.get.published(d.packages);
      var host = qs('[data-packages]');
      var state = {
        q: '',
        categoryId: PH.param('category') || '',
        destinationId: PH.param('destination') || ''
      };

      /* Only offer categories that actually have published packages. */
      var cats = PH.get.list('categories').filter(function (c) {
        return all.some(function (p) { return p.categoryId === c.id; });
      });

      var bar = qs('[data-filters]');
      if (bar) {
        bar.innerHTML =
          '<div class="filter-bar reveal in">' +
            '<div class="chips" role="group" aria-label="Filter by trip style">' +
              '<button type="button" class="chip" data-cat="">All styles</button>' +
              cats.map(function (c) {
                return '<button type="button" class="chip" data-cat="' + esc(c.id) + '">' +
                  rich(c.name) + '</button>';
              }).join('') +
            '</div>' +
            '<div class="search"><i class="bi bi-search"></i>' +
              '<label class="visually-hidden" for="pkgSearch">Search packages</label>' +
              '<input id="pkgSearch" type="search" placeholder="Search a journey…"></div>' +
          '</div>';

        qsa('[data-cat]', bar).forEach(function (b) {
          b.addEventListener('click', function () { state.categoryId = b.dataset.cat; draw(); });
        });
        qs('#pkgSearch', bar).addEventListener('input', PH.debounce(function (e) {
          state.q = e.target.value; draw();
        }, 180));
      }

      function draw() {
        qsa('[data-cat]').forEach(function (b) {
          b.classList.toggle('is-on', b.dataset.cat === state.categoryId);
          b.setAttribute('aria-pressed', b.dataset.cat === state.categoryId ? 'true' : 'false');
        });

        var matched = PH.get.filterPackages(all, state);
        host.innerHTML = matched.length
          ? matched.map(R.packageCard).join('')
          : R.emptyState(
              'No packages match that',
              'Every itinerary is customisable — tell us what you had in mind and we will build it.',
              '<a class="btn btn-grad" href="contact.html">Ask for a custom itinerary ' +
              '<i class="bi bi-arrow-right"></i></a>');
        FX.all(host);
      }

      draw();

      paint('[data-promise-head]', R.heading({
        kicker: page.promiseKicker, title: page.promiseTitle, accent: page.promiseAccent
      }));
      paint('[data-promise]', (page.features || []).map(function (f, i) {
        return R.feature(f, i);
      }).join(''));

      ctaSection(s, {
        title: 'Want a Custom', accent: 'Itinerary &amp; Quote?', titleAfter: '',
        body: "Share your dates and interests and we'll send a tailored South India plan with " +
          'full pricing within one business day.',
        primaryButton: 'Get a Quote',
        secondaryButton: 'Browse Destinations', secondaryButtonLink: 'destinations.html'
      });

      seo({
        title: page.title + ' — ' + s.businessName,
        description: page.body,
        image: page.image
      });
    }).catch(fail);
  };

  /* ══════════════════════════════════════════════════════════════════════
     PACKAGE DETAILS
     ══════════════════════════════════════════════════════════════════ */

  PAGES['package-details'] = function () {
    boot(['packages', 'testimonials']).then(function (d) {
      var s = d.settings;
      var all = PH.get.published(d.packages);
      var p = PH.get.byId(all, PH.param('id'));

      if (!p) {
        paint('[data-page-hero]', R.pageHero(
          { title: 'Package not found', image: (s.pages.packages || {}).image }, 'Packages'));
        paint('[data-body]', '<div class="container-x">' + R.emptyState(
          'We could not find that package',
          'It may have been renamed or unpublished.',
          '<a class="btn btn-grad" href="packages.html">See all packages ' +
          '<i class="bi bi-arrow-right"></i></a>') + '</div>');
        ctaSection(s);
        seo({ title: 'Package not found — ' + s.businessName });
        return;
      }

      var dest = PH.get.destination(p.destinationId);
      var cat = PH.get.label(p.categoryId, '');

      paint('[data-page-hero]', R.pageHero({ title: p.name, image: p.image }, 'Packages'));

      var price = '';
      if (p.showPrice && Number(p.price) > 0) {
        price = '<div class="price"><b>' + PH.fmt.money(p.price) + '</b>' +
          (Number(p.originalPrice) > Number(p.price)
            ? '<s>' + PH.fmt.money(p.originalPrice) + '</s>' : '') +
          '<small>per person</small></div>';
      } else {
        price = '<div class="price"><b>' + rich(p.priceNote || 'Enquire for pricing') + '</b>' +
          '<small>tailored, all-in quote</small></div>';
      }

      var facts = [];
      if (p.duration) { facts.push(['bi-clock', 'Duration', p.duration]); }
      if (p.guests) { facts.push(['bi-people', 'Group size', p.guests]); }
      if (dest) { facts.push(['bi-geo-alt', 'Destination', dest.name]); }
      if (cat) { facts.push(['bi-tag', 'Trip style', cat]); }
      if (p.bookingStatus) {
        facts.push(['bi-calendar-check', 'Availability',
          PH.get.label(p.bookingStatus, p.bookingStatus)]);
      }
      if (p.seatsLeft != null && p.seatsLeft !== '') {
        facts.push(['bi-person-check', 'Seats left', String(p.seatsLeft)]);
      }

      paint('[data-body]',
        '<div class="container-x"><div class="row g-5">' +
          '<div class="col-lg-7 reveal">' +
            R.heading({ kicker: cat || 'Itinerary', title: 'About this', accent: 'journey' }) +
            '<div class="prose mt-3">' + PH.fmt.paras(p.description, 'lead-soft') + '</div>' +
            ((p.highlights || []).length
              ? '<h3 class="sub-title mt-4">Trip highlights</h3>' + R.highlightList(p.highlights)
              : '') +
            R.galleryStrip(p.gallery, p.name) +
          '</div>' +
          '<div class="col-lg-5 reveal" data-d="1">' +
            '<div class="fact-card">' + price +
              facts.map(function (f) {
                return '<div class="fact"><i class="bi ' + f[0] + '"></i>' +
                  '<div><b>' + esc(f[1]) + '</b><span>' + rich(f[2]) + '</span></div></div>';
              }).join('') +
              '<a class="btn btn-grad w-100 mt-3" href="contact.html?package=' +
                encodeURIComponent(p.id) + '">Enquire about this trip ' +
                '<i class="bi bi-arrow-right"></i></a>' +
              (s.whatsapp
                ? '<a class="btn btn-outline-ink w-100 mt-2" target="_blank" rel="noopener" ' +
                  'href="https://wa.me/' + esc(String(s.whatsapp).replace(/[^\d]/g, '')) +
                  '?text=' + encodeURIComponent('Hi, I would like to know more about ' + p.name) +
                  '">Ask on WhatsApp <i class="bi bi-whatsapp"></i></a>'
                : '') +
            '</div>' +
          '</div>' +
        '</div></div>');

      /* itinerary */
      var itinHost = qs('[data-itinerary]');
      if (itinHost && (p.itinerary || []).length) {
        itinHost.innerHTML = '<div class="container-x">' +
          '<div class="text-center center reveal" style="margin-bottom:48px">' +
            R.heading({
              kicker: 'Day by day', title: 'The', accent: 'Itinerary',
              body: 'A starting point — every day can be reshaped around your pace.',
              centred: true, width: '46ch'
            }) +
          '</div>' + R.itinerary(p.itinerary) + '</div>';
        FX.all(itinHost);
      } else if (itinHost) {
        itinHost.remove();
      }

      /* inclusions / exclusions */
      var incHost = qs('[data-inclusions]');
      if (incHost && ((p.inclusions || []).length || (p.exclusions || []).length)) {
        incHost.innerHTML = '<div class="container-x"><div class="row g-4">' +
          ((p.inclusions || []).length
            ? '<div class="col-lg-6 reveal"><div class="incl-card">' +
              '<h3><i class="bi bi-check-circle"></i> What\'s included</h3>' +
              R.tickList(p.inclusions, 'in') + '</div></div>' : '') +
          ((p.exclusions || []).length
            ? '<div class="col-lg-6 reveal" data-d="1"><div class="incl-card incl-card--out">' +
              '<h3><i class="bi bi-x-circle"></i> Not included</h3>' +
              R.tickList(p.exclusions, 'out') + '</div></div>' : '') +
          '</div></div>';
        FX.all(incHost);
      } else if (incHost) {
        incHost.remove();
      }

      /* related packages */
      var relHost = qs('[data-related]');
      if (relHost) {
        var related = all.filter(function (x) {
          return x.id !== p.id &&
            (x.categoryId === p.categoryId || x.destinationId === p.destinationId);
        }).slice(0, 4);
        if (!related.length) {
          related = all.filter(function (x) { return x.id !== p.id; }).slice(0, 4);
        }
        if (related.length) {
          relHost.innerHTML = '<div class="container-x">' +
            '<div class="text-center center reveal" style="margin-bottom:48px">' +
              R.heading({ kicker: 'Keep looking', title: 'You may also', accent: 'like', centred: true }) +
            '</div><div class="row g-4">' + related.map(R.packageCard).join('') + '</div></div>';
          FX.all(relHost);
        } else { relHost.remove(); }
      }

      ctaSection(s);
      seo({
        title: p.name + ' — ' + s.businessName,
        description: p.shortDescription,
        image: p.image
      });
    }).catch(fail);
  };

  /* ══════════════════════════════════════════════════════════════════════
     ADVENTURES
     ══════════════════════════════════════════════════════════════════ */

  PAGES.adventures = function () {
    boot(['adventures']).then(function (d) {
      var s = d.settings, page = (s.pages || {}).adventures || {};

      paint('[data-page-hero]', R.pageHero(page, 'Adventures'));
      paint('[data-intro]', R.heading({
        kicker: page.kicker, title: page.headingTitle, accent: page.headingAccent,
        body: page.body, centred: true, width: '46ch'
      }));
      paint('[data-adventures]', PH.get.published(d.adventures).map(R.adventureCard).join(''));
      paint('[data-stats]', (s.stats || []).filter(function (x) { return x.enabled !== false; })
        .map(R.stat).join(''));

      ctaSection(s, { image: 'images/dandeli.jpg' });

      seo({
        title: page.title + ' — ' + s.businessName,
        description: page.body,
        image: page.image
      });
    }).catch(fail);
  };

  /* ══════════════════════════════════════════════════════════════════════
     ABOUT
     ══════════════════════════════════════════════════════════════════ */

  PAGES.about = function () {
    boot(['testimonials']).then(function (d) {
      var s = d.settings, page = (s.pages || {}).about || {};

      paint('[data-page-hero]', R.pageHero(page, 'About Us'));

      paint('[data-story]',
        '<div class="col-lg-6 reveal"><div class="frame">' +
          '<img src="' + esc(PH.img(page.storyImage)) + '" alt="' + esc(s.businessName) + '">' +
          '<div class="badge"><span class="num">' + rich(page.badgeNumber) + '</span>' +
          '<span class="lbl">' + rich(page.badgeLabel) + '</span></div></div></div>' +
        '<div class="col-lg-6 reveal" data-d="1">' +
          R.heading({ kicker: page.storyKicker, title: page.storyTitle, accent: page.storyAccent }) +
          '<div class="mt-3">' + PH.fmt.paras(page.storyBody, 'lead-soft') + '</div>' +
          '<div class="mt-4">' + (page.skills || []).map(R.skill).join('') + '</div>' +
        '</div>');

      paint('[data-trust-head]', R.heading({
        kicker: page.trustKicker, title: page.trustTitle, accent: page.trustAccent
      }));
      paint('[data-trust]', (page.features || []).map(function (f, i) {
        return R.feature(f, i);
      }).join(''));

      paint('[data-stats]', (page.stats || s.stats || [])
        .filter(function (x) { return x.enabled !== false; }).map(R.stat).join(''));

      paint('[data-team-head]', R.heading({
        kicker: page.teamKicker, title: page.teamTitle, accent: page.teamAccent
      }));
      paint('[data-team]', (page.team || []).map(R.teamCard).join(''));

      paint('[data-testimonials-head]', R.heading({
        kicker: (s.home || {}).testimonialsKicker || 'Traveller Stories',
        title: (s.home || {}).testimonialsTitle || 'Loved by',
        accent: (s.home || {}).testimonialsAccent || 'Adventurers'
      }));
      paint('[data-testimonials]',
        PH.get.published(d.testimonials).slice(0, 3).map(R.testimonial).join(''));

      ctaSection(s);

      seo({
        title: page.title + ' — ' + s.businessName,
        description: String(page.storyBody || '').split('\n')[0],
        image: page.image
      });
    }).catch(fail);
  };

  /* ══════════════════════════════════════════════════════════════════════
     CONTACT
     ══════════════════════════════════════════════════════════════════ */

  PAGES.contact = function () {
    boot(['packages', 'faqs']).then(function (d) {
      var s = d.settings, page = (s.pages || {}).contact || {};

      paint('[data-page-hero]', R.pageHero(page, 'Contact'));

      /* Left column — the info cards, straight from settings. */
      paint('[data-info]',
        R.heading({ kicker: page.kicker, title: page.headingTitle, accent: page.headingAccent }) +
        '<p class="lead-soft mt-3 mb-4">' + rich(page.body) + '</p>' +
        (s.address ? R.infoCard('bi-geo-alt', 'Visit Us', s.address) : '') +
        (s.email ? R.infoCard('bi-envelope', 'Email Us', s.email, 'mailto:' + s.email) : '') +
        (s.phone ? R.infoCard('bi-telephone', 'Call Us', s.phone,
          'tel:' + String(s.phone).replace(/[^\d+]/g, '')) : '') +
        (s.officeHours ? R.infoCard('bi-clock', 'Opening Hours', s.officeHours) : ''));

      /* Right column — the enquiry form. Options come from the data. */
      var pubPkg = PH.get.published(d.packages);
      var dests = PH.get.published(d.destinations);
      var styles = PH.get.list('travelStyles');

      var formHost = qs('[data-form]');
      formHost.innerHTML =
        '<form class="contact-form" id="contactForm" novalidate>' +
          '<div class="row g-3">' +
            '<div class="col-md-6"><label class="form-label" for="fName">Full Name</label>' +
              '<input class="form-control" id="fName" name="name" required ' +
              'placeholder="Your name" autocomplete="name"><div class="err"></div></div>' +
            '<div class="col-md-6"><label class="form-label" for="fEmail">Email</label>' +
              '<input type="email" class="form-control" id="fEmail" name="email" required ' +
              'placeholder="you@email.com" autocomplete="email"><div class="err"></div></div>' +
            '<div class="col-md-6"><label class="form-label" for="fPhone">Phone</label>' +
              '<input class="form-control" id="fPhone" name="phone" placeholder="+91…" ' +
              'autocomplete="tel"><div class="err"></div></div>' +
            '<div class="col-md-6"><label class="form-label" for="fDest">Destination</label>' +
              '<input class="form-control" id="fDest" name="destination" list="destList" ' +
              'placeholder="e.g. Hampi, Coorg">' +
              '<datalist id="destList">' + dests.map(function (x) {
                return '<option value="' + esc(x.name) + '"></option>';
              }).join('') + '</datalist></div>' +
            '<div class="col-md-6"><label class="form-label" for="fPkg">Package</label>' +
              '<select class="form-select" id="fPkg" name="package">' +
                '<option value="">Not sure yet</option>' +
                pubPkg.map(function (x) {
                  return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>';
                }).join('') +
                '<option value="custom">Something custom</option>' +
              '</select></div>' +
            '<div class="col-md-6"><label class="form-label" for="fStyle">Travel Style</label>' +
              '<select class="form-select" id="fStyle" name="travelStyle">' +
                styles.map(function (x) {
                  return '<option value="' + esc(x.name) + '">' + esc(x.name) + '</option>';
                }).join('') +
              '</select></div>' +
            '<div class="col-md-6"><label class="form-label" for="fDate">Travel Date</label>' +
              '<input type="date" class="form-control" id="fDate" name="travelDate"></div>' +
            '<div class="col-md-6"><label class="form-label" for="fPax">Number of Travellers</label>' +
              '<input type="number" min="1" max="60" class="form-control" id="fPax" ' +
              'name="travellers" placeholder="2"></div>' +
            '<div class="col-12"><label class="form-label" for="fMsg">Tell us about your dream trip</label>' +
              '<textarea class="form-control" id="fMsg" name="message" rows="5" ' +
              'placeholder="Where in South India do you want to wander?"></textarea></div>' +
            '<div class="col-12"><button type="submit" class="btn btn-grad" data-submit>' +
              'Send Enquiry <i class="bi bi-send"></i></button>' +
              '<div id="formOk" style="display:none;color:var(--blue-deep);font-weight:500;' +
              'margin-top:14px"><i class="bi bi-check-circle-fill"></i> ' +
              rich(page.successMessage) + '</div></div>' +
          '</div>' +
        '</form>' +
        (s.googleMaps
          ? '<div class="frame mt-4" style="border-radius:18px">' +
            '<iframe title="Map showing our office" src="' + esc(s.googleMaps) +
            '" loading="lazy" style="width:100%;height:280px;border:0;display:block"></iframe></div>'
          : '');

      /* Deep links: contact.html?package=… or ?destination=… preselect. */
      var wantPkg = PH.param('package');
      if (wantPkg) {
        var sel = qs('#fPkg');
        if (Array.prototype.some.call(sel.options, function (o) { return o.value === wantPkg; })) {
          sel.value = wantPkg;
        }
      }
      var wantDest = PH.param('destination');
      if (wantDest) { qs('#fDest').value = wantDest; }

      var dateBox = qs('#fDate');
      if (dateBox) { dateBox.min = new Date().toISOString().slice(0, 10); }

      wireForm(qs('#contactForm'), s, pubPkg);

      /* FAQs */
      var faqHost = qs('[data-faqs]');
      var faqs = PH.get.published(d.faqs);
      if (faqHost && faqs.length) {
        faqHost.innerHTML = '<div class="container-x">' +
          '<div class="text-center center reveal" style="margin-bottom:48px">' +
            R.heading({
              kicker: 'Before you write', title: 'Frequently asked',
              accent: 'questions', centred: true
            }) +
          '</div><div class="faq-list">' + faqs.map(R.faqItem).join('') + '</div></div>';
        FX.all(faqHost);
      } else if (faqHost) {
        faqHost.remove();
      }

      FX.all(formHost);

      seo({
        title: page.title + ' — ' + s.businessName,
        description: page.body,
        image: page.image
      });
    }).catch(fail);
  };

  /* ── Enquiry submission ─────────────────────────────────────────────── */

  function wireForm(form, s, packages) {
    if (!form) { return; }
    var ok = qs('#formOk');
    var btn = qs('[data-submit]', form);

    function setError(input, msg) {
      var box = input.parentNode.querySelector('.err');
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (box) {
        box.textContent = msg || '';
        box.classList.toggle('show', !!msg);
      }
      return !msg;
    }

    function validate() {
      var good = true;
      var name = qs('#fName'), email = qs('#fEmail'), phone = qs('#fPhone');

      good = setError(name, name.value.trim() ? '' : 'Please tell us your name.') && good;
      good = setError(email,
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())
          ? '' : 'That does not look like an email address.') && good;
      good = setError(phone,
        !phone.value.trim() || phone.value.replace(/[^\d]/g, '').length >= 8
          ? '' : 'That does not look like a phone number.') && good;

      return good;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) {
        var bad = qs('[aria-invalid="true"]', form);
        if (bad) { bad.focus(); }
        return;
      }

      var data = Object.fromEntries(new FormData(form).entries());
      var chosen = packages.filter(function (p) { return p.id === data.package; })[0];

      var payload = {
        id: PH.fmt.id('enq'),
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        destination: data.destination || '',
        packageId: data.package || '',
        packageName: chosen ? chosen.name
          : (data.package === 'custom' ? 'Something custom' : 'Undecided'),
        travelStyle: data.travelStyle || '',
        travelDate: data.travelDate || '',
        travellers: data.travellers || '',
        message: data.message || '',
        source: location.pathname,
        receivedAt: new Date().toISOString(),
        status: 'new'
      };

      btn.disabled = true;
      var original = btn.innerHTML;
      btn.innerHTML = 'Sending…';

      saveEnquiry(payload, s).then(function () {
        form.reset();
        ok.style.display = 'block';
        ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.disabled = false;
        btn.innerHTML = original;
      }).catch(function (err) {
        console.error(err);
        btn.disabled = false;
        btn.innerHTML = original;
        ok.style.display = 'block';
        ok.innerHTML = '<i class="bi bi-exclamation-circle-fill"></i> That did not send. ' +
          'Please call or WhatsApp us instead and we will pick it up straight away.';
      });
    });
  }

  /**
   * Where an enquiry goes.
   *
   * A static site cannot write to its own JSON, so there are two honest
   * paths and no pretending:
   *   1. settings.enquiry.endpoint is set  → POST it there (Formspree, an
   *      Apps Script, a serverless function). This is the production path.
   *   2. nothing configured               → keep it in this browser's
   *      localStorage. The admin reads that key and pulls it into the
   *      inbox, which is what makes the local demo genuinely work.
   */
  function saveEnquiry(payload, s) {
    var LOCAL = 'ph.enquiries.v1';
    var endpoint = (s.enquiry && s.enquiry.endpoint) || '';

    function stash() {
      try {
        var raw = JSON.parse(localStorage.getItem(LOCAL) || '[]');
        raw.unshift(payload);
        localStorage.setItem(LOCAL, JSON.stringify(raw.slice(0, 200)));
      } catch (e) { /* private mode — the endpoint path is the real one */ }
    }

    if (!endpoint) {
      stash();
      return Promise.resolve({ local: true });
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) { throw new Error('The form endpoint returned ' + r.status); }
      stash();          // keep a local copy too, so the admin still sees it
      return { local: false };
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     Dispatch
     ══════════════════════════════════════════════════════════════════ */

  function start() {
    if (PH.fileProtocolCheck()) { return; }
    var page = document.body.dataset.page;
    if (!page) { return; }
    if (PAGES[page]) { PAGES[page](); return; }
    /* Failing silently here cost real debugging time once. Say so. */
    console.warn('[PH] No controller for data-page="' + page + '". ' +
      'Known pages: ' + Object.keys(PAGES).join(', '));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
}());
