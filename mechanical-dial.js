(() => {
  'use strict';

  const grip = document.getElementById('dial');
  const upper = document.getElementById('mechanicalTop');
  const display = document.getElementById('timeDisplay');
  const hint = document.getElementById('dialHint');
  if (!grip || !upper || !display) return;

  let active = false;
  let pointerId = null;
  let lastX = 0;
  let accX = 0;
  let syntheticY = 0;
  let audioCtx = null;
  let lastClickAt = 0;

  const PX_PER_MINUTE = 7;
  const SYNTHETIC_Y_STEP = 8;

  function minsFromDisplay() {
    const [m,s] = display.textContent.trim().split(':').map(Number);
    return (m || 0) + (s || 0) / 60;
  }

  function visualAngle() {
    const m = Math.max(0, Math.min(60, minsFromDisplay()));
    return -150 + (m / 60) * 300;
  }

  function syncUpper(animate = true) {
    if (animate && !active) upper.style.transition = '';
    upper.style.setProperty('--crown-angle', `${visualAngle()}deg`);
  }

  function ctx() {
    if (!audioCtx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) audioCtx = new C();
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }

  function clickSound(stronger = false) {
    const c = ctx();
    if (!c) return;
    const now = c.currentTime;
    if (!stronger && performance.now() - lastClickAt < 32) return;
    lastClickAt = performance.now();

    const osc = c.createOscillator();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = 'square';
    osc.frequency.setValueAtTime(stronger ? 210 : 330, now);
    osc.frequency.exponentialRampToValueAtTime(stronger ? 120 : 190, now + (stronger ? .06 : .025));
    filter.type = 'bandpass';
    filter.frequency.value = stronger ? 700 : 1100;
    filter.Q.value = 1.5;
    gain.gain.setValueAtTime(stronger ? .07 : .028, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + (stronger ? .08 : .035));
    osc.connect(filter); filter.connect(gain); gain.connect(c.destination);
    osc.start(now); osc.stop(now + (stronger ? .085 : .04));
  }

  function setHint(t) { if (hint) hint.textContent = t; }

  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    active = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    accX = 0;
    syntheticY = e.clientY;
    upper.classList.add('dragging');
    try { grip.setPointerCapture(e.pointerId); } catch {}
    ctx();
    setHint('Twist left / right • release when set');
  }, true);

  grip.addEventListener('pointermove', (e) => {
    if (!active || e.__pomodoroMechanicalSynthetic) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const dx = e.clientX - lastX;
    lastX = e.clientX;
    accX += dx;

    while (Math.abs(accX) >= PX_PER_MINUTE) {
      const step = accX > 0 ? 1 : -1;
      syntheticY -= step * SYNTHETIC_Y_STEP;

      const synthetic = new PointerEvent('pointermove', {
        bubbles:true,
        cancelable:true,
        pointerId:e.pointerId,
        pointerType:e.pointerType || 'touch',
        isPrimary:true,
        clientX:e.clientX,
        clientY:syntheticY,
        buttons:1,
        pressure:e.pressure || .5
      });
      Object.defineProperty(synthetic, '__pomodoroMechanicalSynthetic', { value:true });
      grip.dispatchEvent(synthetic);

      accX -= step * PX_PER_MINUTE;
      syncUpper(false);
      clickSound(false);
      if (navigator.vibrate) navigator.vibrate(4);
    }
  }, true);

  function end() {
    if (!active) return;
    active = false;
    pointerId = null;
    upper.classList.remove('dragging');
    syncUpper(true);
    clickSound(true);
    if (navigator.vibrate) navigator.vibrate(12);
    setHint('Hold the upper half and drag left / right');
  }

  grip.addEventListener('pointerup', end, true);
  grip.addEventListener('pointercancel', end, true);
  grip.addEventListener('lostpointercapture', end, true);

  const observer = new MutationObserver(() => syncUpper(true));
  observer.observe(display, { childList:true, characterData:true, subtree:true });

  syncUpper(false);
  setHint('Hold the upper half and drag left / right');
})();
