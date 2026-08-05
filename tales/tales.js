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
    var totWords = 0, totCh = 0, totRead = 0;
    WORKS.forEach(function (w) {
      totWords += wordCount(w); totCh += w.chapters.length;
      var st0 = wstate(w.id);
      totRead += w.chapters.filter(function (c) { return st0.read[c.id]; }).length;
    });
    var heroHtml = '<div class="hero-head">' +
      '<div class="hero-lead"><div class="hero-eyebrow">Lore &amp; Legends</div>' +
      '<h1 class="hero-title">Tales of the Lands Between</h1>' +
      '<p class="hero-sub">Original fan writing, built on the game’s own evidence. <b style="color:var(--red)">⚠ Full spoilers</b> — base game, all endings, and the DLC.</p></div>' +
      '<div class="hero-stats">' + ring(totCh ? Math.round(100 * totRead / totCh) : 0, 'READ') +
      '<div class="hero-stat-list">' +
        '<div class="hero-stat"><span>Tales</span><b>' + WORKS.length + '</b></div>' +
        '<div class="hero-stat"><span>Words</span><b>≈' + totWords.toLocaleString() + '</b></div>' +
        '<div class="hero-stat"><span>Chapters read</span><b>' + totRead + ' / ' + totCh + '</b></div>' +
      '</div></div></div>';
    shelf.innerHTML = heroHtml + WORKS.map(function (w) {
      var st = wstate(w.id);
      var readCount = w.chapters.filter(function (c) { return st.read[c.id]; }).length;
      var started = !!st.chapter || readCount > 0;
      var cont = st.chapter && w.chapters.find(function (c) { return c.id === st.chapter; });
      var pct = Math.round(100 * readCount / w.chapters.length);
      return '<div class="tale-card"><div class="tale-card-grid">' +
        '<div class="tale-card-main">' +
        '<div class="tale-card-head">' +
          '<div class="tale-titles"><span class="tale-title">' + esc(w.title) + '</span>' +
          '<span class="tale-subtitle">' + esc(w.subtitle) + '</span></div>' +
        '</div>' +
        '<p class="tale-blurb">' + esc(w.blurb) + '</p>' +
        '<p class="tale-spoilers">⚠ ' + esc(w.spoilers) + '</p>' +
        '<div class="tale-meta-row">' +
          '<span>📖 <b>' + esc(w.words) + '</b></span>' +
          '<span>✒ <b>' + readCount + ' / ' + w.chapters.length + '</b> chapters read</span>' +
          (readTime(wordCount(w)) ? '<span>◷ <b>' + readTime(wordCount(w)) + '</b></span>' : '') +
        '</div>' +
        '<div class="tale-actions">' +
          '<a class="cta tale-cta" href="read.html?work=' + w.id + (cont ? '&ch=' + cont.id : '') + '">' +
            (started && cont ? 'Continue — ' + esc(cont.num ? cont.num + '. ' : '') + esc(cont.title) : 'Begin reading →') + '</a>' +
          (w.chapters.length > 1 ? '<button class="icon-btn tale-toc-toggle" data-work="' + w.id + '">Contents</button>' : '') +
        '</div>' +
        '</div>' +
        '<div class="tale-status">' + ring(pct, 'READ') +
          '<span class="tale-status-label">' + (pct === 100 ? 'Finished' : started ? 'Reading' : 'Not started') + '</span></div>' +
        '</div>' +
        (w.chapters.length > 1 ?
          '<ol class="tale-toc" id="toc-' + w.id + '" hidden>' +
          w.chapters.map(function (c) {
            return '<li class="' + (st.read[c.id] ? 'read' : '') + '"><a href="read.html?work=' + w.id + '&ch=' + c.id + '">' +
              '<span class="tale-toc-num">' + esc(c.num) + '</span><span class="tale-toc-title">' + esc(c.title) + '</span>' +
              '<span class="tale-toc-tease">' + esc(c.tease) + '</span></a></li>';
          }).join('') + '</ol>' : '') +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(shelf.querySelectorAll('.tale-toc-toggle'), function (b) {
      b.addEventListener('click', function () {
        var toc = $('toc-' + b.dataset.work);
        toc.hidden = !toc.hidden;
      });
    });
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

  /* remember position; mark read */
  st.chapter = chapter.id;
  st.read[chapter.id] = 1;
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
