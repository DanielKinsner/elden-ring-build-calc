/* gold-and-shadow.js — Film III release switch + complete written chronicle. */
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
    var release = data[0].releases && data[0].releases['gold-and-shadow'] || {};
    var work = (data[1].works || []).find(function (item) { return item.id === 'gold-and-shadow'; });
    var videoId = /^[A-Za-z0-9_-]{11}$/.test(release.youtubeId || '') ? release.youtubeId : null;
    var isLive = release.status === 'live' && videoId;

    if (isLive) {
      $('goldShadowFrame').innerHTML = '<iframe class="gold-shadow-video" src="https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0" title="' + esc(release.title || 'GOLD AND SHADOW') + '" loading="eager" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
      $('goldShadowWatch').href = 'https://www.youtube.com/watch?v=' + videoId;
      $('goldShadowWatch').target = '_blank';
      $('goldShadowWatch').rel = 'noopener';
      $('goldShadowWatch').innerHTML = 'Watch on YouTube <span>↗</span>';
      $('goldShadowFrameStatus').textContent = release.published ? 'Released ' + release.published : 'Now playing';
      document.body.classList.add('gold-shadow-live');
      $('goldShadowSchema').textContent = JSON.stringify({
        '@context':'https://schema.org', '@type':'VideoObject',
        name:release.title || 'GOLD AND SHADOW — A Complete History of the Lands Between',
        description:release.description || '',
        thumbnailUrl:['https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg'],
        uploadDate:release.published || undefined,
        duration:release.duration || undefined,
        embedUrl:'https://www.youtube.com/embed/' + videoId,
        contentUrl:'https://www.youtube.com/watch?v=' + videoId
      });
    }

    if (!work) throw new Error('Gold and Shadow work missing from tales manifest');
    $('goldShadowChapters').innerHTML = work.chapters.map(function (chapter, index) {
      var edge = index === 0 || index >= work.chapters.length - 2 ? ' gold-shadow-chapter--edge' : '';
      return '<a class="gold-shadow-chapter' + edge + '" href="../tales/read.html?work=gold-and-shadow&ch=' + encodeURIComponent(chapter.id) + '">' +
        '<span>' + esc(chapter.num) + '</span><div><b>' + esc(chapter.title) + '</b><p>' + esc(chapter.tease) + '</p></div><em>' + String(index).padStart(2, '0') + '</em></a>';
    }).join('');
  } catch (error) {
    $('goldShadowChapters').innerHTML = '<p class="gold-shadow-load-error">The record could not be opened. <a href="../tales/read.html?work=gold-and-shadow&ch=prologue">Enter it directly →</a></p>';
  }

  $('goldShadowShare').addEventListener('click', async function () {
    var button = this, url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title:'GOLD AND SHADOW — A Complete History of the Lands Between', text:'The land does not narrate itself.', url:url });
      else await navigator.clipboard.writeText(url);
      button.textContent = navigator.share ? 'Shared ✓' : 'Link copied ✓';
      setTimeout(function () { button.textContent = 'Share this page ↗'; }, 1800);
    } catch (error) {
      if (error && error.name !== 'AbortError') button.textContent = 'Copy the address above';
    }
  });
})();
