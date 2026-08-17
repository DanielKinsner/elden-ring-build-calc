/* kindling.js — Film I release switch + written-movement companion. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function fetchJSON(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
      return response.json();
    });
  }

  try {
    var data = await Promise.all([fetchJSON('../data/releases.json'), fetchJSON('../data/tales.json')]);
    var release = data[0].releases && data[0].releases.kindling || {};
    var work = (data[1].works || []).find(function (item) { return item.id === 'kindling'; });
    var videoId = /^[A-Za-z0-9_-]{11}$/.test(release.youtubeId || '') ? release.youtubeId : null;
    var isLive = release.status === 'live' && videoId;

    if (isLive) {
      $('kindlingFrame').innerHTML = '<iframe class="kindling-video" src="https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0" title="' + esc(release.title || 'KINDLING — The Story of Melina') + '" loading="eager" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
      $('kindlingWatch').href = 'https://www.youtube.com/watch?v=' + videoId;
      $('kindlingWatch').target = '_blank';
      $('kindlingWatch').rel = 'noopener';
      $('kindlingWatch').innerHTML = 'Watch on YouTube <span>↗</span>';
      $('kindlingFrameStatus').textContent = release.published ? 'Released ' + release.published : 'Now playing';
      document.body.classList.add('kindling-live');
      var schema = {
        '@context':'https://schema.org', '@type':'VideoObject',
        name:release.title || 'KINDLING — The Story of Melina',
        description:release.description || '',
        thumbnailUrl:['https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg'],
        uploadDate:release.published || undefined,
        duration:release.duration || undefined,
        embedUrl:'https://www.youtube.com/embed/' + videoId,
        contentUrl:'https://www.youtube.com/watch?v=' + videoId
      };
      $('kindlingSchema').textContent = JSON.stringify(schema);
    }

    if (!work) throw new Error('KINDLING work missing from tales manifest');
    $('kindlingMovements').innerHTML = work.chapters.map(function (chapter, index) {
      return '<a class="kindling-movement archive-film-chapter" href="../tales/read.html?work=kindling&ch=' + encodeURIComponent(chapter.id) + '">' +
        '<span>' + esc(chapter.num) + '</span><div><b>' + esc(chapter.title) + '</b><p>' + esc(chapter.tease) + '</p></div><em>' + String(index + 1).padStart(2, '0') + '</em></a>';
    }).join('');
  } catch (error) {
    $('kindlingMovements').innerHTML = '<p class="kindling-load-error">The written record could not be opened. <a href="../tales/read.html?work=kindling&ch=ch01">Enter it directly →</a></p>';
  }

  $('kindlingShare').addEventListener('click', async function () {
    var button = this, url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title:'KINDLING — The Story of Melina', text:'Her story did not begin in fire.', url:url });
      else await navigator.clipboard.writeText(url);
      button.textContent = navigator.share ? 'Shared ✓' : 'Link copied ✓';
      setTimeout(function () { button.textContent = 'Share this page ↗'; }, 1800);
    } catch (error) {
      if (error && error.name !== 'AbortError') button.textContent = 'Copy the address above';
    }
  });
})();
