import './styles/main.css';
import { eventFromLocation, events } from './config/events.js';
import { renderHome } from './pages/home.js';
import { renderSimulator } from './pages/simulator.js';
import { renderMapBuilder } from './pages/mapBuilder.js';
import { loadSavedMap } from './config/maps.js';
import { loadLibraryMap } from './config/mapLibrary.js';
import { renderTractorConfig, renderTractorSelect } from './pages/tractorConfig.js';
import { renderTractorPlacement } from './pages/tractorPlacement.js';
import { renderCustomTractorBuilder } from './pages/customTractorBuilder.js';

const app = document.querySelector('#app');
const search = new URLSearchParams(window.location.search);
const selectedEvent = eventFromLocation();
const mode = search.get('mode');
const developerMode = search.get('dev') === 'true';

if (mode === 'custom-tractor') {
  await renderCustomTractorBuilder(app);
} else if (mode === 'tractor-placement') {
  await renderTractorPlacement(app);
} else if (mode === 'tractor-config') {
  renderTractorConfig(app);
} else if (mode === 'tractor-select') {
  renderTractorSelect(app);
} else if (mode === 'builder') {
  await renderMapBuilder(app);
} else if (mode === 'map') {
  const libraryId = search.get('map');
  try {
    const map = libraryId ? await loadLibraryMap(libraryId) : loadSavedMap();
    renderSimulator(app, { id: libraryId ?? 'custom-map', name: map.name }, map, {
      returnToBuilder: !libraryId,
    });
  } catch (error) {
    renderMapError(app, error.message);
  }
} else if (selectedEvent) {
  renderSimulator(app, selectedEvent);
} else {
  renderHome(app, events, { developerMode });
}

function renderMapError(root, message) {
  root.innerHTML = `
    <main class="error-page">
      <p class="kicker">Map unavailable</p>
      <h1>Could not load map.</h1>
      <p>${escapeHtml(message)}</p>
      <a class="back-link" href="/">← Return home</a>
    </main>
  `;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
