/* ============================================================================
   PRITHVI HOLIDAYS — RENDER
   ----------------------------------------------------------------------------
   Every function here rebuilds a piece of the ORIGINAL travel website markup
   from JSON. The class names, element order, Bootstrap grid columns and the
   `data-d` stagger indices are all reproduced exactly as they were authored,
   so css/style.css and the existing animations keep working untouched.

   If you change a class name here you are changing the design. Don't.
   ========================================================================= */
window.R = (function () {
  'use strict';

  var esc = PH.fmt.esc, rich = PH.fmt.rich, bg = PH.bg, img = PH.img;

  /* Cards were authored with data-d cycling 0,1,2 (or 0..3 for four-up rows)
     to stagger the reveal. Reproduce that rhythm. */
  function d(i, cycle) { return i % (cycle || 3); }

  var STARS = '&#9733;&#9733;&#9733;&#9733;&#9733;';

  function stars(n) {
    var count = Math.max(0, Math.min(5, Number(n) || 5));
    var out = '';
    for (var i = 0; i < count; i++) { out += '&#9733;'; }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     NAVBAR + FOOTER — shared chrome, driven by settings
     ══════════════════════════════════════════════════════════════════ */

  function navbar(s, active) {
    var links = (s.nav || []).map(function (n) {
      var on = n.href === active ? 'active' : '';
      return '<a href="' + esc(n.href) + '" class="' + on + '">' + rich(n.label) + '</a>';
    }).join('');

    var cta = s.navCta && s.navCta.label
      ? '<a href="' + esc(s.navCta.href || 'contact.html') + '" class="nav-cta">' +
        rich(s.navCta.label) + '</a>'
      : '';

    return '' +
      '<div class="nav-shell">' +
        '<a href="index.html" class="brand">' +
          '<img src="' + esc(img(s.logo)) + '" alt="' + esc(s.businessName) + '" class="nav-logo">' +
        '</a>' +
        '<div class="nav-menu">' + links + cta + '</div>' +
        '<button class="nav-toggle" aria-label="Menu"><span></span><span></span><span></span></button>' +
      '</div>';
  }

  function socials(s) {
    var out = '';
    if (s.instagram) { out += '<a href="' + esc(s.instagram) + '" aria-label="Instagram"><i class="bi bi-instagram"></i></a>'; }
    if (s.facebook) { out += '<a href="' + esc(s.facebook) + '" aria-label="Facebook"><i class="bi bi-facebook"></i></a>'; }
    if (s.twitter) { out += '<a href="' + esc(s.twitter) + '" aria-label="X"><i class="bi bi-twitter-x"></i></a>'; }
    if (s.youtube) { out += '<a href="' + esc(s.youtube) + '" aria-label="YouTube"><i class="bi bi-youtube"></i></a>'; }
    return out;
  }

  function footer(s, destinations) {
    var f = s.footer || {};

    var quick = (s.nav || []).filter(function (n) { return n.href !== 'index.html'; })
      .map(function (n) { return '<a href="' + esc(n.href) + '">' + rich(n.label) + '</a>'; })
      .join('');

    /* "Top Places" are stored as destination names so they keep working as
       deep links even after a destination is renamed in the admin. */
    var places = (f.topPlaces || []).map(function (name) {
      var hit = (destinations || []).filter(function (x) { return x.name === name; })[0];
      var href = hit ? 'destination-details.html?id=' + encodeURIComponent(hit.id) : 'destinations.html';
      var short = hit ? (hit.name.split(',')[0]) : name;
      return '<a href="' + esc(href) + '">' + esc(short) + '</a>';
    }).join('');

    return '' +
      '<div class="container-x">' +
        '<div class="row g-5">' +
          '<div class="col-lg-4 col-md-6">' +
            '<div class="brand"><img src="' + esc(img(s.logo)) + '" alt="' + esc(s.businessName) +
              '" class="footer-logo"></div>' +
            '<p class="about">' + rich(f.about) + '</p>' +
            '<div class="socials">' + socials(s) + '</div>' +
          '</div>' +
          '<div class="col-lg-2 col-md-6 col-6">' +
            '<h5>Quick Links</h5><div class="foot-links">' + quick + '</div>' +
          '</div>' +
          '<div class="col-lg-2 col-md-6 col-6">' +
            '<h5>Top Places</h5><div class="foot-links">' + places + '</div>' +
          '</div>' +
          '<div class="col-lg-4 col-md-6 news">' +
            '<h5>' + rich(f.newsletterTitle || 'Stay in the Know') + '</h5>' +
            '<p class="about mb-3">' + rich(f.newsletterBody) + '</p>' +
            '<div class="field"><label class="visually-hidden" for="newsEmail">Your email address</label>' +
              '<input type="email" id="newsEmail" placeholder="Your email address">' +
              '<button id="newsBtn" type="button">Join</button></div>' +
            '<div class="ok" id="newsOk">Welcome aboard — check your inbox &#10022;</div>' +
            '<div class="foot-contact mt-4">' +
              (s.address ? '<div><i class="bi bi-geo-alt"></i> ' + rich(s.address) + '</div>' : '') +
              (s.email ? '<div><i class="bi bi-envelope"></i> <a href="mailto:' + esc(s.email) + '">' +
                esc(s.email) + '</a></div>' : '') +
              (s.phone ? '<div><i class="bi bi-telephone"></i> <a href="tel:' +
                esc(String(s.phone).replace(/[^\d+]/g, '')) + '">' + rich(s.phone) + '</a></div>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="foot-bottom">' +
          '<span>&copy; <span id="year">' + new Date().getFullYear() + '</span> ' +
            esc(s.businessName) + '. All rights reserved.</span>' +
          '<span>' + rich((s.footer || {}).legal) + '</span>' +
        '</div>' +
      '</div>';
  }

  /** The floating WhatsApp button, only when a number is configured. */
  function whatsapp(s) {
    var num = String(s.whatsapp || '').replace(/[^\d]/g, '');
    if (!num) { return ''; }
    return '<a href="https://wa.me/' + esc(num) + '" class="whatsapp-float" target="_blank" ' +
      'rel="noopener" aria-label="Chat on WhatsApp">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="28" height="28" fill="#fff">' +
      '<path d="M24 4C13 4 4 13 4 24c0 3.6 1 7 2.7 9.9L4 44l10.4-2.7C17.1 43 20.5 44 24 44c11 0 20-9 ' +
      '20-20S35 4 24 4zm0 36c-3.1 0-6.1-.8-8.7-2.4l-.6-.4-6.2 1.6 1.7-6-.4-.6C8.8 30.1 8 27.1 8 24 8 ' +
      '15.2 15.2 8 24 8s16 7.2 16 16-7.2 16-16 16zm8.8-11.8c-.5-.2-2.8-1.4-3.2-1.5-.4-.2-.7-.2-1 ' +
      '.2-.3.4-1.2 1.5-1.5 1.9-.3.3-.5.4-1 .1-.5-.2-2-.7-3.8-2.3-1.4-1.2-2.3-2.8-2.6-3.2-.3-.5 ' +
      '0-.7.2-1 .2-.2.5-.5.7-.8.2-.3.3-.5.4-.8.1-.3 0-.6-.1-.8-.1-.2-1-2.5-1.4-3.4-.4-.9-.7-.8-1-.8h-.9c-.3 ' +
      '0-.8.1-1.2.6-.4.5-1.6 1.5-1.6 3.8 0 2.2 1.6 4.4 1.9 4.7.2.3 3.1 4.8 7.6 6.7 1.1.5 1.9.7 2.6.9 ' +
      '1.1.3 2.1.3 2.9.2.9-.1 2.8-1.1 3.2-2.2.4-1.1.4-2 .3-2.2-.2-.2-.5-.3-1-.5z"/></svg></a>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     HERO — the home carousel, slides driven by settings.hero.images
     ══════════════════════════════════════════════════════════════════ */

  function hero(s) {
    var h = s.hero || {};
    var images = (h.images || []).filter(Boolean);
    if (!images.length) { images = ['']; }
    var interval = Number(h.interval) || 5000;

    var slides = images.map(function (src, i) {
      return '<div class="carousel-item ' + (i === 0 ? 'active' : '') + '" data-bs-interval="' +
        interval + '"><div class="hero-slide" style="' + bg(src) + '"></div></div>';
    }).join('');

    var dots = images.map(function (src, i) {
      return '<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="' + i +
        '" class="' + (i === 0 ? 'active' : '') + '" style="' + bg(src) +
        '" aria-label="Slide ' + (i + 1) + '"></button>';
    }).join('');

    /* One slide needs no controls or dots — showing them would be a dead UI. */
    var controls = images.length > 1
      ? '<button class="carousel-control-prev" type="button" data-bs-target="#heroCarousel" ' +
        'data-bs-slide="prev"><span class="ctrl"><i class="bi bi-chevron-left"></i></span></button>' +
        '<button class="carousel-control-next" type="button" data-bs-target="#heroCarousel" ' +
        'data-bs-slide="next"><span class="ctrl"><i class="bi bi-chevron-right"></i></span></button>'
      : '';

    var title = rich(h.title || '');
    if (h.accent) { title += ' <em>' + rich(h.accent) + '</em>'; }

    var buttons = '';
    if (h.primaryButton) {
      buttons += '<a href="' + esc(h.primaryButtonLink || 'destinations.html') +
        '" class="btn btn-grad">' + rich(h.primaryButton) + ' <i class="bi bi-arrow-right"></i></a>';
    }
    if (h.secondaryButton) {
      buttons += '<a href="' + esc(h.secondaryButtonLink || 'contact.html') +
        '" class="btn btn-ghost-light">' + rich(h.secondaryButton) + ' <i class="bi bi-geo-alt"></i></a>';
    }

    return '' +
      '<div id="heroCarousel" class="carousel slide carousel-fade"' +
        (images.length > 1 ? ' data-bs-ride="carousel"' : '') + '>' +
        '<div class="carousel-inner">' + slides + '</div>' + controls +
      '</div>' +
      '<div class="hero-overlay"></div>' +
      '<div class="hero-content"><div class="container-x">' +
        (h.tag ? '<span class="hero-tag"><span class="pin"></span>' + rich(h.tag) + '</span>' : '') +
        '<h1>' + title + '</h1>' +
        '<p>' + rich(h.subtitle) + '</p>' +
        '<div class="d-flex gap-3 flex-wrap">' + buttons + '</div>' +
      '</div></div>' +
      (images.length > 1 ? '<div class="carousel-indicators hero-indicators">' + dots + '</div>' : '') +
      '<div class="scroll-cue"><div class="mouse"></div>Scroll</div>';
  }

  /** The shorter hero used by every inner page. */
  function pageHero(page, crumb) {
    return '' +
      '<div class="bg" style="' + bg(page.image) + '"></div>' +
      '<div class="inner"><div class="container-x reveal in">' +
        '<h1>' + rich(page.title) + '</h1>' +
        '<div class="crumb"><a href="index.html">Home</a> / ' + esc(crumb) + '</div>' +
      '</div></div>';
  }

  /** A section heading block: kicker, title with accent, optional body. */
  function heading(o) {
    var out = '';
    if (o.kicker) { out += '<span class="kicker">' + rich(o.kicker) + '</span>'; }
    out += '<h2 class="sec-title">' + rich(o.title) +
      (o.accent ? ' <em>' + rich(o.accent) + '</em>' : '') + '</h2>';
    if (o.body) {
      out += '<p class="lead-soft mt-3' + (o.centred ? ' mx-auto' : '') + '"' +
        (o.width ? ' style="max-width:' + o.width + '"' : '') + '>' + rich(o.body) + '</p>';
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     CARDS
     ══════════════════════════════════════════════════════════════════ */

  /** A destination card. Links through to the destination detail page. */
  function destinationCard(dest, i) {
    return '' +
      '<div class="col-lg-4 col-md-6"><a class="dest-card reveal" data-d="' + d(i) +
        '" href="destination-details.html?id=' + encodeURIComponent(dest.id) + '">' +
        '<div class="ph" style="' + bg(dest.image) + '"></div>' +
        '<div class="meta">' +
          '<div class="region">' + rich(dest.region) + '</div><h3>' + rich(dest.name) + '</h3>' +
          '<div class="row"><span class="go">Plan this trip <i class="bi bi-arrow-right"></i></span>' +
          '<span class="stars">' + STARS + '</span></div>' +
        '</div></a></div>';
  }

  /** The taller region card on the home page. */
  function regionCard(region, i, count) {
    var caption = region.homeCaption || (count + '+ destinations');
    return '' +
      '<div class="col-lg-4 col-md-6"><a class="dest-card reveal" data-d="' + d(i) +
        '" href="destinations.html?region=' + encodeURIComponent(region.id) +
        '" style="min-height:340px">' +
        '<div class="ph" style="' + bg(region.homeImage || region.image) + '"></div>' +
        '<div class="meta">' +
          '<div class="region">' + rich(caption) + '</div><h3>' + rich(region.name) + '</h3>' +
          '<div class="row"><span class="go">Explore ' + rich(region.name) +
          ' <i class="bi bi-arrow-right"></i></span></div>' +
        '</div></a></div>';
  }

  /** A package card. */
  function packageCard(p, i) {
    var tag = PH.get.label(p.categoryId, '');
    var price = '';
    if (p.showPrice && Number(p.price) > 0) {
      price = PH.fmt.money(p.price);
      if (Number(p.originalPrice) > Number(p.price)) {
        price += ' <s>' + PH.fmt.money(p.originalPrice) + '</s>';
      }
    }

    return '' +
      '<div class="col-lg-3 col-md-6"><div class="pkg-card reveal" data-d="' + d(i, 4) + '">' +
        '<div class="img"><div class="ph" style="' + bg(p.image) + '"></div>' +
          (tag ? '<span class="tag">' + rich(tag) + '</span>' : '') + '</div>' +
        '<div class="body">' +
          '<h3>' + rich(p.name) + '</h3><p>' + rich(p.shortDescription) + '</p>' +
          '<div class="meta-row"><span><i class="bi bi-clock"></i>' + rich(p.duration) + '</span>' +
          '<span><i class="bi bi-people"></i>' + rich(p.guests || '2+ Guests') + '</span></div>' +
          '<div class="ft"><span class="enq">' + (price || rich(p.priceNote || 'Enquire for pricing')) + '</span>' +
          '<a href="package-details.html?id=' + encodeURIComponent(p.id) +
          '" aria-label="View ' + esc(p.name) + '"><i class="bi bi-arrow-right"></i></a></div>' +
        '</div></div></div>';
  }

  /** An adventure card. */
  function adventureCard(a, i) {
    return '' +
      '<div class="col-lg-4 col-md-6"><div class="adv-card reveal" data-d="' + d(i) + '">' +
        '<div class="ph" style="' + bg(a.image) + '"></div>' +
        '<div class="meta"><div class="ic"><i class="' + esc(a.icon || 'bi bi-compass') + '"></i></div>' +
        '<h3>' + rich(a.name) + '</h3><p>' + rich(a.description) + '</p></div>' +
      '</div></div>';
  }

  /** A testimonial card. */
  function testimonial(t, i) {
    var avatar = t.avatar
      ? '<img src="' + esc(img(t.avatar)) + '" alt="' + esc(t.name) + '" loading="lazy">'
      : '';
    return '' +
      '<div class="col-lg-4"><div class="tst reveal" data-d="' + d(i) + '">' +
        '<div class="stars">' + stars(t.rating) + '</div>' +
        '<p>&ldquo;' + rich(t.quote) + '&rdquo;</p>' +
        '<div class="who">' + avatar + '<div><b>' + rich(t.name) + '</b>' +
        '<small>' + rich(t.location) + '</small></div></div>' +
      '</div></div>';
  }

  /** A gallery tile. */
  function galleryTile(g) {
    var dest = (PH.data.cache.destinations || []).filter(function (x) {
      return x.name === g.title;
    })[0];
    var href = dest
      ? 'destination-details.html?id=' + encodeURIComponent(dest.id)
      : 'destinations.html';
    return '<a class="g" href="' + esc(href) + '">' +
      '<img src="' + esc(img(g.image)) + '" alt="' + esc(g.title) + '" loading="lazy">' +
      '<span>' + rich(g.title) + '</span></a>';
  }

  /** A stat tile. main.js animates .n[data-to] when it scrolls into view. */
  function stat(st, i) {
    return '<div class="col-6 col-md-3 stat reveal" data-d="' + d(i, 4) + '">' +
      '<div class="n" data-to="' + esc(st.value) + '" data-suf="' + esc(st.suffix || '') + '">0</div>' +
      '<div class="l">' + rich(st.label) + '</div></div>';
  }

  /** A feature tile, four to a row. */
  function feature(f, i, col) {
    return '<div class="' + (col || 'col-lg-3 col-md-6') + '">' +
      '<div class="feature reveal" data-d="' + d(i, 4) + '">' +
      '<div class="ic"><i class="' + esc(f.icon) + '"></i></div>' +
      '<h4>' + rich(f.title) + '</h4><p>' + rich(f.text) + '</p></div></div>';
  }

  function teamCard(m, i) {
    var soc = '';
    if (m.linkedin) { soc += '<a href="' + esc(m.linkedin) + '" aria-label="LinkedIn"><i class="bi bi-linkedin"></i></a>'; }
    if (m.instagram) { soc += '<a href="' + esc(m.instagram) + '" aria-label="Instagram"><i class="bi bi-instagram"></i></a>'; }
    if (m.twitter) { soc += '<a href="' + esc(m.twitter) + '" aria-label="X"><i class="bi bi-twitter-x"></i></a>'; }

    return '<div class="col-lg-4 col-md-6"><div class="team-card reveal" data-d="' + d(i) + '">' +
      (m.photo ? '<img src="' + esc(img(m.photo)) + '" alt="' + esc(m.name) + '" loading="lazy">' : '') +
      '<h4>' + rich(m.name) + '</h4><div class="role">' + rich(m.role) + '</div>' +
      (soc ? '<div class="soc">' + soc + '</div>' : '') +
      '</div></div>';
  }

  function skill(sk) {
    return '<div class="skill"><div class="top"><span>' + rich(sk.label) + '</span>' +
      '<span>' + esc(sk.value) + '%</span></div>' +
      '<div class="bar"><div class="fill" data-fill="' + esc(sk.value) + '"></div></div></div>';
  }

  function infoCard(icon, title, body, href) {
    var inner = href
      ? '<a href="' + esc(href) + '">' + rich(body) + '</a>'
      : rich(body);
    return '<div class="info-card"><div class="ic"><i class="bi ' + esc(icon) + '"></i></div>' +
      '<div><b>' + esc(title) + '</b><span>' + inner + '</span></div></div>';
  }

  /** A FAQ row. Native <details> so it is keyboard and screen-reader friendly. */
  function faqItem(f, i) {
    return '<details class="faq reveal" data-d="' + d(i) + '"' + (i === 0 ? ' open' : '') + '>' +
      '<summary><span>' + rich(f.question) + '</span><i class="bi bi-chevron-down"></i></summary>' +
      '<div class="faq-a">' + PH.fmt.paras(f.answer) + '</div></details>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     DETAIL PAGE PIECES
     ══════════════════════════════════════════════════════════════════ */

  /** A tick list — used for inclusions (in) and exclusions (out). */
  function tickList(items, kind) {
    if (!(items || []).length) { return ''; }
    var ico = kind === 'out' ? 'bi-x-lg' : 'bi-check-lg';
    return '<ul class="ticks ticks--' + esc(kind) + '">' +
      items.map(function (t) {
        return '<li><i class="bi ' + ico + '"></i><span>' + rich(t) + '</span></li>';
      }).join('') + '</ul>';
  }

  function highlightList(items) {
    if (!(items || []).length) { return ''; }
    return '<ul class="highlights">' +
      items.map(function (h) {
        return '<li><i class="bi bi-stars"></i><span>' + rich(h) + '</span></li>';
      }).join('') + '</ul>';
  }

  /** One itinerary day. */
  function itineraryDay(day, i) {
    var acts = (day.activities || []).filter(Boolean);
    return '<div class="day reveal" data-d="' + d(i) + '">' +
      '<div class="day-no"><span>Day</span><b>' + esc(day.day || i + 1) + '</b></div>' +
      '<div class="day-body">' +
        '<h3>' + rich(day.title) + '</h3>' +
        (day.location ? '<div class="day-loc"><i class="bi bi-geo-alt"></i>' +
          rich(day.location) + '</div>' : '') +
        (day.description ? PH.fmt.paras(day.description) : '') +
        (acts.length ? '<div class="day-acts">' + acts.map(function (a) {
          return '<span class="chip">' + rich(a) + '</span>';
        }).join('') + '</div>' : '') +
      '</div>' +
      (day.image ? '<div class="day-img"><img src="' + esc(img(day.image)) + '" alt="' +
        esc(day.title) + '" loading="lazy"></div>' : '') +
      '</div>';
  }

  function itinerary(days) {
    var list = (days || []).slice().sort(function (a, b) {
      return (Number(a.day) || 0) - (Number(b.day) || 0);
    });
    if (!list.length) { return ''; }
    return '<div class="itin">' + list.map(itineraryDay).join('') + '</div>';
  }

  /** The lightbox-free gallery strip used on detail pages. */
  function galleryStrip(images, alt) {
    var list = (images || []).filter(Boolean);
    if (!list.length) { return ''; }
    return '<div class="strip">' + list.map(function (src, i) {
      return '<a class="g" href="' + esc(img(src)) + '" target="_blank" rel="noopener">' +
        '<img src="' + esc(img(src)) + '" alt="' + esc(alt) + ' photo ' + (i + 1) +
        '" loading="lazy"></a>';
    }).join('') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     CTA
     ══════════════════════════════════════════════════════════════════ */

  function cta(c, override) {
    var o = Object.assign({}, c || {}, override || {});
    var title = rich(o.title || '');
    if (o.accent) { title += ' <em>' + rich(o.accent) + '</em>'; }
    if (o.titleAfter) { title += ' ' + rich(o.titleAfter); }

    var buttons = '';
    if (o.primaryButton) {
      buttons += '<a href="' + esc(o.primaryButtonLink || 'contact.html') +
        '" class="btn btn-grad">' + rich(o.primaryButton) + ' <i class="bi bi-arrow-right"></i></a>';
    }
    if (o.secondaryButton) {
      buttons += '<a href="' + esc(o.secondaryButtonLink || 'destinations.html') +
        '" class="btn btn-ghost-light">' + rich(o.secondaryButton) + '</a>';
    }

    return '' +
      '<div class="bg" style="' + bg(o.image) + '"></div>' +
      '<div class="inner"><div class="container-x reveal">' +
        '<span class="kicker center" style="color:var(--blue-bright)">' + rich(o.kicker) + '</span>' +
        '<h2>' + title + '</h2>' +
        '<p>' + rich(o.body) + '</p>' +
        '<div class="d-flex gap-3 justify-content-center flex-wrap">' + buttons + '</div>' +
      '</div></div>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     Empty state — used when a filter matches nothing
     ══════════════════════════════════════════════════════════════════ */

  function emptyState(title, body, action) {
    return '<div class="col-12"><div class="empty-state reveal in">' +
      '<div class="ic"><i class="bi bi-compass"></i></div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' +
      (action || '') + '</div></div>';
  }

  /* ── Public surface ──────────────────────────────────────────────── */
  return {
    navbar: navbar,
    footer: footer,
    whatsapp: whatsapp,
    hero: hero,
    pageHero: pageHero,
    heading: heading,
    destinationCard: destinationCard,
    regionCard: regionCard,
    packageCard: packageCard,
    adventureCard: adventureCard,
    testimonial: testimonial,
    galleryTile: galleryTile,
    stat: stat,
    feature: feature,
    teamCard: teamCard,
    skill: skill,
    infoCard: infoCard,
    faqItem: faqItem,
    tickList: tickList,
    highlightList: highlightList,
    itinerary: itinerary,
    itineraryDay: itineraryDay,
    galleryStrip: galleryStrip,
    cta: cta,
    emptyState: emptyState,
    stars: stars
  };
}());
