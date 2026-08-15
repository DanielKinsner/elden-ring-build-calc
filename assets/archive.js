/* archive.js — the landing page's returning-Grace ledger. Local state only. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('graceLedger')) return;

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch (e) { return fallback; }
  }
  function fetchJSON(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
      return response.json();
    });
  }
  function countTruthy(object, valid) {
    return Object.keys(object || {}).filter(function (id) { return object[id] && (!valid || valid.has(id)); }).length;
  }
  function setBar(id, done, total) {
    var node = $(id); if (!node) return;
    node.style.width = (total ? Math.max(0, Math.min(100, Math.round(done * 100 / total))) : 0) + '%';
  }
  function chapterLabel(chapter) { return (chapter.num ? chapter.num + '. ' : '') + chapter.title; }

  var payload;
  try {
    payload = await Promise.all([fetchJSON('data/quests.json'), fetchJSON('data/bosses.json'), fetchJSON('data/tales.json')]);
  } catch (error) {
    $('ledgerLead').textContent = 'Your saved state is still here. The reference totals could not be loaded, so the Archive is leaving the record untouched.';
    return;
  }

  var questData = payload[0], bossData = payload[1], taleData = payload[2];
  fetchJSON('data/releases.json').then(function (releaseData) {
    var release = releaseData.releases && releaseData.releases.kindling;
    var live = release && release.status === 'live' && /^[A-Za-z0-9_-]{11}$/.test(release.youtubeId || '');
    var ribbonStatus = $('filmRibbonStatus');
    if (ribbonStatus && live) ribbonStatus.innerHTML = 'Watch the film <i>↗</i>';
  }).catch(function () { /* Release state is optional; the archive ledger remains independent. */ });
  var guide = read('er-guides', {}), tales = read('er-tales', {}), build = read('er-build', null), myBuilds = read('er-my-builds', []);
  var quests = questData.quests || [], bosses = bossData.bosses || [], works = taleData.works || [];
  var validSteps = new Set([].concat.apply([], quests.map(function (quest) { return quest.steps.map(function (step) { return step.id; }); })));
  var validBosses = new Set(bosses.map(function (boss) { return boss.id; }));
  var questDone = countTruthy(guide.steps, validSteps), bossDone = countTruthy(guide.bosses, validBosses);
  var chapterTotal = works.reduce(function (sum, work) { return sum + work.chapters.length; }, 0);
  var readCount = 0, latest = null, firstStarted = null;

  works.forEach(function (work) {
    var state = tales[work.id] || {}, reads = state.read || {};
    var done = work.chapters.filter(function (chapter) { return !!reads[chapter.id]; });
    readCount += done.length;
    if (done.length && !firstStarted) firstStarted = { work:work, state:state };
    done.forEach(function (chapter) {
      var record = reads[chapter.id], time = record && typeof record === 'object' ? +record.t || 0 : 0;
      if (!latest || time > latest.time) latest = { work:work, state:state, time:time };
    });
  });

  var level = build && +build.level;
  $('ledgerBuild').textContent = build ? (level ? 'RL ' + level : 'Active') : '—';
  $('ledgerBuildNote').textContent = build ? (myBuilds.length ? myBuilds.length + ' named build' + (myBuilds.length === 1 ? '' : 's') + ' saved' : 'Active loadout remembered') : 'No active loadout yet';
  setBar('ledgerBuildBar', build ? 1 : 0, 1);
  $('ledgerJourney').textContent = questDone + ' / ' + validSteps.size;
  $('ledgerJourneyNote').textContent = questDone ? 'Quest steps recorded' : 'No quest steps recorded yet';
  setBar('ledgerJourneyBar', questDone, validSteps.size);
  $('ledgerBosses').textContent = bossDone + ' / ' + validBosses.size;
  setBar('ledgerBossBar', bossDone, validBosses.size);
  $('ledgerTales').textContent = readCount + ' / ' + chapterTotal;
  $('ledgerTalesNote').textContent = readCount ? 'Chapters carried with you' : 'No chapters read yet';
  setBar('ledgerTalesBar', readCount, chapterTotal);

  var resume = $('ledgerResume'), lead = $('ledgerLead');
  var activeTale = latest || firstStarted;
  if (activeTale && readCount < chapterTotal) {
    var next = activeTale.work.chapters.find(function (chapter) { return !(activeTale.state.read || {})[chapter.id]; }) || activeTale.work.chapters[0];
    resume.href = 'tales/read.html?work=' + activeTale.work.id + '&ch=' + next.id;
    resume.innerHTML = 'Continue ' + activeTale.work.title + ' <span>→</span>';
    lead.textContent = 'Your path is still warm: ' + questDone + ' quest steps, ' + bossDone + ' felled bosses, and ' + readCount + ' read chapters. Next in the ledger: ' + chapterLabel(next) + '.';
  } else if (questDone) {
    var activeQuest = quests.find(function (quest) {
      var done = quest.steps.filter(function (step) { return guide.steps && guide.steps[step.id]; }).length;
      return done > 0 && done < quest.steps.length;
    });
    resume.href = 'guides/#quests';
    resume.innerHTML = (activeQuest ? 'Resume ' + activeQuest.name : 'Open the journey ledger') + ' <span>→</span>';
    lead.textContent = 'The Archive has ' + questDone + ' quest steps and ' + bossDone + ' felled bosses in its keeping. Return to the road exactly where you stopped.';
  } else if (build) {
    resume.href = 'build/';
    resume.innerHTML = 'Return to the Full Build Lab <span>→</span>';
    lead.textContent = (level ? 'Your rune-level ' + level + ' build' : 'Your active build') + ' is still assembled here. Every armament, spell, target, and calculation remains on this device.';
  }
})();
