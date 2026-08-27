import { tractorAssetFolders } from '../config/tractorModels.js';
import { createCustomTractorEditor } from '../world/tractor/createCustomTractorEditor.js';

const stages = ['Driveline', 'Frame', 'Operator station', 'Analysis'];

export async function renderCustomTractorBuilder(root) {
  root.innerHTML = `<main class="custom-cad-shell">
    <header class="cad-topbar"><a href="/" aria-label="Home">QS</a><div><b>Custom Tractor</b><span data-save-state>Unsaved concept</span></div>
      <div class="cad-view-controls"><button data-view="perspective" class="active">Perspective</button><button data-view="top">Top</button><button data-view="front">Front</button><button data-view="right">Right</button><button data-projection>Orthographic</button><button data-save-json>Save JSON</button><button data-load-json>Load JSON</button><input type="file" accept="application/json,.json" data-json-file hidden></div>
    </header>
    <aside class="cad-steps"><p>Design workflow</p>${stages.map((stage, index) => `<button data-stage-label="${index}" ${index ? 'disabled' : ''}><i>0${index + 1}</i><span>${stage}<small>${index ? 'Locked' : 'In progress'}</small></span></button>`).join('')}<section class="cad-parts-browser"><header><span>Parts</span><small><i></i> Constrained</small><small><i></i> Unconstrained</small></header><div data-parts-list><p class="cad-empty-parts">No parts added</p></div></section></aside>
    <section class="cad-viewport" data-cad-view><div class="cad-hud"><span data-tool-label>SELECT</span><span>Shift + drag to pan</span><span>Grid 100 mm</span><span data-projection-label>Perspective</span></div></section>
    <aside class="cad-inspector"><div class="cad-stage" data-stage="0">
      <p class="panel-kicker">01 / Driveline</p><h1>Lay out the power path.</h1><p class="cad-instruction">Add one or more core components, position them, then bridge the power path with at least two connections. Multiple engines need couplers; clutches and driveshafts support at most two connections.</p>
      ${assetPicker('Engine', 'engine', tractorAssetFolders.engine)}${assetPicker('Clutch', 'clutch', tractorAssetFolders.clutch)}${assetPicker('Transaxle', 'transaxle', tractorAssetFolders.transaxle)}
      <button class="cad-wide-action" data-add-wheel-pair="rear">＋ Add rear wheel pair</button>
      <h3>Power connections</h3><div class="cad-button-grid"><button data-add="driveshaft">＋ Driveshaft</button><button data-add="gearbox">＋ Gearbox</button><button data-add="coupler">＋ Coupler</button><button data-add="belt">＋ Belt</button><button data-add="chain">＋ Chain</button></div>
      <section class="cad-transmission-config">
        <h3>Transmission setup</h3>
        <label class="cad-automatic-field"><input type="checkbox" data-automatic-transmission checked> Automatic transmission</label>
        <label class="cad-field">Final drive ratio<input type="number" min="0.5" max="10" step="0.1" value="1" data-final-drive-ratio></label>
        <div class="cad-manual-ratios" data-manual-ratios hidden>
          <label class="cad-field">1st gear ratio<input type="number" min="0.1" max="20" step="0.1" value="3" data-forward-ratio></label>
          <label class="cad-field">2nd gear ratio<input type="number" min="0.1" max="20" step="0.1" value="2" data-forward-ratio></label>
          <label class="cad-field">3rd gear ratio<input type="number" min="0.1" max="20" step="0.1" value="1" data-forward-ratio></label>
        </div>
        <div class="cad-speed-preview"><span>Calculated speeds</span><div data-speed-preview></div></div>
      </section>
      <label class="cad-field">Selected part<select data-part-list></select></label>${transformFields()}${mateControls()}
      <button class="cad-primary" data-next="driveline">Validate driveline →</button>
    </div><div class="cad-stage" data-stage="1" hidden>
      <p class="panel-kicker">02 / Structure</p><h1>Sketch the frame.</h1><p class="cad-instruction">Start a sketch, switch to the top view, and click points on the grid. Close and extrude the polygon into a structural frame plate.</p>
      <label class="cad-field">Sketch plane<select data-sketch-plane><option value="XZ">XZ · Top</option><option value="XY">XY · Right</option><option value="YZ">YZ · Front</option></select></label><div class="cad-button-grid"><button data-sketch-start>✎ New 2D sketch</button><button data-sketch-undo disabled>↶ Undo point</button><button data-sketch-finish disabled>▰ Close + extrude</button><button data-add="bracket">＋ Bracket</button></div>
      <label class="cad-field">Sheet thickness (m)<input type="number" data-extrude-depth min=".01" max="1" step=".01" value=".01"></label>
      <button class="cad-wide-action" data-add-wheel-pair="front">＋ Add front wheel pair</button><button class="cad-wide-action" data-add="axle">＋ Add front axle</button>
      <label class="cad-field">Selected part<select data-part-list></select></label>${transformFields()}${mateControls()}
      <button class="cad-primary" data-next="frame">Frame complete →</button>
    </div><div class="cad-stage" data-stage="2" hidden>
      <p class="panel-kicker">03 / Controls</p><h1>Build the operator station.</h1><p class="cad-instruction">Install a seat, steering control, and three pedals: clutch, left brake, and right brake. Steering must remain within reach of the seat.</p>
      ${assetPicker('Seat', 'seat', tractorAssetFolders.seat)}<label class="cad-field">Steering mechanism<select data-steering><option value="">Choose steering…</option><option value="joystick">Joystick</option><option value="wheel">Steering wheel</option></select></label>
      <h3>Required pedals</h3><div class="cad-button-grid"><button data-add-pedal="clutch-pedal">＋ Clutch pedal</button><button data-add-pedal="left-brake-pedal">＋ Left brake pedal</button><button data-add-pedal="right-brake-pedal">＋ Right brake pedal</button><button data-add="display">＋ Instrument display</button></div>
      <label class="cad-field">Selected part<select data-part-list></select></label>${transformFields()}${mateControls()}
      <button class="cad-primary" data-next="operator">Check ergonomics →</button>
    </div><div class="cad-stage" data-stage="3" hidden>
      <p class="panel-kicker">04 / Analysis</p><h1>Ready for review.</h1><p class="cad-instruction">The build report uses component volume and material density, the weighted center of mass, driveline losses, and structural connection quality.</p>
      <section class="cad-facing-config"><h3>Driving direction</h3><p>Choose which direction is forward for this assembly. The arrow in the viewport shows the direction the tractor will drive.</p><label class="cad-field">Tractor faces<select data-facing-direction><option value="positive-x">Right in top view (+X)</option><option value="negative-x">Left in top view (-X)</option><option value="positive-z">Bottom in top view (+Z)</option><option value="negative-z">Top in top view (-Z)</option></select></label></section>
      <button class="cad-primary cad-complete" data-complete>Complete build</button>
    </div><p class="cad-status" data-status>Select an engine to begin.</p></aside>
    <footer class="cad-toolbar"><button data-mode="translate" class="active">↔ Move <kbd>G</kbd></button><button data-mode="rotate">⟳ Rotate <kbd>R</kbd></button><button data-mode="scale">↗ Scale <kbd>S</kbd></button><label><input type="checkbox" data-snap checked> Snap</label><button data-delete>Delete</button></footer>
  </main><section class="cad-completion-screen" data-completion-screen hidden><div><p class="panel-kicker">Build complete</p><h1>Your custom tractor</h1><div class="cad-results" data-results></div><nav><button data-return-build>← Return to build</button><a href="/">Go to homepage</a></nav></div></section>`;

  let stage = 0;
  let highestCompletedStage = 0;
  const status = root.querySelector('[data-status]');
  const editor = await createCustomTractorEditor(root.querySelector('[data-cad-view]'), ({ parts, selected, transform, sketchPoints = 0 }) => {
    root.querySelectorAll('[data-part-list]').forEach((select) => {
      const value = selected ?? select.value;
      select.innerHTML = parts.map((part) => `<option value="${part.id}" ${part.id === value ? 'selected' : ''}>${part.name}</option>`).join('');
    });
    root.querySelector('[data-parts-list]').innerHTML = parts.length ? parts.map((part) => `<div class="cad-part-entry"><button data-browser-part="${part.id}" class="${part.constrained ? 'constrained' : 'unconstrained'} ${part.id === selected ? 'selected' : ''}"><span>${part.name}</span><small>${part.constrained ? 'Fully constrained' : 'Under-constrained'}</small></button>${part.mates.length ? `<div class="cad-part-mates">${part.mates.map((mate) => `<div><span>${mate.direction === 'to' ? 'Mated to' : 'Mated from'} ${mate.otherName}</span>${mate.direction === 'to' ? `<label><input type="checkbox" data-flip-existing-mate="${mate.movingId}" ${mate.flipped ? 'checked' : ''}> Flip</label>` : ''}<button data-remove-mate="${mate.movingId}" title="Remove mate" aria-label="Remove mate with ${mate.otherName}">×</button></div>`).join('')}</div>` : ''}</div>`).join('') : '<p class="cad-empty-parts">No parts added</p>';
    root.querySelectorAll('[data-mate-part]').forEach((select) => {
      const value = select.value;
      select.innerHTML = `<option value="">Choose part…</option>${parts.map((part) => `<option value="${part.id}" ${part.id === value ? 'selected' : ''}>${part.name}</option>`).join('')}`;
    });
    if (transform) root.querySelectorAll('[data-transform]').forEach((input) => { if (document.activeElement !== input) input.value = transform[input.dataset.transform].toFixed(3); });
    const undo = root.querySelector('[data-sketch-undo]'); const finish = root.querySelector('[data-sketch-finish]');
    if (undo) undo.disabled = sketchPoints < 1;
    if (finish) finish.disabled = sketchPoints < 3;
  });
  const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  const showStage = (next) => { stage = next; highestCompletedStage = Math.max(highestCompletedStage, next); root.querySelectorAll('[data-stage]').forEach((panel) => { panel.hidden = Number(panel.dataset.stage) !== stage; }); root.querySelectorAll('[data-stage-label]').forEach((button, index) => { button.disabled = index > highestCompletedStage; button.classList.toggle('active', index === stage); button.querySelector('small').textContent = index < highestCompletedStage ? 'Complete' : index === stage ? 'In progress' : 'Locked'; }); };

  root.querySelectorAll('[data-asset]').forEach((select) => select.addEventListener('change', async () => { if (!select.value) return; await editor.addModel(select.dataset.asset, select.value); setStatus(`${label(select.dataset.asset)} installed. Select another to add more, or position it with the move gizmo.`); select.value = ''; }));
  root.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => { editor.addPrimitive(button.dataset.add); setStatus(`${label(button.dataset.add)} added. Drag the gizmo to place it.`); }));
  root.querySelectorAll('[data-add-wheel-pair]').forEach((button) => button.addEventListener('click', async () => { await editor.addWheelPair(button.dataset.addWheelPair); button.disabled = true; setStatus(`${label(button.dataset.addWheelPair)} wheels installed. Mate each wheel into the assembly.`); }));
  root.querySelector('[data-steering]').addEventListener('change', async (event) => { if (!event.target.value) return; await editor.addSteering(event.target.value); event.target.disabled = true; setStatus('Steering installed. Move it close to the seat.'); });
  root.querySelectorAll('[data-add-pedal]').forEach((button) => button.addEventListener('click', async () => {
    await editor.addPedal(button.dataset.addPedal);
    setStatus(`${label(button.dataset.addPedal)} installed. Position and mate it into the operator station.`);
  }));
  root.querySelectorAll('[data-part-list]').forEach((select) => select.addEventListener('change', () => editor.select(select.value)));
  root.querySelector('[data-parts-list]').addEventListener('click', (event) => { const remove = event.target.closest('[data-remove-mate]'); if (remove) { editor.removeMate(remove.dataset.removeMate); setStatus('Mate removed. Revalidate the affected assembly stage.'); return; } const button = event.target.closest('[data-browser-part]'); if (button) editor.select(button.dataset.browserPart); });
  root.querySelector('[data-parts-list]').addEventListener('change', (event) => {
    if (!event.target.matches('[data-flip-existing-mate]')) return;
    editor.setMateFlipped(event.target.dataset.flipExistingMate, event.target.checked);
    setStatus(`Mate direction ${event.target.checked ? 'flipped' : 'restored'}.`);
  });
  root.querySelectorAll('[data-stage-label]').forEach((button) => button.addEventListener('click', () => { const target = Number(button.dataset.stageLabel); if (target <= highestCompletedStage) { showStage(target); setStatus(`Returned to ${stages[target].toLowerCase()}. Changes may require revalidation.`); } }));
  root.querySelectorAll('[data-create-mate]').forEach((button) => button.addEventListener('click', () => {
    setStatus('Mate tool: click a face on the selected part, then click its mating face on the fixed part.');
    editor.beginMateFromSelected((result) => setStatus(result.message, !result.ok));
  }));
  root.querySelector('[data-automatic-transmission]').addEventListener('change', updateTransmissionPreview);
  root.querySelectorAll('[data-final-drive-ratio], [data-forward-ratio]').forEach((input) => input.addEventListener('input', updateTransmissionPreview));
  updateTransmissionPreview();
  root.querySelector('[data-sketch-start]').addEventListener('click', () => { const plane = root.querySelector('[data-sketch-plane]').value; editor.beginSketch(plane); root.querySelector('[data-sketch-start]').disabled = true; editor.setView({ XZ: 'top', XY: 'right', YZ: 'front' }[plane]); setStatus(`Sketch active on the ${plane} plane: click points on the grid to define a closed profile.`); });
  root.querySelector('[data-sketch-undo]').addEventListener('click', () => editor.undoSketchPoint());
  root.querySelector('[data-sketch-finish]').addEventListener('click', () => { const depth = Number(root.querySelector('[data-extrude-depth]').value); const result = editor.finishSketch(depth); if (!result.ok) return setStatus(result.message, true); root.querySelector('[data-sketch-start]').disabled = false; setStatus('Profile closed and extruded. Dimension and mate the new frame part.'); });
  root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { root.querySelectorAll('[data-mode]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); editor.setMode(button.dataset.mode); root.querySelector('[data-tool-label]').textContent = button.dataset.mode.toUpperCase(); }));
  root.querySelector('[data-snap]').addEventListener('change', (event) => editor.setSnap(event.target.checked));
  root.querySelector('[data-delete]').addEventListener('click', () => editor.removeSelected());
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { root.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button)); editor.setView(button.dataset.view); }));
  root.querySelector('[data-projection]').addEventListener('click', (event) => { const orthographic = editor.toggleProjection(); event.target.textContent = orthographic ? 'Perspective' : 'Orthographic'; root.querySelector('[data-projection-label]').textContent = orthographic ? 'Orthographic' : 'Perspective'; });
  root.querySelector('[data-next="driveline"]').addEventListener('click', () => { const result = editor.validateDriveline(); if (!result.ok) return setStatus(result.message, true); editor.showPowerPath(); showStage(1); setStatus('Driveline validated. The green overlay shows engine-to-transaxle power flow.'); });
  root.querySelector('[data-next="frame"]').addEventListener('click', () => { const result = editor.validateFrame(); if (!result.ok) return setStatus(result.message, true); showStage(2); setStatus('Frame accepted. Add a seat and steering mechanism.'); });
  root.querySelector('[data-next="operator"]').addEventListener('click', () => { const result = editor.validateOperator(); if (!result.ok) return setStatus(result.message, true); showStage(3); setStatus('All design requirements met. Run the final analysis.'); });
  root.querySelector('[data-facing-direction]').addEventListener('change', (event) => { editor.setFacingDirection(event.target.value); setStatus(`Forward direction set to ${event.target.selectedOptions[0].textContent}.`); });
  editor.setFacingDirection(root.querySelector('[data-facing-direction]').value);
  root.querySelector('[data-complete]').addEventListener('click', () => { const metrics = editor.complete(getTransmissionSetup()); const facingDirection = root.querySelector('[data-facing-direction]').value; editor.saveForSimulator(metrics, facingDirection); root.querySelector('[data-results]').innerHTML = `<div><span>Mass</span><strong>${metrics.massKg} kg</strong></div><div><span>Center of mass</span><strong>${metrics.centerOfMass.map((value) => `${value} m`).join(' / ')}</strong></div><div><span>Estimated horsepower</span><strong>${metrics.horsepower} hp</strong></div><div><span>Top speed</span><strong>${metrics.topSpeedMph.toFixed(1)} mph</strong></div><div><span>Transmission</span><strong>${metrics.transmission === 'automatic' ? 'Automatic' : `${metrics.gearCount}-speed manual`}</strong></div><div><span>Driving direction</span><strong>${root.querySelector('[data-facing-direction]').selectedOptions[0].textContent}</strong></div><div><span>Driveline efficiency</span><strong>${metrics.efficiency}%</strong></div><div><span>Durability</span><strong>${metrics.durability}%</strong></div>`; root.querySelector('[data-completion-screen]').hidden = false; root.querySelector('[data-complete]').disabled = true; setStatus('Build saved and selected for the simulator.'); });
  root.querySelector('[data-return-build]').addEventListener('click', () => { root.querySelector('[data-completion-screen]').hidden = true; root.querySelector('[data-complete]').disabled = false; showStage(3); });
  root.querySelectorAll('[data-transform]').forEach((input) => input.addEventListener('change', () => editor.updateSelectedTransform(Object.fromEntries([...root.querySelectorAll(`[data-stage="${stage}"] [data-transform]`)].map((field) => [field.dataset.transform, Number(field.value)])))));
  root.querySelector('[data-save-json]').addEventListener('click', () => downloadJson({ ...editor.serializeProject(), transmissionSetup: getTransmissionSetup(), facingDirection: root.querySelector('[data-facing-direction]').value }, 'custom-tractor.json'));
  root.querySelector('[data-load-json]').addEventListener('click', () => root.querySelector('[data-json-file]').click());
  root.querySelector('[data-json-file]').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try { const project = JSON.parse(await file.text()); await editor.loadProject(project); applyTransmissionSetup(project.transmissionSetup); applyFacingDirection(project.facingDirection); highestCompletedStage = 0; setStatus(`${file.name} loaded. Revalidate each design stage.`); showStage(0); }
    catch (error) { setStatus(`Could not load tractor: ${error.message}`, true); }
    event.target.value = '';
  });

  function getTransmissionSetup() {
    const automatic = root.querySelector('[data-automatic-transmission]').checked;
    const finalDriveRatio = Math.min(10, Math.max(0.5, Number(root.querySelector('[data-final-drive-ratio]').value) || 1));
    const gearRatios = [...root.querySelectorAll('[data-forward-ratio]')].map((input) => Math.min(20, Math.max(0.1, Number(input.value) || 1)));
    return { transmission: automatic ? 'automatic' : 'manual', finalDriveRatio, gearRatios };
  }

  function updateTransmissionPreview() {
    const setup = getTransmissionSetup();
    root.querySelector('[data-manual-ratios]').hidden = setup.transmission === 'automatic';
    const topSpeed = 6 / setup.finalDriveRatio;
    const speeds = setup.transmission === 'automatic'
      ? [`Automatic range · ${topSpeed.toFixed(1)} mph`]
      : setup.gearRatios.map((ratio, index) => `Gear ${index + 1} · ${(topSpeed * setup.gearRatios.at(-1) / ratio).toFixed(1)} mph`);
    root.querySelector('[data-speed-preview]').innerHTML = speeds.map((speed) => `<b>${speed}</b>`).join('');
  }

  function applyTransmissionSetup(setup) {
    if (!setup) return;
    root.querySelector('[data-automatic-transmission]').checked = setup.transmission !== 'manual';
    root.querySelector('[data-final-drive-ratio]').value = setup.finalDriveRatio ?? 1;
    root.querySelectorAll('[data-forward-ratio]').forEach((input, index) => { input.value = setup.gearRatios?.[index] ?? input.value; });
    updateTransmissionPreview();
  }

  function applyFacingDirection(direction) {
    if (!direction) return;
    root.querySelector('[data-facing-direction]').value = direction;
    editor.setFacingDirection(direction);
  }
}

function assetPicker(title, role, files = []) { return `<label class="cad-field">${title}<select data-asset="${role}"><option value="">Choose ${title.toLowerCase()}…</option>${files.map((file) => `<option value="${file}">${file.split('/').pop().replace('.glb', '').replaceAll('_', ' ')}</option>`).join('')}</select></label>`; }
function transformFields() { return `<fieldset class="cad-dimensions cad-dimensions-full"><legend>Part properties</legend>${[['px','X position'],['py','Y position'],['pz','Z position'],['rx','X angle'],['ry','Y angle'],['rz','Z angle'],['sx','Length'],['sy','Height'],['sz','Width']].map(([key, name]) => `<label>${name}<input type="number" value="${key[0] === 's' ? 1 : 0}" step="${key[0] === 'r' ? 1 : .01}" data-transform="${key}"></label>`).join('')}</fieldset>`; }
function mateControls() { return `<section class="cad-mates"><h3>Assembly constraints</h3><p>Select the moving part and start the mate tool. Click its mating face in the viewport, then click the matching face on the fixed part. Afterward, flip the direction from the mate entry in the parts list.</p><button data-create-mate>Pick mating faces…</button></section>`; }
function label(value) { return value.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase()); }
function downloadJson(value, filename) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); }
