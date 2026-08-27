import { createWorld } from '../world/createWorld.js';

export function renderSimulator(root, event, map = null, { returnToBuilder = false } = {}) {
  document.title = `${event.name} | Quarter Scale`;
  const eventName = escapeHtml(event.name);
  root.innerHTML = `
    <main class="simulator-shell">
      <div class="viewport" data-world></div>
      <header class="sim-header">
        <nav class="sim-navigation" aria-label="Simulator navigation">
          ${returnToBuilder ? '<a class="back-link" href="?mode=builder">← Course Builder</a>' : ''}
        </nav>
        <div class="event-title">
          <span>Event</span>
          <strong>${eventName}</strong>
        </div>
      </header>
      <div class="loading-panel" data-loading role="status">
        <span class="loading-ring"></span>
        <p>Assembling tractor</p>
      </div>
      <div class="controls-popup" data-controls-popup role="dialog" aria-modal="true" aria-labelledby="controls-title">
        <section>
          <span>Simulator controls</span>
          <h1 id="controls-title">Ready to drive?</h1>
          <div class="controls-popup-grid">
            <p><strong>Drive</strong><kbd>W</kbd> forward · <kbd>S</kbd> reverse/brake · <kbd>A</kbd>/<kbd>D</kbd> steer</p>
            <p><strong>Look</strong>Click the game, then move the mouse</p>
            <p><strong>Interact</strong><kbd>E</kbd> exit/enter tractor, carry objects, and open doors</p>
            <p><strong>On foot</strong><kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump</p>
            <p><strong>Other</strong><kbd>P</kbd> release hitch · <kbd>Tab</kbd> scores · <kbd>Esc</kbd> pause</p>
            <p><strong>Manual</strong>Hold <kbd>C</kbd>, then press a gear number, <kbd>R</kbd>, or <kbd>N</kbd></p>
          </div>
          <button type="button">Click anywhere to begin</button>
        </section>
      </div>
      <p class="scene-note">W forward · S reverse · A / D steer · E exit tractor · Click to look</p>
    </main>
  `;

  const controlsPopup = root.querySelector('[data-controls-popup]');
  controlsPopup.addEventListener('click', () => controlsPopup.remove(), { once: true });

  const world = createWorld(root.querySelector('[data-world]'), {
    eventId: event.id,
    map,
    showFps: returnToBuilder,
    onReady: () => root.querySelector('[data-loading]')?.classList.add('is-hidden'),
  });

  window.addEventListener('pagehide', world.dispose, { once: true });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
