/* tales.js — the Tales library + reader. One file, two pages (shelf on index, reader on read.html). */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var manifest = await (await fetch('../data/tales.json')).json();
  var WORKS = manifest.works;
  function workById(id) { return WORKS.find(function (w) { return w.id === id; }); }

  /* ---- reading state: { <workId>: { chapter: <chapterId>, read: {chapterId:1} } } ---- */
  var LS_KEY = 'er-tales';
  var store = (function () {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') || {}; } catch (e) { return {}; }
  })();
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }
  function wstate(workId) { return store[workId] || (store[workId] = { chapter: null, read: {} }); }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  /* ---- minimal markdown → HTML (headings, hr, bold/italic, paragraphs; all the chapters need) ---- */
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  function renderMd(md) {
    var blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
    return blocks.map(function (b) {
      b = b.trim();
      if (!b) return '';
      if (/^---+$/.test(b)) return '<hr class="tale-hr">';
      var m = b.match(/^(#{1,4})\s+(.*)$/);
      if (m && b.indexOf('\n') === -1) {
        var lvl = m[1].length;
        return '<h' + lvl + ' class="tale-h' + lvl + '">' + inline(m[2]) + '</h' + lvl + '>';
      }
      /* multi-line block: could be consecutive headings or heading+text — split lines */
      var lines = b.split('\n');
      if (lines.every(function (l) { return /^#{1,4}\s+/.test(l) || /^---+$/.test(l); })) {
        return lines.map(function (l) {
          if (/^---+$/.test(l)) return '<hr class="tale-hr">';
          var h = l.match(/^(#{1,4})\s+(.*)$/);
          return '<h' + h[1].length + ' class="tale-h' + h[1].length + '">' + inline(h[2]) + '</h' + h[1].length + '>';
        }).join('');
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('\n');
  }

  /* ================= shelf (tales/index.html) ================= */
  function wordCount(w) { var n = parseInt(String(w.words).replace(/[^\d]/g, ''), 10); return isNaN(n) ? 0 : n; }
  function readTime(words) {
    if (!words) return '';
    var min = Math.round(words / 230); // ≈230 wpm
    return min < 60 ? '≈' + min + ' min read' : '≈' + Math.round(min / 60) + ' hr read';
  }
  function ring(pct, cap) {
    var r = 26, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle class="ring-bg" cx="32" cy="32" r="' + r + '"/>' +
      '<circle class="ring-fg" cx="32" cy="32" r="' + r + '" stroke-dasharray="' + (c * pct / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
      '<text x="32" y="34">' + pct + '%</text>' +
      '<text class="ring-cap" x="32" y="44">' + cap + '</text></svg>';
  }
  var shelf = $('talesShelf');
  if (shelf) {
    var spoilerLine = '<b style="color:var(--red)">⚠ Full spoilers</b> — base game, all endings, and the DLC.';

    /* ---- quiet library tools: recent activity + adjacent Archive doors ---- */
    function relTime(ts) {
      var min = Math.max(0, Math.floor((Date.now() - ts) / 60000));
      if (min < 1) return 'just now';
      if (min < 60) return min + ' min ago';
      var hr = Math.floor(min / 60);
      if (hr < 24) return hr + ' h ago';
      return Math.floor(hr / 24) + ' d ago';
    }
    function recentActivity() {
      var items = [];
      WORKS.forEach(function (w) {
        var st = wstate(w.id);
        w.chapters.forEach(function (c) {
          var r = st.read[c.id];
          if (r && typeof r === 'object' && r.t) items.push({ workId: w.id, chapter: c, t: r.t });
        });
      });
      items.sort(function (a, b) { return b.t - a.t; });
      return items.slice(0, 5);
    }
    function chapterLabel(c) { return (c.num ? c.num + '. ' : '') + c.title; }
    function toolsHtml() {
      var recent = recentActivity();
      return '<div class="tales-tools">' +
        '<div class="tales-tools-recent"><span class="tales-tools-label">Recently opened</span>' +
        (recent.length ? recent.slice(0, 3).map(function (it) {
          return '<a href="read.html?work=' + it.workId + '&ch=' + it.chapter.id + '"><span>' +
            esc(chapterLabel(it.chapter)) + '</span><small>' + relTime(it.t) + '</small></a>';
        }).join('') : '<p>Your reading history will gather here.</p>') + '</div>' +
        '<nav class="tales-tools-explore" aria-label="Explore the Archive"><span class="tales-tools-label">Elsewhere in the Archive</span>' +
        '<div><a href="#timeline">Timeline</a><a href="../guides/#compendium">Compendium</a><a href="../guides/#quests">Quest tracker</a></div></nav>' +
      '</div>';
    }

    function renderShelf() {
      var totWords = 0, totCh = 0, totRead = 0;
      WORKS.forEach(function (w) {
        totWords += wordCount(w); totCh += w.chapters.length;
        var st0 = wstate(w.id);
        totRead += w.chapters.filter(function (c) { return st0.read[c.id]; }).length;
      });
      var totalPct = totCh ? Math.round(100 * totRead / totCh) : 0;
      var heroHtml = '<header class="tales-hero">' +
        '<div><span class="tales-kicker">The written archive</span><h1>Tales of the Lands Between</h1>' +
        '<p>Three complete histories. Three voices refusing the easy version. ' + spoilerLine + '</p></div>' +
        '<div class="tales-aggregate"><div><span><b>' + WORKS.length + '</b> volumes</span><span><b>≈' + totWords.toLocaleString() + '</b> words</span><span><b>' + totRead + ' / ' + totCh + '</b> sections read</span></div>' +
        '<div class="tales-aggregate-track" aria-label="' + totalPct + '% of the collection read"><i style="width:' + totalPct + '%"></i></div></div>' +
      '</header>';
      var filmArt = {
        'gold-and-shadow': { src:'../assets/gold-shadow-film-iii.webp', film:'Archive Film III', alt:'Gold and Shadow film poster' },
        'kindling': { src:'../assets/kindling-melina.webp', film:'Archive Film I', alt:'KINDLING film poster' },
        'ranni': { src:'../assets/ranni-film-ii.webp', film:'Archive Film II', alt:'The Whole Dark Moon film poster' }
      };
      var cardsHtml = WORKS.map(function (w) {
        var st = wstate(w.id);
        var readCount = w.chapters.filter(function (c) { return st.read[c.id]; }).length;
        var started = !!st.chapter || readCount > 0;
        var cont = st.chapter && w.chapters.find(function (c) { return c.id === st.chapter; });
        var pct = Math.round(100 * readCount / w.chapters.length);
        var art = filmArt[w.id];
        var status = pct === 100 ? 'Finished' : started ? 'In progress' : 'Not started';
        return '<article class="tale-card tale-card--' + w.id + '">' +
          '<a class="tale-art" href="../' + encodeURIComponent(w.companion) + '/" aria-label="Open ' + esc(w.title) + ' film companion">' +
            '<img class="tale-cover" src="' + art.src + '" width="1672" height="941" alt="' + esc(art.alt) + '" decoding="async">' +
            '<span>' + art.film + '</span></a>' +
          '<div class="tale-card-body">' +
          '<div class="tale-card-head"><div class="tale-titles"><span class="tale-title">' + esc(w.title) + '</span>' +
            '<span class="tale-subtitle">' + esc(w.subtitle) + '</span></div></div>' +
          '<p class="tale-blurb">' + esc(w.blurb) + '</p>' +
          '<div class="tale-meta-row">' +
            '<span><b>' + esc(w.words) + '</b></span><i></i>' +
            '<span><b>' + w.chapters.length + '</b> sections</span>' +
            (readTime(wordCount(w)) ? '<i></i><span><b>' + readTime(wordCount(w)) + '</b></span>' : '') +
          '</div>' +
          '<div class="tale-progress-summary"><span>' + status + '</span><b>' + readCount + ' / ' + w.chapters.length + '</b></div>' +
          '<div class="tale-progress-track" aria-label="' + pct + '% read"><i style="width:' + pct + '%"></i></div>' +
          '<div class="tale-actions">' +
            '<a class="cta tale-cta" href="read.html?work=' + w.id + (cont ? '&ch=' + cont.id : '') + '">' +
              (started && cont ? 'Continue — ' + esc(cont.num ? cont.num + '. ' : '') + esc(cont.title) : 'Begin reading →') + '</a>' +
            '<a class="tale-companion" href="../' + encodeURIComponent(w.companion) + '/">Film companion ↗</a>' +
            (w.chapters.length > 1 ? '<button class="tale-toc-toggle" data-work="' + w.id + '" aria-expanded="false">Contents ↓</button>' : '') +
          '</div>' +
          '<p class="tale-spoilers">⚠ ' + esc(w.spoilers) + '</p>' +
          '</div>' +
          (w.chapters.length > 1 ?
            '<ol class="tale-toc" id="toc-' + w.id + '" hidden>' +
            w.chapters.map(function (c) {
              return '<li class="' + (st.read[c.id] ? 'read' : '') + '"><a href="read.html?work=' + w.id + '&ch=' + c.id + '">' +
                '<span class="tale-toc-num">' + esc(c.num) + '</span><span class="tale-toc-title">' + esc(c.title) + '</span>' +
                '<span class="tale-toc-tease">' + esc(c.tease) + '</span></a></li>';
            }).join('') + '</ol>' : '') +
          '</article>';
      }).join('');

      shelf.innerHTML = '<div class="tales-shelf-layout">' + heroHtml +
        '<div class="tales-volume-list">' + cardsHtml + '</div>' + toolsHtml() + '</div>';

      Array.prototype.forEach.call(shelf.querySelectorAll('.tale-toc-toggle'), function (b) {
        b.addEventListener('click', function () {
          var toc = $('toc-' + b.dataset.work);
          toc.hidden = !toc.hidden;
          b.setAttribute('aria-expanded', String(!toc.hidden));
          b.textContent = toc.hidden ? 'Contents ↓' : 'Close contents ↑';
        });
      });
    }

    /* ---- timeline (#timeline): in-world era events, chapter-linked ---- */
    var timelineEl = $('talesTimeline');
    var TIMELINE = null;
    async function loadTimeline() {
      if (!TIMELINE) TIMELINE = await (await fetch('../data/timeline.json')).json();
      return TIMELINE;
    }
    function renderTimeline() {
      loadTimeline().then(function (tl) {
        var work = workById('gold-and-shadow');
        var st = wstate('gold-and-shadow');
        var chaptersById = {};
        work.chapters.forEach(function (c) { chaptersById[c.id] = c; });
        var byEra = {};
        tl.events.forEach(function (e) { (byEra[e.era] = byEra[e.era] || []).push(e); });

        var html = '<div class="hero-head"><div class="hero-lead"><div class="hero-eyebrow">Lore &amp; Legends</div>' +
          '<h1 class="hero-title">Timeline</h1>' +
          '<p class="hero-sub">In-world events drawn from <i>Gold and Shadow</i>, in the chronicler’s own hedged voice. ' + spoilerLine + '</p></div></div>';

        html += tl.eras.map(function (era) {
          var events = byEra[era.id] || [];
          if (!events.length) return '';
          return '<section class="tl-era">' +
            '<h2 class="tl-era-name">' + esc(era.name) + '</h2>' +
            '<p class="tl-era-blurb">' + esc(era.blurb) + '</p>' +
            '<div class="tl-events">' + events.map(function (ev) {
              var ch = chaptersById[ev.chapter];
              var read = ch && !!st.read[ch.id];
              var chLabel = ch ? (ch.num ? ch.num + '. ' : '') + ch.title : ev.chapter;
              return '<article class="tl-event' + (read ? ' read' : '') + '">' +
                '<h3 class="tl-event-title">' + esc(ev.title) + '</h3>' +
                '<p class="tl-event-text">' + esc(ev.text) + '</p>' +
                (ch ? '<a class="tl-event-link" href="read.html?work=' + ev.workId + '&ch=' + ch.id + '">' +
                  'Read: ' + esc(chLabel) + ' →' + (read ? ' <span class="tl-read-tick">✓</span>' : '') + '</a>' : '') +
              '</article>';
            }).join('') + '</div>' +
          '</section>';
        }).join('');

        timelineEl.innerHTML = html;
      });
    }

    /* ---- hash-routed view switch ---- */
    var navBtns = Array.prototype.slice.call(document.querySelectorAll('#talesNav .atlas-tab'));
    function setView(view) {
      navBtns.forEach(function (b) {
        var on = b.dataset.view === view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (view === 'timeline') {
        shelf.hidden = true; timelineEl.hidden = false;
        if (location.hash !== '#timeline') history.replaceState(null, '', '#timeline');
        renderTimeline();
      } else {
        timelineEl.hidden = true; shelf.hidden = false;
        if (location.hash === '#timeline') history.replaceState(null, '', '#');
        renderShelf();
      }
    }
    navBtns.forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.view); }); });
    window.addEventListener('hashchange', function () { setView(location.hash === '#timeline' ? 'timeline' : 'shelf'); });
    setView(location.hash === '#timeline' ? 'timeline' : 'shelf');
    return;
  }

  /* ================= reader (tales/read.html) ================= */
  var body = $('chapterBody');
  if (!body) return;
  var q = new URLSearchParams(location.search);
  var work = workById(q.get('work')) || WORKS[0];
  var st = wstate(work.id);
  var chapter = work.chapters.find(function (c) { return c.id === q.get('ch'); }) ||
                work.chapters.find(function (c) { return c.id === st.chapter; }) ||
                work.chapters[0];

  document.title = (chapter.num ? chapter.num + '. ' : '') + chapter.title + ' · ' + work.title + ' · Tales';

  /* contents panel */
  var tocPanel = $('tocPanel'), tocBtn = $('tocBtn');
  tocPanel.innerHTML = '<div class="toc-work">' + esc(work.title) + '</div><ol class="tale-toc">' +
    work.chapters.map(function (c) {
      var cur = c.id === chapter.id;
      return '<li class="' + (st.read[c.id] ? 'read ' : '') + (cur ? 'current' : '') + '">' +
        '<a href="read.html?work=' + work.id + '&ch=' + c.id + '">' +
        '<span class="tale-toc-num">' + esc(c.num) + '</span><span class="tale-toc-title">' + esc(c.title) + '</span></a></li>';
    }).join('') + '</ol>';
  tocBtn.addEventListener('click', function () {
    tocPanel.hidden = !tocPanel.hidden;
    tocBtn.setAttribute('aria-expanded', String(!tocPanel.hidden));
  });

  /* fetch + render the chapter */
  try {
    var md = await (await fetch(work.dir + chapter.file)).text();
    body.innerHTML = renderMd(md);
  } catch (e) {
    body.innerHTML = '<p class="guide-loading">Could not load this chapter. <a href="./">Back to Tales</a></p>';
    return;
  }

  /* remember position; mark read. Migration: legacy entries are the bare number 1 ("read,
     unknown time") and are never rewritten — only a chapter with no entry yet gets a timestamp,
     so re-reading a chapter doesn't bump its Recent Activity time. */
  st.chapter = chapter.id;
  if (!st.read[chapter.id]) st.read[chapter.id] = { t: Date.now() };
  save();

  /* prev / next */
  var idx = work.chapters.indexOf(chapter);
  var prev = work.chapters[idx - 1], next = work.chapters[idx + 1];
  function chLink(c, label, cls) {
    return '<a class="ch-nav-btn ' + cls + '" href="read.html?work=' + work.id + '&ch=' + c.id + '">' + label +
      '<b>' + esc(c.num ? c.num + '. ' : '') + esc(c.title) + '</b></a>';
  }
  $('chapterNav').innerHTML =
    (prev ? chLink(prev, '← Previous', 'prev') : '<span></span>') +
    (next ? chLink(next, 'Next →', 'next')
          : '<a class="ch-nav-btn next" href="./"><span>The End</span><b>Back to Tales</b></a>');
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft' && prev) location.href = 'read.html?work=' + work.id + '&ch=' + prev.id;
    if (e.key === 'ArrowRight' && next) location.href = 'read.html?work=' + work.id + '&ch=' + next.id;
  });

  /* scroll progress bar */
  var bar = $('readProgress').firstElementChild;
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? Math.min(100, 100 * h.scrollTop / max) : 0) + '%';
  }
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
