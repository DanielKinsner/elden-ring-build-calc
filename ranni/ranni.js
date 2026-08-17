/* ranni.js — Film II release switch + complete written testament. */
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
    var release = data[0].releases && data[0].releases.ranni || {};
    var work = (data[1].works || []).find(function (item) { return item.id === 'ranni'; });
    var videoId = /^[A-Za-z0-9_-]{11}$/.test(release.youtubeId || '') ? release.youtubeId : null;
    var isLive = release.status === 'live' && videoId;

    if (isLive) {
      $('ranniFrame').innerHTML = '<iframe class="ranni-video" src="https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0" title="' + esc(release.title || 'THE WHOLE DARK MOON — The Testament of Ranni') + '" loading="eager" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
      $('ranniWatch').href = 'https://www.youtube.com/watch?v=' + videoId;
      $('ranniWatch').target = '_blank';
      $('ranniWatch').rel = 'noopener';
      $('ranniWatch').innerHTML = 'Watch on YouTube <span>↗</span>';
      $('ranniFrameStatus').textContent = release.published ? 'Released ' + release.published : 'Now playing';
      document.body.classList.add('ranni-live');
      $('ranniSchema').textContent = JSON.stringify({
        '@context':'https://schema.org', '@type':'VideoObject',
        name:release.title || 'THE WHOLE DARK MOON — The Testament of Ranni',
        description:release.description || '',
        thumbnailUrl:['https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg'],
        uploadDate:release.published || undefined,
        duration:release.duration || undefined,
        embedUrl:'https://www.youtube.com/embed/' + videoId,
        contentUrl:'https://www.youtube.com/watch?v=' + videoId
      });
    }

    if (!work) throw new Error('Ranni work missing from tales manifest');
    $('ranniMovements').innerHTML = work.chapters.map(function (chapter, index) {
      var edge = index === 0 || index === work.chapters.length - 1 ? ' ranni-movement--edge' : '';
      return '<a class="ranni-movement archive-film-chapter' + edge + '" href="../tales/read.html?work=ranni&ch=' + encodeURIComponent(chapter.id) + '">' +
        '<span>' + esc(chapter.num) + '</span><div><b>' + esc(chapter.title) + '</b><p>' + esc(chapter.tease) + '</p></div><em>' + String(index).padStart(2, '0') + '</em></a>';
    }).join('');
  } catch (error) {
    $('ranniMovements').innerHTML = '<p class="ranni-load-error">The testament could not be opened. <a href="../tales/read.html?work=ranni&ch=prologue">Enter it directly →</a></p>';
  }

  $('ranniShare').addEventListener('click', async function () {
    var button = this, url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title:'THE WHOLE DARK MOON — The Testament of Ranni', text:'No leash. No throne. No solitude.', url:url });
      else await navigator.clipboard.writeText(url);
      button.textContent = navigator.share ? 'Shared ✓' : 'Link copied ✓';
      setTimeout(function () { button.textContent = 'Share this page ↗'; }, 1800);
    } catch (error) {
      if (error && error.name !== 'AbortError') button.textContent = 'Copy the address above';
    }
  });
})();
