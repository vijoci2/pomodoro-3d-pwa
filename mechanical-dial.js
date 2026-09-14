(() => {
  'use strict';

  const dial = document.getElementById('dial');
  const display = document.getElementById('timeDisplay');
  const hint = document.getElementById('dialHint');
  const timerObject = document.getElementById('timerObject');
  if (!dial || !display || !timerObject) return;

  // Build a true rotating top assembly around the existing crown/leaves.
  let crown = document.getElementById('mechanicalTop');
  if (!crown) {
    crown = document.createElement('div');
    crown.id = 'mechanicalTop';
    crown.className = 'mechanical-top';
    timerObject.insertBefore(crown, timerObject.firstChild);

    const parts = [
      timerObject.querySelector('.stem-back'),
      dial,
      timerObject.querySelector('.stem-left'),
      timerObject.querySelector('.stem-right')
    ].filter(Boolean);
    parts.forEach(part => crown.appendChild(part));

    const scale = document.createElement('div');
    scale.className = 'mechanical-scale';
    crown.insertBefore(scale, dial);

    const index = document.createElement('div');
    index.className = 'body-index';
    timerObject.appendChild(index);
  }

  let active = false;
  let lastX = 0;
  let accumulatedX = 0;
  let syntheticY = 0;
  let pointerId = null;
  const PX_PER_MINUTE = 6;
  const SYNTHETIC_Y_STEP = 8;

  function minutesFromDisplay() {
    const parts = display.textContent.trim().split(':');
    return (Number(parts[0]) || 0) + (Number(parts[1]) || 0) / 60;
  }

  function crownAngle() {
    const minutes = Math.max(0, Math.min(60, minutesFromDisplay()));
    return -150 + (minutes / 60) * 300;
  }

  function syncCrown(animate = true) {
    crown.classList.toggle('no-animate', !animate || active);
    crown.style.setProperty('--crown-angle', `${crownAngle()}deg`);
  }

  function setHint(text) {
    if (hint) hint.textContent = text;
  }

  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    active = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    syntheticY = e.clientY;
    accumulatedX = 0;
    crown.classList.add('dragging');
    crown.classList.add('no-animate');
    requestAnimationFrame(() => setHint('Drag left / right — the top rotates like a real Pomodoro'));
  }, true);

  dial.addEventListener('pointermove', (e) => {
    if (!active || e.__pomodoroMechanicalSynthetic) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const dx = e.clientX - lastX;
    lastX = e.clientX;
    accumulatedX += dx;

    while (Math.abs(accumulatedX) >= PX_PER_MINUTE) {
      const step = accumulatedX > 0 ? 1 : -1;
      syntheticY -= step * SYNTHETIC_Y_STEP;

      const synthetic = new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'touch',
        isPrimary: true,
        clientX: e.clientX,
        clientY: syntheticY,
        buttons: 1,
        pressure: e.pressure || 0.5
      });
      Object.defineProperty(synthetic, '__pomodoroMechanicalSynthetic', { value: true });
      dial.dispatchEvent(synthetic);

      accumulatedX -= step * PX_PER_MINUTE;
      syncCrown(false);
    }
  }, true);

  function endDrag() {
    if (!active) return;
    active = false;
    pointerId = null;
    crown.classList.remove('dragging', 'no-animate');
    syncCrown(true);
    setHint('Drag the top left / right to set time');
  }

  dial.addEventListener('pointerup', endDrag, true);
  dial.addEventListener('pointercancel', endDrag, true);
  dial.addEventListener('lostpointercapture', endDrag, true);

  // Keep the mechanical crown in sync after reset, mode changes or settings edits.
  const observer = new MutationObserver(() => syncCrown(true));
  observer.observe(display, { childList: true, characterData: true, subtree: true });

  syncCrown(false);
  setHint('Drag the top left / right to set time');
})();
