(() => {
  'use strict';

  const dial = document.getElementById('dial');
  const crown = document.getElementById('mechanicalTop');
  const display = document.getElementById('timeDisplay');
  const hint = document.getElementById('dialHint');
  if (!dial || !crown || !display) return;

  let active = false;
  let lastX = 0;
  let accumulatedX = 0;
  let syntheticY = 0;
  let pointerId = null;
  const PX_PER_MINUTE = 7;
  const SYNTHETIC_Y_STEP = 8;

  function minutesFromDisplay() {
    const parts = display.textContent.trim().split(':');
    const m = Number(parts[0]) || 0;
    const s = Number(parts[1]) || 0;
    return m + s / 60;
  }

  function crownAngle() {
    // A physical Pomodoro dial makes one useful sweep across 0-60 minutes.
    // Values above 60 remain at the end stop visually while the digital timer can still exceed 60.
    const minutes = Math.max(0, Math.min(60, minutesFromDisplay()));
    return -150 + (minutes / 60) * 300;
  }

  function syncCrown(animate = true) {
    if (!active && animate) crown.style.transition = '';
    crown.style.setProperty('--crown-angle', `${crownAngle()}deg`);
  }

  function setHint(text) {
    if (hint) hint.textContent = text;
  }

  // Capture native horizontal moves before the old vertical-drag handler sees them.
  // We translate the horizontal gesture into synthetic vertical steps so the existing
  // timer state, persistence and settings logic remain the single source of truth.
  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    active = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    syntheticY = e.clientY;
    accumulatedX = 0;
    crown.classList.add('dragging');
    requestAnimationFrame(() => setHint('Drag left / right to rotate and set minutes'));
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
      const minuteStep = accumulatedX > 0 ? 1 : -1;
      // Existing app logic: upward movement increases time, downward decreases it.
      syntheticY -= minuteStep * SYNTHETIC_Y_STEP;

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

      accumulatedX -= minuteStep * PX_PER_MINUTE;
      syncCrown(false);
    }
  }, true);

  function endDrag() {
    if (!active) return;
    active = false;
    pointerId = null;
    crown.classList.remove('dragging');
    syncCrown(true);
    setTimeout(() => setHint('Drag the top left / right to set time'), 0);
  }

  dial.addEventListener('pointerup', endDrag, true);
  dial.addEventListener('pointercancel', endDrag, true);
  dial.addEventListener('lostpointercapture', endDrag, true);

  // Keep the physical crown synchronized when mode/reset/settings change the time.
  const observer = new MutationObserver(() => syncCrown(true));
  observer.observe(display, { childList: true, characterData: true, subtree: true });

  syncCrown(false);
  setHint('Drag the top left / right to set time');
})();
