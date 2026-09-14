(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const modeButtons = [...document.querySelectorAll('.mode')];
  const STORAGE_KEY = 'pomodoro3d-state-v1';
  const SETTINGS_KEY = 'pomodoro3d-settings-v1';
  const STATS_KEY = 'pomodoro3d-stats-v1';

  const defaults = {
    focus: 25,
    short: 5,
    long: 15,
    sessions: 4,
    autoBreak: false,
    autoFocus: false,
    wake: true,
    sound: true,
    tick: false,
    vibrate: true,
    motion: true,
    contrast: false
  };

  const settings = { ...defaults, ...readJSON(SETTINGS_KEY, {}) };
  const todayKey = localDateKey();
  let stats = readJSON(STATS_KEY, { date: todayKey, completed: 0, focusMinutes: 0 });
  if (stats.date !== todayKey) stats = { date: todayKey, completed: 0, focusMinutes: 0 };

  const saved = readJSON(STORAGE_KEY, null);
  const initialMode = saved?.mode && ['focus','short','long'].includes(saved.mode) ? saved.mode : 'focus';
  let state = {
    mode: initialMode,
    running: !!saved?.running,
    remaining: Number.isFinite(saved?.remaining) ? saved.remaining : durationFor(initialMode),
    duration: Number.isFinite(saved?.duration) ? saved.duration : durationFor(initialMode),
    endTime: saved?.endTime || null,
    focusInCycle: Math.max(0, Math.min(settings.sessions - 1, saved?.focusInCycle || 0))
  };

  let deferredInstallPrompt = null;
  let timerHandle = null;
  let tickHandle = null;
  let audioCtx = null;
  let wakeLock = null;
  let toastHandle = null;
  let drag = null;
  let tiltResetHandle = null;

  const els = {
    timeDisplay: $('timeDisplay'), progressBar: $('progressBar'), modeLabel: $('modeLabel'),
    statusDot: $('statusDot'), sessionText: $('sessionText'), todayText: $('todayText'),
    completedToday: $('completedToday'), focusMinutes: $('focusMinutes'), cycleDots: $('cycleDots'),
    startBtn: $('startBtn'), startText: $('startText'), startIcon: $('startIcon'), resetBtn: $('resetBtn'),
    skipBtn: $('skipBtn'), settingsBtn: $('settingsBtn'), closeSettings: $('closeSettings'),
    settingsPanel: $('settingsPanel'), scrim: $('scrim'), dial: $('dial'), timerObject: $('timerObject'),
    dialHint: $('dialHint'), toast: $('toast'), installBtn: $('installBtn'), soundQuickBtn: $('soundQuickBtn'),
    notificationBtn: $('notificationBtn')
  };

  const inputs = {
    focus: $('focusMinutesInput'), short: $('shortMinutesInput'), long: $('longMinutesInput'),
    sessions: $('sessionsInput'), autoBreak: $('autoBreakInput'), autoFocus: $('autoFocusInput'),
    wake: $('wakeInput'), sound: $('soundInput'), tick: $('tickInput'), vibrate: $('vibrateInput'),
    motion: $('motionInput'), contrast: $('contrastInput')
  };

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function localDateKey(d = new Date()) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function durationFor(mode) {
    const mins = mode === 'focus' ? settings.focus : mode === 'short' ? settings.short : settings.long;
    return Math.max(60, Math.round(mins * 60));
  }
  function clamp(v,min,max){ return Math.min(max, Math.max(min,v)); }

  function persistState() {
    writeJSON(STORAGE_KEY, state);
    writeJSON(SETTINGS_KEY, settings);
    writeJSON(STATS_KEY, stats);
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec/60), s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function render() {
    if (stats.date !== localDateKey()) {
      stats = { date: localDateKey(), completed: 0, focusMinutes: 0 };
      persistState();
    }
    const labels = { focus: 'FOCUS', short: 'SHORT BREAK', long: 'LONG BREAK' };
    els.timeDisplay.textContent = formatTime(state.remaining);
    els.modeLabel.textContent = labels[state.mode];
    els.statusDot.classList.toggle('live', state.running);
    els.timerObject.classList.toggle('running', state.running);
    els.startText.textContent = state.running ? 'Pause' : (state.remaining < state.duration ? 'Resume' : 'Start');
    els.startIcon.textContent = state.running ? '❚❚' : '▶';
    const progress = clamp(1 - (state.remaining / Math.max(1,state.duration)), 0, 1);
    els.progressBar.style.width = `${progress * 100}%`;
    els.sessionText.textContent = `Session ${Math.min(state.focusInCycle + 1, settings.sessions)} of ${settings.sessions}`;
    els.todayText.textContent = `${stats.completed} today`;
    els.completedToday.textContent = stats.completed;
    els.focusMinutes.textContent = stats.focusMinutes;
    els.soundQuickBtn.textContent = settings.sound ? 'Sound on' : 'Sound off';
    document.body.classList.toggle('high-contrast', settings.contrast);
    modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    renderDots();
    renderDial();
    document.title = `${formatTime(state.remaining)} • ${labels[state.mode].replace(' BREAK','')} — Pomodoro 3D`;
  }

  function renderDots() {
    els.cycleDots.innerHTML = '';
    for (let i=0;i<settings.sessions;i++) {
      const d = document.createElement('div');
      d.className = 'cycle-dot' + (i < state.focusInCycle ? ' done' : '') + (i === state.focusInCycle && state.mode === 'focus' ? ' current' : '');
      els.cycleDots.appendChild(d);
    }
  }

  function renderDial() {
    const mins = state.remaining / 60;
    const max = Math.max(60, settings.focus, settings.long, settings.short);
    const angle = (mins / max) * 270 - 135;
    els.dial.style.transform = `translateZ(42px) rotateX(64deg) rotateZ(${angle}deg)`;
  }

  function updateFromClock() {
    if (!state.running || !state.endTime) return;
    const left = (state.endTime - Date.now()) / 1000;
    state.remaining = Math.max(0, left);
    if (left <= 0) completeSession(false);
    else render();
  }

  async function startTimer() {
    ensureAudio();
    if (state.remaining <= 0) resetTimer();
    state.running = true;
    state.endTime = Date.now() + state.remaining * 1000;
    persistState();
    startIntervals();
    if (settings.wake) requestWakeLock();
    render();
  }

  function pauseTimer() {
    updateFromClock();
    state.running = false;
    state.endTime = null;
    clearIntervals();
    releaseWakeLock();
    persistState();
    render();
  }

  function toggleTimer() { state.running ? pauseTimer() : startTimer(); }

  function resetTimer() {
    state.running = false;
    state.duration = durationFor(state.mode);
    state.remaining = state.duration;
    state.endTime = null;
    clearIntervals(); releaseWakeLock(); persistState(); render();
    showToast('Timer reset');
  }

  function switchMode(mode, { preserveCycle = true } = {}) {
    if (!['focus','short','long'].includes(mode)) return;
    state.running = false; state.endTime = null; clearIntervals(); releaseWakeLock();
    state.mode = mode;
    state.duration = durationFor(mode);
    state.remaining = state.duration;
    if (!preserveCycle && mode === 'focus') state.focusInCycle = 0;
    persistState(); render();
  }

  function skipSession() {
    completeSession(true);
    showToast('Session skipped');
  }

  async function completeSession(skipped) {
    const completedMode = state.mode;
    const completedDuration = state.duration;
    state.running = false; state.endTime = null; clearIntervals(); releaseWakeLock();

    if (!skipped) {
      if (completedMode === 'focus') {
        stats.completed += 1;
        stats.focusMinutes += Math.round(completedDuration / 60);
        state.focusInCycle += 1;
        if ('setAppBadge' in navigator) navigator.setAppBadge(stats.completed).catch(()=>{});
      }
      playCompletion();
      notifyCompletion(completedMode);
      if (settings.vibrate && navigator.vibrate) navigator.vibrate([180,80,180,80,320]);
    }

    let nextMode;
    if (completedMode === 'focus') {
      if (state.focusInCycle >= settings.sessions) {
        nextMode = 'long';
        state.focusInCycle = 0;
      } else nextMode = 'short';
    } else nextMode = 'focus';

    state.mode = nextMode;
    state.duration = durationFor(nextMode);
    state.remaining = state.duration;
    persistState(); render();

    const shouldAuto = completedMode === 'focus' ? settings.autoBreak : settings.autoFocus;
    if (!skipped) showToast(nextMode === 'focus' ? 'Break complete — focus time' : (nextMode === 'long' ? 'Cycle complete — long break' : 'Focus complete — take a short break'));
    if (shouldAuto) startTimer();
  }

  function startIntervals() {
    clearIntervals();
    timerHandle = setInterval(() => {
      updateFromClock();
      if (settings.tick && state.running) maybeTick();
    }, 250);
  }
  function clearIntervals() {
    if (timerHandle) clearInterval(timerHandle); timerHandle = null;
    if (tickHandle) clearTimeout(tickHandle); tickHandle = null;
  }

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(()=>{});
  }

  function tone(freq, when, dur, gain = .12, type='sine') {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + .02);
    g.gain.exponentialRampToValueAtTime(.0001, when + dur);
    osc.connect(g); g.connect(audioCtx.destination); osc.start(when); osc.stop(when + dur + .03);
  }

  function playCompletion() {
    if (!settings.sound) return;
    ensureAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime + .02;
    tone(523.25,t,.48,.14); tone(659.25,t+.12,.5,.11); tone(783.99,t+.26,.72,.12);
  }

  let lastTickSecond = -1;
  function maybeTick() {
    if (!settings.sound && !settings.tick) return;
    const sec = Math.ceil(state.remaining);
    if (sec === lastTickSecond || sec <= 0) return;
    lastTickSecond = sec;
    ensureAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime + .002;
    tone(1050,t,.024,.015,'square');
  }

  async function notifyCompletion(mode) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = mode === 'focus' ? 'Focus session complete' : 'Break complete';
    const body = mode === 'focus' ? 'Nice work. Time for a break.' : 'Ready for the next focus session?';
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg?.showNotification) reg.showNotification(title, { body, icon:'./icon-192.svg', badge:'./icon-192.svg', tag:'pomodoro-complete', renotify:true, vibrate:[180,80,180] });
      else new Notification(title, { body, icon:'./icon-192.svg' });
    } catch {}
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return showToast('Notifications are not supported here');
    const result = await Notification.requestPermission();
    updateNotificationButton();
    showToast(result === 'granted' ? 'Notifications enabled' : 'Notifications not enabled');
  }
  function updateNotificationButton() {
    if (!('Notification' in window)) els.notificationBtn.textContent = 'Notifications unavailable';
    else if (Notification.permission === 'granted') els.notificationBtn.textContent = 'Notifications enabled ✓';
    else if (Notification.permission === 'denied') els.notificationBtn.textContent = 'Notifications blocked in browser';
    else els.notificationBtn.textContent = 'Enable notifications';
  }

  async function requestWakeLock() {
    if (!settings.wake || !('wakeLock' in navigator) || !state.running || document.visibilityState !== 'visible') return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
  async function releaseWakeLock() {
    try { await wakeLock?.release(); } catch {}
    wakeLock = null;
  }

  function showToast(msg) {
    clearTimeout(toastHandle);
    els.toast.textContent = msg; els.toast.classList.remove('hidden');
    toastHandle = setTimeout(() => els.toast.classList.add('hidden'), 2200);
  }

  function openSettings() {
    syncSettingsUI();
    els.scrim.classList.remove('hidden');
    els.settingsPanel.classList.add('open');
    els.settingsPanel.setAttribute('aria-hidden','false');
  }
  function closeSettings() {
    els.settingsPanel.classList.remove('open');
    els.settingsPanel.setAttribute('aria-hidden','true');
    setTimeout(() => els.scrim.classList.add('hidden'), 220);
  }

  function syncSettingsUI() {
    for (const k of ['focus','short','long','sessions']) inputs[k].value = settings[k];
    for (const k of ['autoBreak','autoFocus','wake','sound','tick','vibrate','motion','contrast']) inputs[k].checked = !!settings[k];
    updateNotificationButton();
  }

  function applyDurationSetting(key, value) {
    const ranges = { focus:[1,120], short:[1,60], long:[1,90], sessions:[1,12] };
    const [min,max] = ranges[key];
    settings[key] = clamp(parseInt(value || min,10), min, max);
    inputs[key].value = settings[key];
    if (!state.running && (key === state.mode || (key === 'focus' && state.mode === 'focus') || (key === 'short' && state.mode === 'short') || (key === 'long' && state.mode === 'long'))) {
      state.duration = durationFor(state.mode); state.remaining = state.duration;
    }
    if (key === 'sessions') state.focusInCycle = clamp(state.focusInCycle,0,settings.sessions-1);
    persistState(); render();
  }

  function adjustMinutes(delta) {
    if (state.running) return showToast('Pause the timer before adjusting the dial');
    const current = Math.round(state.remaining/60);
    const max = state.mode === 'focus' ? 120 : state.mode === 'short' ? 60 : 90;
    const next = clamp(current + delta, 1, max);
    state.duration = next * 60; state.remaining = state.duration;
    persistState(); render();
  }

  function initDial() {
    els.dial.addEventListener('pointerdown', e => {
      if (state.running) return showToast('Pause the timer before adjusting the dial');
      els.dial.setPointerCapture(e.pointerId);
      drag = { y:e.clientY, acc:0 };
      els.dialHint.textContent = 'Drag up or down • 1 minute per step';
      ensureAudio();
    });
    els.dial.addEventListener('pointermove', e => {
      if (!drag) return;
      const dy = drag.y - e.clientY;
      drag.acc += dy; drag.y = e.clientY;
      while (Math.abs(drag.acc) >= 8) {
        const step = drag.acc > 0 ? 1 : -1;
        adjustMinutes(step);
        drag.acc -= step * 8;
        if (navigator.vibrate) navigator.vibrate(6);
      }
    });
    const end = () => { drag = null; els.dialHint.textContent = 'Drag the top dial to adjust time'; };
    els.dial.addEventListener('pointerup', end); els.dial.addEventListener('pointercancel', end);
  }

  function initTilt() {
    const scene = $('scene');
    scene.addEventListener('pointermove', e => {
      if (!settings.motion || drag || e.pointerType === 'touch') return;
      const r = scene.getBoundingClientRect();
      const x = (e.clientX - r.left)/r.width - .5;
      const y = (e.clientY - r.top)/r.height - .5;
      els.timerObject.style.transform = `rotateX(${2-y*7}deg) rotateY(${x*11}deg)`;
    });
    scene.addEventListener('pointerleave', resetTilt);
    scene.addEventListener('pointerdown', e => {
      if (!settings.motion || e.target === els.dial) return;
      const r = scene.getBoundingClientRect();
      const x = (e.clientX - r.left)/r.width - .5;
      const y = (e.clientY - r.top)/r.height - .5;
      els.timerObject.style.transform = `rotateX(${2-y*8}deg) rotateY(${x*12}deg)`;
      clearTimeout(tiltResetHandle); tiltResetHandle = setTimeout(resetTilt, 400);
    });
  }
  function resetTilt() {
    if (!settings.motion) els.timerObject.style.transform = 'rotateX(2deg) rotateY(0deg)';
    else els.timerObject.style.transform = 'rotateX(2deg) rotateY(0deg)';
  }

  function recoverRunningState() {
    if (!state.running || !state.endTime) return;
    const left = (state.endTime - Date.now())/1000;
    if (left <= 0) completeSession(false);
    else { state.remaining = left; startIntervals(); if (settings.wake) requestWakeLock(); }
  }

  function wireEvents() {
    els.startBtn.addEventListener('click', toggleTimer);
    els.resetBtn.addEventListener('click', resetTimer);
    els.skipBtn.addEventListener('click', skipSession);
    modeButtons.forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));
    els.settingsBtn.addEventListener('click', openSettings);
    els.closeSettings.addEventListener('click', closeSettings);
    els.scrim.addEventListener('click', closeSettings);
    els.notificationBtn.addEventListener('click', requestNotifications);
    els.soundQuickBtn.addEventListener('click', () => { settings.sound = !settings.sound; inputs.sound.checked = settings.sound; persistState(); render(); showToast(settings.sound ? 'Completion sound on' : 'Completion sound off'); });
    $('resetStatsBtn').addEventListener('click', () => { stats = { date:localDateKey(), completed:0, focusMinutes:0 }; persistState(); render(); showToast('Today’s statistics reset'); });

    ['focus','short','long','sessions'].forEach(k => inputs[k].addEventListener('change', e => applyDurationSetting(k,e.target.value)));
    ['autoBreak','autoFocus','wake','sound','tick','vibrate','motion','contrast'].forEach(k => inputs[k].addEventListener('change', e => {
      settings[k] = e.target.checked;
      if (k === 'wake') settings.wake ? requestWakeLock() : releaseWakeLock();
      if (k === 'motion' && !settings.motion) resetTilt();
      persistState(); render();
    }));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { updateFromClock(); if (state.running && settings.wake) requestWakeLock(); }
      else releaseWakeLock();
    });
    window.addEventListener('beforeunload', persistState);
  }

  function setupInstall() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); deferredInstallPrompt = e; els.installBtn.classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; els.installBtn.classList.add('hidden'); showToast('Pomodoro 3D installed'); });
    els.installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return showToast('Use Chrome menu → Add to Home screen');
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null; els.installBtn.classList.add('hidden');
    });
  }

  async function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js', { scope:'./' }); } catch (e) { console.warn('SW registration failed', e); }
    }
  }

  wireEvents(); initDial(); initTilt(); setupInstall(); setupServiceWorker(); syncSettingsUI(); recoverRunningState(); render();
})();
