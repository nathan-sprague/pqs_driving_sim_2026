import { formatHighScore, highScoreEvents, loadHighScores } from '../config/highScores.js';
import { unofficialEvents } from '../config/mapLibrary.js';

export function renderHome(root, events, { developerMode = false } = {}) {
  document.title = developerMode ? 'Developer Tools | Quarter Scale' : 'Quarter Scale Competition';
  if (developerMode) renderDeveloperHome(root, events);
  else renderPlayerHome(root, events);
}

function renderPlayerHome(root, events) {
  const highScores = loadHighScores();
  root.innerHTML = `
    <main class="player-home-shell">
      <header class="player-home-hero">
        <p class="brand-mark"><span>QS</span> Quarter Scale Competition</p>
        <p class="kicker">Driver paddock</p>
        <h1>Ready to<br><em>compete?</em></h1>
        <p>Choose your tractor, enter the full competition world, or practice one event at a time.</p>
      </header>
      <nav class="player-home-actions" aria-label="Competition options">
        <a href="?mode=tractor-select">
          <span>01 · Vehicle</span><strong>Pick your tractor</strong><i aria-hidden="true">→</i>
        </a>
        <a class="is-primary" href="?mode=map&amp;map=open_world">
          <span>02 · Open world</span><strong>Begin the competition</strong><i aria-hidden="true">→</i>
        </a>
        <details>
          <summary><span>03 · Practice</span><strong>Individual events</strong><i aria-hidden="true">⌄</i></summary>
          <div class="player-event-list">${events.map((event, index) => eventCard(event, index)).join('')}</div>
        </details>
        <details>
          <summary><span>04 · Community courses</span><strong>Unofficial Events</strong><i aria-hidden="true">⌄</i></summary>
          <div class="player-event-list">${unofficialEvents.map((event, index) => unofficialEventCard(event, index)).join('')}</div>
        </details>
        ${highScoreBoard(highScores)}
      </nav>
    </main>
  `;
}

function renderDeveloperHome(root, events) {
  const highScores = loadHighScores();
  root.innerHTML = `
    <main class="home-shell">
      <header class="hero">
        <p class="brand-mark"><span>QS</span> Engineering Simulator</p>
        <div class="hero-copy">
          <p class="kicker">Choose your proving ground</p>
          <h1>Built small.<br><em>Driven big.</em></h1>
          <p class="intro">Select an event to enter the simulator and inspect the quarter-scale tractor.</p>
        </div>
      </header>

      <section class="event-section" aria-labelledby="events-heading">
        <div class="section-heading">
          <h2 id="events-heading">Competition events</h2>
          <p>01 — 03</p>
        </div>
        <div class="event-grid">
          ${events.map((event, index) => eventCard(event, index)).join('')}
        </div>
        ${highScoreBoard(highScores)}
        <div class="home-tools">
          <a class="builder-entry custom-tractor-entry" href="?mode=custom-tractor">
            <span>CAD design studio</span>
            <strong>Build a custom tractor</strong>
            <i aria-hidden="true">→</i>
          </a>
          <a class="builder-entry" href="?mode=tractor-placement">
            <span>Model workshop</span>
            <strong>Place tractor parts</strong>
            <i aria-hidden="true">→</i>
          </a>
          <a class="builder-entry" href="?mode=tractor-config">
            <span>Vehicle setup</span>
            <strong>Configure tractor</strong>
            <i aria-hidden="true">→</i>
          </a>
          <a class="builder-entry" href="?mode=map&amp;map=open_world">
            <span>Free drive</span>
            <strong>Explore the open world</strong>
            <i aria-hidden="true">→</i>
          </a>
          <a class="builder-entry" href="?mode=builder">
            <span>Map workshop</span>
            <strong>Build a custom test course</strong>
            <i aria-hidden="true">→</i>
          </a>
        </div>
      </section>
    </main>
  `;
}

function highScoreBoard(scores) {
  return `
    <section class="home-high-scores" aria-labelledby="high-scores-heading">
      <div><span>Personal bests</span><h2 id="high-scores-heading">High scores</h2></div>
      <dl>
        ${highScoreEvents.map(({ id, name }) => `
          <div><dt>${name}</dt><dd>${Number.isFinite(scores[id]) ? `${formatHighScore(scores[id])} pts` : 'No score yet'}</dd></div>
        `).join('')}
      </dl>
    </section>
  `;
}

function eventCard(event, index) {
  return `
    <a class="event-card event-card--${index + 1}" href="?mode=map&amp;map=${event.mapId}">
      <div class="event-number">0${index + 1}</div>
      <div class="event-copy">
        <p>${event.eyebrow}</p>
        <h3>${event.name}</h3>
        <span>${event.description}</span>
      </div>
      <div class="event-arrow" aria-hidden="true">↗</div>
    </a>
  `;
}

function unofficialEventCard(event, index) {
  return eventCard({
    mapId: event.id,
    name: event.name,
    eyebrow: 'Unofficial event',
    description: event.description,
  }, index);
}
