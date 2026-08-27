import { loadTractorConfig, saveTractorConfig, saveTractorModel } from '../config/tractor.js';
import { createTractorViewer } from '../world/tractor/createTractorViewer.js';
import { CUSTOM_TRACTOR_MODEL_ID, hasCustomTractor, tractorModels } from '../config/tractorModels.js';

export function renderTractorSelect(root) {
  document.title = 'Pick Your Tractor | Quarter Scale';
  let config = loadTractorConfig();
  root.innerHTML = `<main class="tractor-config-shell tractor-select-shell">
    <section class="tractor-config-view tractor-select-view" data-tractor-view>
      <nav class="tractor-roster" aria-label="Tractor roster">
        <header><span>Competition garage</span><strong>Tractor roster</strong></header>
        <div data-tractor-roster>${tractorRoster(config.modelId)}</div>
        <a href="?mode=custom-tractor"><span>Design studio</span><strong>Build a custom tractor</strong></a>
      </nav>
      <div class="tractor-select-vehicle-name"><span>Selected machine</span><strong data-selected-tractor-name>${selectedTractorName(config.modelId)}</strong></div>
      <p>Drag to rotate · Scroll to zoom</p>
    </section>
    <aside class="tractor-config-panel tractor-select-panel">
      <a class="back-link" href="./">← Home</a>
      <p class="panel-kicker">Garage · Competition setup</p><h1>Choose your machine.</h1>
      <p class="tractor-select-intro">Review your tractor’s performance package, then take it to the competition. Stats are locked in the player garage.</p>
      <section class="tractor-stat-card" aria-label="Tractor performance statistics">
        <header><span>Performance</span><b>Race specification</b></header>
        ${tractorStat('Power', `${Math.round(config.powerHp)} hp`, 'power')}
        ${tractorStat('Top speed', `${config.topSpeedMph.toFixed(1)} mph`, 'speed')}
        ${tractorStat('Durability', `${Math.round(config.durability)}%`, 'durability')}
        ${tractorStat('Mass', `${Math.round(config.massLb).toLocaleString()} lb`, 'mass')}
        <div class="tractor-stat-detail"><span>Length</span><strong data-tractor-length>Measuring…</strong></div>
        <div class="tractor-stat-detail"><span>Width</span><strong data-tractor-width>Measuring…</strong></div>
        <div class="tractor-stat-detail"><span>Center of mass</span><strong data-tractor-spec="center">${config.centerOfMassInches.map((value) => `${value.toFixed(1)}″`).join(' / ')}</strong></div>
        <div class="tractor-stat-detail"><span>Transmission</span><strong data-tractor-spec="transmission">${config.transmission === 'manual' ? `${config.gearCount}-speed manual` : 'Automatic'}</strong></div>
      </section>
      <p class="config-status" data-config-status>Your current tractor is selected.</p>
      <div class="tractor-garage-actions">
        <a class="tractor-select-start" href="?mode=map&amp;map=open_world">Start the competition →</a>
      </div>
    </aside>
  </main>`;
  const createGarageViewer = (modelId) => createTractorViewer(root.querySelector('[data-tractor-view]'), modelId, {
    onLoad: ({ length, width }) => {
      if (modelId !== config.modelId) return;
      const specs = tractorModels[modelId]?.specs;
      root.querySelector('[data-tractor-length]').textContent = `${((specs?.lengthMetres ?? length) * 3.28084).toFixed(1)} ft`;
      root.querySelector('[data-tractor-width]').textContent = `${((specs?.widthMetres ?? width) * 3.28084).toFixed(1)} ft`;
    },
  });
  let viewer = createGarageViewer(config.modelId);
  root.querySelector('[data-tractor-roster]').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-tractor-choice]');
    if (!choice) return;
    saveTractorModel(choice.dataset.tractorChoice);
    config = loadTractorConfig();
    viewer.dispose();
    root.querySelector('[data-tractor-length]').textContent = 'Measuring…';
    root.querySelector('[data-tractor-width]').textContent = 'Measuring…';
    viewer = createGarageViewer(config.modelId);
    root.querySelector('[data-selected-tractor-name]').textContent = selectedTractorName(config.modelId);
    updateGarageSpecs();
    root.querySelectorAll('[data-tractor-choice]').forEach((button) => button.classList.toggle('is-selected', button === choice));
    root.querySelector('[data-config-status]').textContent = 'Selected. This tractor will be used in the competition.';
  });
  window.addEventListener('pagehide', viewer.dispose, { once: true });

  function updateGarageSpecs() {
    root.querySelector('[data-tractor-spec="power"]').textContent = `${Math.round(config.powerHp)} hp`;
    root.querySelector('[data-tractor-spec="speed"]').textContent = `${config.topSpeedMph.toFixed(1)} mph`;
    root.querySelector('[data-tractor-spec="durability"]').textContent = `${Math.round(config.durability)}%`;
    root.querySelector('[data-tractor-spec="mass"]').textContent = `${Math.round(config.massLb).toLocaleString()} lb`;
    root.querySelector('[data-tractor-spec="center"]').textContent = config.centerOfMassInches.map((value) => `${value.toFixed(1)}″`).join(' / ');
    root.querySelector('[data-tractor-spec="transmission"]').textContent = config.transmission === 'manual' ? `${config.gearCount}-speed manual` : 'Automatic';
  }
}

export function renderTractorConfig(root) {
  document.title = 'Configure Tractor | Quarter Scale';
  const config = loadTractorConfig();
  root.innerHTML = `<main class="tractor-config-shell">
    <section class="tractor-config-view" data-tractor-view><p>Drag to rotate · Scroll to zoom</p></section>
    <aside class="tractor-config-panel">
      <a class="back-link" href="./">← Home</a>
      <p class="panel-kicker">Vehicle setup</p><h1>Configure tractor</h1>
      <label>Tractor to drive<select data-config="modelId">${hasCustomTractor() ? `<option value="${CUSTOM_TRACTOR_MODEL_ID}" ${config.modelId === CUSTOM_TRACTOR_MODEL_ID ? 'selected' : ''}>My custom tractor</option>` : ''}${Object.entries(tractorModels).map(([id, model]) => `<option value="${id}" ${config.modelId === id ? 'selected' : ''}>${model.name}</option>`).join('')}</select></label>
      ${numberField('Weight (lb)', 'massLb', config.massLb, 100, 5000, 1)}
      <fieldset><legend>Center of mass (tractor-local inches)</legend>
        ${['X','Y','Z'].map((axis,index)=>numberField(axis, `com-${index}`, config.centerOfMassInches[index], -120, 120, .1)).join('')}
      </fieldset>
      <section class="weight-distribution" data-weight-distribution></section>
      ${numberField('Top speed (mph)', 'topSpeedMph', config.topSpeedMph, .5, 30, .1)}
      ${numberField('Power (hp)', 'powerHp', config.powerHp, 1, 200, 1)}
      ${numberField('Durability (%)', 'durability', config.durability, 0, 100, 1)}
      ${numberField('Idle RPM', 'idleRpm', config.idleRpm, 300, 5000, 50)}
      ${numberField('Maximum RPM', 'maxRpm', config.maxRpm, 400, 10000, 50)}
      <label>Transmission<select data-config="transmission"><option value="automatic" ${config.transmission==='automatic'?'selected':''}>Automatic</option><option value="manual" ${config.transmission==='manual'?'selected':''}>Manual</option></select></label>
      <section class="manual-config" data-manual-config>
        ${numberField('Forward gears', 'gearCount', config.gearCount, 1, 9, 1)}
        <div class="gear-ratio-grid" data-gear-ratios></div>
      </section>
      <p class="config-help">Manual: hold C, then press a gear number or R. Use C+N or C+0 for neutral.</p>
      <p class="config-status" data-config-status>Changes save automatically.</p>
    </aside>
  </main>`;
  let viewer = createTractorViewer(root.querySelector('[data-tractor-view]'), config.modelId);
  renderGearRatios(config.gearCount, config.gearRatios);
  root.querySelector('[data-manual-config]').classList.toggle('is-hidden', config.transmission !== 'manual');
  updatePreview(config);
  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-config="modelId"]')) {
      viewer.dispose();
      viewer = createTractorViewer(root.querySelector('[data-tractor-view]'), event.target.value);
    }
    if (event.target.matches('[data-config="gearCount"]')) {
      const currentRatios = [...root.querySelectorAll('[data-gear-ratio]')].map((input) => Number(input.value));
      renderGearRatios(Math.round(value('gearCount')), currentRatios);
    }
    const next = saveTractorConfig({ modelId: root.querySelector('[data-config="modelId"]').value, massLb: value('massLb'), centerOfMassInches: [value('com-0'),value('com-1'),value('com-2')], topSpeedMph: value('topSpeedMph'), powerHp: value('powerHp'), durability: value('durability'), idleRpm: value('idleRpm'), maxRpm: value('maxRpm'), transmission: root.querySelector('[data-config="transmission"]').value, gearCount: value('gearCount'), gearRatios: [...root.querySelectorAll('[data-gear-ratio]')].map((input) => Number(input.value)) });
    root.querySelector('[data-manual-config]').classList.toggle('is-hidden', next.transmission !== 'manual');
    updatePreview(next);
    root.querySelector('[data-config-status]').textContent = 'Saved. This setup will be used on the next drive.';
  });
  window.addEventListener('pagehide', viewer.dispose, { once: true });
  function value(name) { return Number(root.querySelector(`[data-config="${name}"]`).value); }
  function renderGearRatios(count, ratios) {
    const safeCount = Math.min(9, Math.max(1, Math.round(count) || 3));
    root.querySelector('[data-gear-ratios]').innerHTML = Array.from({ length: safeCount }, (_, index) => (
      numberField(`Gear ${index + 1} ratio`, `ratio-${index}`, ratios[index] ?? Math.max(1, safeCount - index), 0.1, 20, 0.01)
        .replace('data-config=', 'data-gear-ratio data-config=')
    )).join('');
  }
  function updatePreview(current) {
    viewer.setCenterOfMass(current.centerOfMassInches);
    const rearAxleInches = -0.25 / 0.0254;
    const frontAxleInches = 1.67 / 0.0254;
    const frontFraction = Math.min(1, Math.max(0, (current.centerOfMassInches[0] - rearAxleInches) / (frontAxleInches - rearAxleInches)));
    const rearFraction = 1 - frontFraction;
    root.querySelector('[data-weight-distribution]').innerHTML = `
      <h2>Static weight distribution</h2>
      <p><span>Front wheels</span><strong>${(current.massLb * frontFraction).toFixed(0)} lb · ${(frontFraction * 100).toFixed(1)}%</strong></p>
      <p><span>Rear wheels</span><strong>${(current.massLb * rearFraction).toFixed(0)} lb · ${(rearFraction * 100).toFixed(1)}%</strong></p>`;
  }
}

function tractorRoster(selectedId) {
  const entries = [
    ...(hasCustomTractor() ? [[CUSTOM_TRACTOR_MODEL_ID, { name: 'My custom tractor' }]] : []),
    ...Object.entries(tractorModels),
  ];
  return entries.map(([id, model], index) => `
    <button type="button" data-tractor-choice="${id}" class="${selectedId === id ? 'is-selected' : ''}">
      <small>${String(index + 1).padStart(2, '0')}</small><span>${model.name}</span><i>›</i>
    </button>
  `).join('');
}

function selectedTractorName(modelId) {
  if (modelId === CUSTOM_TRACTOR_MODEL_ID && hasCustomTractor()) return 'My custom tractor';
  return tractorModels[modelId]?.name ?? 'Competition tractor';
}

function tractorStat(label, value, key) {
  return `<div class="tractor-stat"><span>${label}</span><strong data-tractor-spec="${key}">${value}</strong></div>`;
}

function numberField(label, name, value, min, max, step) {
  return `<label>${label}<input type="number" min="${min}" max="${max}" step="${step}" value="${value}" data-config="${name}"></label>`;
}
