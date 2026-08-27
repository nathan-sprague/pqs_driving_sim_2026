import { createMapBuilder } from '../world/builder/createMapBuilder.js';
import { createEmptyMap, downloadMap, importMapFile, loadSavedMap, saveMap } from '../config/maps.js';
import { loadMapAssetNames } from '../config/mapAssets.js';

export async function renderMapBuilder(root) {
  document.title = 'Map Builder | Quarter Scale';
  const map = loadSavedMap();
  const mapAssets = await loadMapAssetNames();
  root.innerHTML = `
    <main class="builder-shell">
      <div class="builder-viewport" data-builder-world></div>
      <div class="builder-crosshair" aria-hidden="true">+</div>
      <header class="builder-topbar">
        <a class="back-link" href="./">← Home</a>
        <input class="map-name" data-map-name value="${escapeAttribute(map.name)}" aria-label="Map name">
        <div class="builder-actions">
          <label class="upload-button">Upload JSON<input type="file" accept="application/json,.json" data-map-upload></label>
          <button data-action="download">Download JSON</button>
          <button class="reset-map-button" data-action="reset-map">Reset course</button>
          <a href="?mode=map">Test drive</a>
        </div>
      </header>
      <aside class="builder-panel">
        <p class="panel-kicker">Map workshop</p>
        <h1>Course Builder</h1>
        <div class="builder-buttons">
          <button data-action="fly">Enter fly mode</button>
          <button data-action="add">+ Add block</button>
          <button data-action="add-nitro">+ Add nitrous oxide</button>
          <button data-action="add-post">+ Add maneuverability post</button>
          <button data-action="add-human">+ Add human</button>
          <button data-action="add-waypoint">+ Add waypoint marker</button>
          <button data-action="add-threshold">+ Add scoring threshold</button>
          <button data-action="add-chunk">+ Add chunk region</button>
          <button data-action="add-line">+ Add ground line</button>
          <button data-action="add-cart">+ Add cart</button>
          <button data-action="add-car">+ Add driving car</button>
          <button data-action="add-pulling-sled">+ Add pulling sled</button>
          <div class="asset-add-row">
            <select data-map-asset aria-label="GLB asset">
              ${mapAssets.length
    ? mapAssets.map((asset) => `<option value="${escapeAttribute(asset)}">${escapeHtml(asset)}</option>`).join('')
    : '<option value="">No GLB assets configured</option>'}
            </select>
            <button data-action="add-map-asset" ${mapAssets.length ? '' : 'disabled'}>+ Add GLB</button>
          </div>
          <button data-action="spawn">Set vehicle start here</button>
          <div class="vehicle-start-editor">
            <strong>Tractor start</strong>
            ${startVectorEditor('Position', 'position', 0.1)}
            ${startVectorEditor('Rotation', 'rotation', 1)}
          </div>
        </div>
        <p class="fly-help">Click the world to fly · W/A/S/D · Space/Ctrl · Shift fast · Escape or click an object to release</p>
        <p class="import-status" data-import-status aria-live="polite"></p>
        <section class="object-list-section">
          <div class="object-list-heading">
            <h2>Course objects</h2>
            <span data-object-count></span>
          </div>
          <div class="builder-group-actions">
            <button type="button" data-action="group">Group checked</button>
            <button type="button" data-action="duplicate">Duplicate</button>
          </div>
          <div class="builder-object-list" data-object-list></div>
        </section>
        <section class="chunk-list-section">
          <div class="object-list-heading">
            <h2>Chunks</h2>
            <span data-chunk-count></span>
          </div>
          <div class="builder-chunk-list" data-chunk-list></div>
        </section>
        <section class="block-editor is-empty" data-block-editor>
          <div class="editor-heading">
            <h2>Selected block</h2>
            <div class="editor-heading-actions">
              <button class="ungroup-button" data-action="ungroup-selected">Ungroup</button>
              <button class="delete-button" data-action="delete">Delete</button>
            </div>
          </div>
          <div class="builder-transform-modes">
            <button type="button" class="is-active" data-action="transform-mode" data-transform-mode="translate">Move</button>
            <button type="button" data-action="transform-mode" data-transform-mode="rotate">Rotate</button>
          </div>
          <label class="object-name-field">Object name<input type="text" maxlength="80" data-object-name></label>
          ${vectorEditor('Position', 'position', 0.1)}
          ${vectorEditor('Size', 'size', 0.1)}
          ${vectorEditor('Rotation', 'rotation', 1)}
          <label class="color-field">Color <input type="color" data-field="color" value="#c67a34"></label>
          <label class="post-classification-field">Post classification
            <select data-post-classification>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
            </select>
          </label>
          <label class="block-invisible-field"><input type="checkbox" data-block-invisible> Invisible while driving</label>
          <label class="block-initially-active-field"><input type="checkbox" data-block-initially-active> Present when map starts</label>
          <label class="block-shadow-field"><input type="checkbox" data-block-shadow> Cast shadow</label>
          <div class="block-physics-editor">
            <label><input type="checkbox" data-block-movable> Movable</label>
            <label class="block-mass-field">Mass / force to move (kg)
              <input type="number" min="0.1" max="10000" step="1" data-block-mass>
            </label>
          </div>
          <label class="object-impact-damage-field">Structural damage on impact (%)
            <input type="number" min="0" max="100" step="0.1" data-object-impact-damage value="0">
          </label>
          <div class="chunk-editor" data-chunk-editor>
            <label><input type="checkbox" data-chunk-initially-loaded> Loaded when the map starts</label>
            <p>Select the objects and scoring thresholds that this chunk loads and unloads.</p>
            <div class="chunk-object-members" data-chunk-object-list></div>
          </div>
          <div class="sign-editor" data-sign-editor>
            <label>Sign content
              <select data-sign-field="type">
                <option value="none">No sign</option>
                <option value="time">Time since start</option>
                <option value="distance">Distance travelled</option>
                <option value="text">Custom text</option>
              </select>
            </label>
            <label class="sign-text-field">Text
              <input type="text" maxlength="120" data-sign-field="text" placeholder="Enter sign text">
            </label>
            <p>The sign appears on the block's local front face.</p>
          </div>
          <div class="human-editor" data-human-editor>
            <label>Behavior<select data-human-behavior>
              <option value="stand">Stand</option>
              <option value="sit">Sit</option>
              <option value="walk">Walk around</option>
              <option value="waypoints">Walk to waypoints</option>
            </select></label>
            <label class="human-flag-field">Flag
              <select data-human-flag>
                <option value="none">No flag</option>
                <option value="green">Green flag</option>
                <option value="red">Red flag</option>
              </select>
            </label>
            <label class="human-flee-field"><input type="checkbox" data-human-flee> Walk away from nearby tractor</label>
            <div class="human-waypoint-editor" data-human-waypoint-editor>
              <label class="human-loop-field"><input type="checkbox" data-human-waypoint-loop> Loop waypoints</label>
              <p>Waypoint coordinates are offsets from the human's initial position.</p>
              <div data-human-waypoints></div>
              <button type="button" data-action="add-human-waypoint">+ Add waypoint</button>
            </div>
          </div>
          <div class="car-editor" data-car-editor>
            <label>Driving behavior<select data-car-behavior>
              <option value="coordinates">Drive to coordinates</option>
              <option value="player">Drive toward player</option>
            </select></label>
            <label>Damage to car when tractor hits (%)
              <input type="number" min="0" max="100" step="1" data-car-damage="tractorHitDamage">
            </label>
            <label>Damage to player when car hits (%)
              <input type="number" min="0" max="100" step="1" data-car-damage="carHitDamage">
            </label>
            <label>Maximum speed (mph)
              <input type="number" min="1" max="60" step="0.5" data-car-motion="maxSpeedMph">
            </label>
            <label>Acceleration (m/s²)
              <input type="number" min="0.2" max="15" step="0.1" data-car-motion="acceleration">
            </label>
            <div class="car-destination-editor" data-car-destination-editor>
              <p>Enter absolute map coordinates. The car visits them in order and loops.</p>
              <div data-car-destinations></div>
              <button type="button" data-action="add-car-destination">+ Add destination</button>
            </div>
          </div>
          <div class="threshold-editor" data-threshold-editor>
            <label>Threshold action
            <select data-threshold-action>
              <option value="all-start" hidden>Start all counters (legacy)</option>
              <option value="all-stop" hidden>Stop all counters (legacy)</option>
              <option value="maneuver-start">Start maneuverability scoring</option>
              <option value="maneuver-stop">Disqualify maneuverability scoring</option>
              <option value="lap-pt1">Lap pt1</option>
              <option value="lap-pt2">Lap pt2</option>
              <option value="durability-disqualify">Disqualify durability</option>
              <option value="clear-breakdown-smoke">Clear breakdown smoke</option>
              <option value="pulling-start">Start pulling distance</option>
              <option value="pulling-stop">Stop pulling distance</option>
              <option value="message">Show custom message</option>
              <option value="stop-tractor">Stop the tractor</option>
              <option value="objects">Add/remove objects</option>
              <option value="chunks">Load/unload chunks</option>
            </select>
            </label>
            <label class="threshold-message-field">Message
              <input type="text" maxlength="240" data-threshold-message placeholder="Message shown on HUD">
            </label>
            <label class="threshold-message-field">Visible for (seconds)
              <input type="number" min="0.5" max="30" step="0.5" data-threshold-duration value="3">
            </label>
            <label class="threshold-stop-field">Freeze for (seconds)
              <input type="number" min="0.5" max="30" step="0.5" data-threshold-stop-duration value="2">
            </label>
            <div class="threshold-objects-field">
              <p>Choose what happens to each object when this threshold is crossed.</p>
              <div data-threshold-object-list></div>
            </div>
            <div class="threshold-chunks-field">
              <p>Choose what happens to each chunk when this threshold is crossed.</p>
              <div data-threshold-chunk-list></div>
            </div>
          </div>
          <div class="line-editor" data-line-editor>
            <label>Line thickness
              <input type="number" min="0.02" max="2" step="0.02" data-line-field="thickness">
            </label>
            <label class="line-curve-field"><input type="checkbox" data-line-field="curved"> Smooth curves between points</label>
            <div class="line-points" data-line-points></div>
            <button type="button" data-action="add-line-point">+ Add point</button>
          </div>
          <p class="empty-selection">Click a block in the viewport to edit it.</p>
        </section>
      </aside>
    </main>
  `;

  const editor = root.querySelector('[data-block-editor]');
  let selectedBlock = null;
  const checkedObjectIds = new Set();
  let builder;
  builder = createMapBuilder(root.querySelector('[data-builder-world]'), map, {
    onMapChange(updatedMap) {
      saveMap(updatedMap);
      renderObjectList(root, updatedMap, selectedBlock?.id, checkedObjectIds);
      renderChunkList(root, updatedMap);
    },
    onSelectionChange(block) {
      const selectionChanged = selectedBlock?.id !== block?.id;
      selectedBlock = block;
      populateEditor(editor, block, map);
      if (!selectionChanged) return;
      const group = block?.type === 'group'
        ? map.groups?.find((candidate) => candidate.id === block.id)
        : map.groups?.find((candidate) => candidate.objectIds.includes(block?.id));
      checkedObjectIds.clear();
      (group?.objectIds ?? (block?.type !== 'chunk' && block ? [block.id] : [])).forEach((id) => checkedObjectIds.add(id));
      renderObjectList(root, map, block?.id, checkedObjectIds);
    },
  });
  renderObjectList(root, map, null, checkedObjectIds);
  renderChunkList(root, map);
  populateVehicleStart(root, map.vehicleStart);

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'fly') builder.enterFlyMode();
    if (action === 'transform-mode') {
      const button = event.target.closest('[data-transform-mode]');
      builder.setTransformMode(button.dataset.transformMode);
      root.querySelectorAll('[data-transform-mode]').forEach((entry) => entry.classList.toggle('is-active', entry === button));
    }
    if (action === 'add') builder.addBlock();
    if (action === 'add-nitro') builder.addNitro();
    if (action === 'add-post') builder.addPost();
    if (action === 'add-human') builder.addHuman();
    if (action === 'add-waypoint') builder.addWaypoint();
    if (action === 'add-threshold') builder.addThreshold();
    if (action === 'add-chunk') builder.addChunk();
    if (action === 'add-line') builder.addGroundLine();
    if (action === 'add-cart') builder.addCart();
    if (action === 'add-car') builder.addCar();
    if (action === 'add-pulling-sled') builder.addPullingSled();
    if (action === 'add-map-asset') builder.addMapAsset(root.querySelector('[data-map-asset]').value);
    if (action === 'add-line-point') builder.addLinePoint();
    if (action === 'remove-line-point') builder.removeLinePoint(Number(event.target.closest('[data-point-index]').dataset.pointIndex));
    if (action === 'add-human-waypoint') builder.addHumanWaypoint();
    if (action === 'remove-human-waypoint') builder.removeHumanWaypoint(Number(event.target.closest('[data-waypoint-index]').dataset.waypointIndex));
    if (action === 'add-car-destination') builder.addCarDestination();
    if (action === 'remove-car-destination') builder.removeCarDestination(Number(event.target.closest('[data-destination-index]').dataset.destinationIndex));
    if (action === 'select-object') builder.selectObject(event.target.closest('[data-object-id]').dataset.objectId);
    if (action === 'group') {
      builder.groupObjects([...checkedObjectIds]);
      renderObjectList(root, map, selectedBlock?.id, checkedObjectIds);
    }
    if (action === 'ungroup-selected') builder.ungroupSelected();
    if (action === 'duplicate') {
      const duplicatedIds = builder.duplicateObjects([...checkedObjectIds]);
      checkedObjectIds.clear();
      duplicatedIds.forEach((id) => checkedObjectIds.add(id));
      renderObjectList(root, map, selectedBlock?.id, checkedObjectIds);
    }
    if (action === 'toggle-chunk') builder.setChunkEditorVisible(
      event.target.closest('[data-chunk-id]').dataset.chunkId,
      event.target.closest('[data-chunk-id]').dataset.chunkVisible !== 'true',
    );
    if (action === 'spawn') {
      builder.setVehicleStart();
      populateVehicleStart(root, map.vehicleStart);
    }
    if (action === 'delete') builder.deleteSelected();
    if (action === 'download') downloadMap(map);
    if (action === 'reset-map') {
      const hasItems = map.blocks.length > 0 || map.groups.length > 0;
      if (hasItems && !window.confirm('Reset this course? All objects in the current world will be removed.')) return;
      saveMap(createEmptyMap());
      window.location.assign('?mode=builder');
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-vehicle-start-field]')) {
      const field = event.target.dataset.vehicleStartField;
      const axis = Number(event.target.dataset.axis);
      const value = Number(event.target.value);
      builder.updateVehicleStart(field, axis, field === 'rotation' ? value * Math.PI / 180 : value);
      return;
    }
    if (event.target.matches('[data-object-check]')) {
      if (event.target.checked) checkedObjectIds.add(event.target.dataset.objectId);
      else checkedObjectIds.delete(event.target.dataset.objectId);
      return;
    }
    if (event.target.matches('[data-object-name]')) {
      builder.updateSelectedName(event.target.value);
      return;
    }
    if (event.target.matches('[data-block-invisible]')) {
      builder.updateSelectedBlockOption('invisible', event.target.checked);
      return;
    }
    if (event.target.matches('[data-block-initially-active]')) {
      builder.updateSelectedBlockOption('initiallyActive', event.target.checked);
      return;
    }
    if (event.target.matches('[data-block-shadow]')) {
      builder.updateSelectedBlockOption('castShadow', event.target.checked);
      return;
    }
    if (event.target.matches('[data-post-classification]')) {
      builder.updateSelectedPostClassification(event.target.value);
      return;
    }
    if (event.target.matches('[data-block-movable]')) {
      builder.updateSelectedBlockPhysics('movable', event.target.checked);
      return;
    }
    if (event.target.matches('[data-block-mass]')) {
      builder.updateSelectedBlockPhysics('massKg', event.target.value);
      return;
    }
    if (event.target.matches('[data-object-impact-damage]')) {
      builder.updateSelectedImpactDamage(event.target.value);
      return;
    }
    if (event.target.matches('[data-chunk-initially-loaded]')) {
      builder.updateSelectedChunkOption('initiallyLoaded', event.target.checked);
      return;
    }
    if (event.target.matches('[data-chunk-object-member]')) {
      const objectIds = [...editor.querySelectorAll('[data-chunk-object-member]:checked')]
        .flatMap((input) => JSON.parse(input.dataset.objectIds));
      builder.updateSelectedChunkMembers(objectIds);
      return;
    }
    if (event.target.matches('[data-map-name]')) {
      map.name = event.target.value;
      saveMap(map);
      return;
    }
    const field = event.target.dataset.field;
    if (!field || !selectedBlock) return;
    if (field === 'color') builder.updateSelected('color', 0, event.target.value);
    else {
      const value = field === 'rotation'
        ? Number(event.target.value) * Math.PI / 180
        : Number(event.target.value);
      builder.updateSelected(field, Number(event.target.dataset.axis), value);
    }
    return;
  });

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-car-behavior]')) builder.updateSelectedCarBehavior(event.target.value);
    if (event.target.matches('[data-car-damage]')) builder.updateSelectedCarDamage(event.target.dataset.carDamage, event.target.value);
    if (event.target.matches('[data-car-motion]')) builder.updateSelectedCarMotion(event.target.dataset.carMotion, event.target.value);
    if (event.target.matches('[data-car-destination-field]')) {
      builder.updateSelectedCarDestination(
        Number(event.target.dataset.destinationIndex),
        Number(event.target.dataset.destinationAxis),
        event.target.value,
      );
    }
  });

  root.addEventListener('input', (event) => {
    const field = event.target.dataset.lineField;
    if (!field) return;
    const value = field === 'curved' ? event.target.checked : event.target.value;
    builder.updateSelectedLine(
      field,
      value,
      Number(event.target.dataset.pointIndex ?? 0),
      Number(event.target.dataset.pointAxis ?? 0),
    );
  });

  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-human-behavior]')) return;
    builder.updateSelectedBehavior(event.target.value);
  });

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-human-flag]')) builder.updateSelectedHumanOption('flagColor', event.target.value);
    if (event.target.matches('[data-human-flee]')) builder.updateSelectedHumanOption('fleeFromTractor', event.target.checked);
    if (event.target.matches('[data-human-waypoint-loop]')) builder.updateSelectedHumanOption('waypointLoop', event.target.checked);
    if (event.target.matches('[data-human-waypoint-field]')) {
      builder.updateSelectedHumanWaypoint(
        Number(event.target.dataset.waypointIndex),
        Number(event.target.dataset.waypointAxis),
        event.target.value,
      );
    }
  });

  root.addEventListener('input', (event) => {
    if (!event.target.matches('[data-threshold-action], [data-threshold-message], [data-threshold-duration], [data-threshold-stop-duration], [data-threshold-object-change], [data-threshold-chunk-change]')) return;
    const objectChanges = [...editor.querySelectorAll('[data-threshold-object-change]')]
      .filter((select) => select.value !== 'none')
      .map((select) => ({ id: select.dataset.objectId, action: select.value }));
    const chunkChanges = [...editor.querySelectorAll('[data-threshold-chunk-change]')]
      .filter((select) => select.value !== 'none')
      .map((select) => ({ id: select.dataset.chunkId, action: select.value }));
    builder.updateSelectedThreshold({
      action: editor.querySelector('[data-threshold-action]').value,
      message: editor.querySelector('[data-threshold-message]').value,
      duration: editor.querySelector('[data-threshold-duration]').value,
      stopDuration: editor.querySelector('[data-threshold-stop-duration]').value,
      objectChanges,
      chunkChanges,
    });
  });

  root.addEventListener('input', (event) => {
    const signField = event.target.dataset.signField;
    if (!signField || !selectedBlock || selectedBlock.type !== 'box') return;
    const signType = editor.querySelector('[data-sign-field="type"]').value;
    const signText = editor.querySelector('[data-sign-field="text"]').value;
    builder.updateSelectedSign(signType, signText);
  });

  root.addEventListener('change', async (event) => {
    if (!event.target.matches('[data-map-upload]')) return;
    const status = root.querySelector('[data-import-status]');
    try {
      const importedMap = await importMapFile(event.target.files[0]);
      saveMap(importedMap);
      status.textContent = `Loaded ${importedMap.name}. Reopening the editor…`;
      window.location.assign('?mode=builder');
    } catch (error) {
      status.textContent = error.message;
      event.target.value = '';
    }
  });

  window.addEventListener('pagehide', builder.dispose, { once: true });
}

function renderObjectList(root, map, selectedId, checkedIds = new Set()) {
  const hiddenObjectIds = new Set(
    map.blocks
      .filter((block) => block.type === 'chunk' && !block.editorVisible)
      .flatMap((chunk) => chunk.objectIds),
  );
  for (const id of hiddenObjectIds) checkedIds.delete(id);
  const groupedIds = new Set(map.groups?.flatMap((group) => group.objectIds) ?? []);
  const objects = [
    ...(map.groups ?? [])
      .filter((group) => group.objectIds.every((id) => !hiddenObjectIds.has(id)))
      .map((group) => ({ ...group, type: 'group' })),
    ...map.blocks.filter((block) => (
      block.type !== 'chunk'
      && !hiddenObjectIds.has(block.id)
      && !groupedIds.has(block.id)
    )),
  ];
  root.querySelector('[data-object-count]').textContent = objects.length;
  root.querySelector('[data-object-list]').innerHTML = objects.length
    ? objects.map((block, index) => `
      <div class="builder-object-row ${block.id === selectedId ? 'is-selected' : ''}">
        <input type="checkbox" data-object-check data-object-id="${escapeAttribute(block.id)}" ${block.type === 'group' ? 'disabled' : ''} ${checkedIds.has(block.id) ? 'checked' : ''} aria-label="Include ${escapeAttribute(block.name)} in group action">
        <button type="button" data-action="select-object" data-object-id="${escapeAttribute(block.id)}">
          <span>${index + 1}</span>
          <strong>${block.type === 'group' ? `Group · ${escapeHtml(block.name)} (${block.objectIds.length})` : escapeHtml(objectLabel(block))}</strong>
        </button>
      </div>
    `).join('')
    : '<p>No objects added yet.</p>';
}

function renderChunkList(root, map) {
  const chunks = map.blocks.filter((block) => block.type === 'chunk');
  root.querySelector('[data-chunk-count]').textContent = chunks.length;
  root.querySelector('[data-chunk-list]').innerHTML = chunks.length
    ? chunks.map((chunk) => `
      <div>
        <button type="button" data-action="select-object" data-object-id="${escapeAttribute(chunk.id)}">${escapeHtml(chunk.name)}</button>
        <button type="button" data-action="toggle-chunk" data-chunk-id="${escapeAttribute(chunk.id)}" data-chunk-visible="${chunk.editorVisible}">${chunk.editorVisible ? 'Hide' : 'Show'}</button>
      </div>
    `).join('')
    : '<p>No chunks added yet.</p>';
}

function objectLabel(block) {
  return block.name;
}

function vectorEditor(label, field, step) {
  return `
    <fieldset data-vector="${field}">
      <legend>${label}</legend>
      ${['X', 'Y', 'Z'].map((axis, index) => `
        <label>${axis}<input type="number" step="${step}" data-field="${field}" data-axis="${index}"></label>
      `).join('')}
    </fieldset>
  `;
}

function startVectorEditor(label, field, step) {
  return `<fieldset><legend>${label}</legend>${['X', 'Y', 'Z'].map((axis, index) => `
    <label>${axis}<input type="number" step="${step}" data-vehicle-start-field="${field}" data-axis="${index}"></label>
  `).join('')}</fieldset>`;
}

function populateVehicleStart(root, vehicleStart) {
  for (const input of root.querySelectorAll('[data-vehicle-start-field]')) {
    const field = input.dataset.vehicleStartField;
    const value = vehicleStart[field][Number(input.dataset.axis)];
    input.value = field === 'rotation' ? (value * 180 / Math.PI).toFixed(1) : value.toFixed(2);
  }
}

function populateEditor(editor, block, map) {
  editor.classList.toggle('is-empty', !block);
  editor.classList.toggle('is-post', block?.type === 'post');
  editor.classList.toggle('is-box', block?.type === 'box');
  editor.classList.toggle('is-human', block?.type === 'human');
  editor.classList.toggle('is-threshold', block?.type === 'threshold');
  editor.classList.toggle('is-line', block?.type === 'line');
  editor.classList.toggle('is-cart', block?.type === 'cart');
  editor.classList.toggle('is-car', block?.type === 'car');
  editor.classList.toggle('is-pulling-sled', block?.type === 'pulling-sled');
  editor.classList.toggle('is-chunk', block?.type === 'chunk');
  editor.classList.toggle('is-asset', block?.type === 'asset');
  editor.classList.toggle('is-nitro', block?.type === 'nitro');
  editor.classList.toggle('is-waypoint', block?.type === 'waypoint');
  editor.classList.toggle('is-group', block?.type === 'group');
  editor.querySelector('.delete-button').textContent = block?.type === 'group' ? 'Delete group + blocks' : 'Delete';
  if (!block) return;
  editor.querySelector('[data-object-name]').value = block.name;
  for (const input of editor.querySelectorAll('[data-axis]')) {
    const vector = block[input.dataset.field];
    if (!vector) continue;
    const value = vector[Number(input.dataset.axis)];
    input.value = input.dataset.field === 'rotation' ? (value * 180 / Math.PI).toFixed(1) : value.toFixed(2);
  }
  if (block.color) editor.querySelector('[data-field="color"]').value = block.color;
  editor.querySelector('[data-post-classification]').value = block.classification ?? 'yellow';
  editor.querySelector('[data-block-invisible]').checked = block.invisible ?? false;
  editor.querySelector('[data-block-initially-active]').checked = block.initiallyActive !== false;
  editor.querySelector('[data-block-shadow]').checked = block.castShadow !== false;
  editor.querySelector('[data-block-movable]').checked = block.movable ?? false;
  editor.querySelector('[data-block-mass]').value = block.massKg ?? 25;
  editor.querySelector('.block-mass-field').classList.toggle('is-disabled', !block.movable);
  editor.querySelector('[data-block-mass]').disabled = !block.movable;
  const impactDamageField = editor.querySelector('.object-impact-damage-field');
  impactDamageField.hidden = ['group', 'chunk', 'threshold', 'line', 'asset'].includes(block.type);
  editor.querySelector('[data-object-impact-damage]').value = block.structuralDamage ?? 0;
  editor.querySelector('[data-chunk-initially-loaded]').checked = block.initiallyLoaded ?? true;
  if (block.type === 'chunk') populateChunkObjects(editor, block, map);
  const signType = editor.querySelector('[data-sign-field="type"]');
  const signText = editor.querySelector('[data-sign-field="text"]');
  signType.value = block.sign?.type ?? 'none';
  signText.value = block.sign?.text ?? '';
  editor.querySelector('[data-sign-editor]').classList.toggle('is-custom', signType.value === 'text');
  editor.querySelector('[data-human-behavior]').value = block.behavior ?? 'stand';
  editor.querySelector('[data-human-flag]').value = block.flagColor ?? 'none';
  editor.querySelector('[data-human-flee]').checked = block.fleeFromTractor !== false;
  editor.querySelector('[data-human-flee]').disabled = block.behavior === 'waypoints';
  editor.querySelector('[data-human-waypoint-loop]').checked = block.waypointLoop ?? false;
  editor.querySelector('[data-human-editor]').classList.toggle('has-waypoints', block.behavior === 'waypoints');
  if (block.type === 'human') populateHumanWaypoints(editor, block);
  editor.querySelector('[data-car-behavior]').value = block.carBehavior ?? 'coordinates';
  for (const input of editor.querySelectorAll('[data-car-damage]')) input.value = block[input.dataset.carDamage] ?? (input.dataset.carDamage === 'tractorHitDamage' ? 20 : 10);
  for (const input of editor.querySelectorAll('[data-car-motion]')) input.value = block[input.dataset.carMotion] ?? (input.dataset.carMotion === 'maxSpeedMph' ? 16 : 3);
  editor.querySelector('[data-car-editor]').classList.toggle('is-player', block.carBehavior === 'player');
  if (block.type === 'car') populateCarDestinations(editor, block);
  const thresholdAction = editor.querySelector('[data-threshold-action]');
  thresholdAction.value = block.thresholdAction ?? 'maneuver-start';
  editor.querySelector('[data-threshold-message]').value = block.message ?? '';
  editor.querySelector('[data-threshold-duration]').value = block.messageDuration ?? 3;
  editor.querySelector('[data-threshold-stop-duration]').value = block.stopDuration ?? 2;
  const thresholdEditor = editor.querySelector('[data-threshold-editor]');
  thresholdEditor.classList.toggle('is-message', thresholdAction.value === 'message');
  thresholdEditor.classList.toggle('is-stop', thresholdAction.value === 'stop-tractor');
  thresholdEditor.classList.toggle('has-objects', thresholdAction.value === 'objects');
  thresholdEditor.classList.toggle('has-chunks', thresholdAction.value === 'chunks');
  if (block.type === 'threshold') populateThresholdObjects(editor, block, map);
  if (block.type === 'line') populateLineEditor(editor, block);
}

function populateChunkObjects(editor, chunk, map) {
  const members = new Set(chunk.objectIds);
  const assignedToOtherChunk = new Set(
    map.blocks
      .filter((block) => block.type === 'chunk' && block.id !== chunk.id)
      .flatMap((otherChunk) => otherChunk.objectIds),
  );
  const groupedIds = new Set(map.groups.flatMap((group) => group.objectIds));
  const groups = map.groups
    .map((group) => ({
      ...group,
      objectIds: group.objectIds.filter((id) => map.blocks.some((block) => block.id === id && block.type !== 'chunk')),
    }))
    .filter((group) => group.objectIds.length && (
      group.objectIds.some((id) => members.has(id))
      || group.objectIds.every((id) => !assignedToOtherChunk.has(id))
    ));
  const objects = map.blocks.filter((block) => (
    block.type !== 'chunk'
    && !groupedIds.has(block.id)
    && (members.has(block.id) || !assignedToOtherChunk.has(block.id))
  ));
  const entries = [
    ...groups.map((group) => `
      <label>
        <input type="checkbox" data-chunk-object-member data-object-ids="${escapeAttribute(JSON.stringify(group.objectIds))}" ${group.objectIds.every((id) => members.has(id)) ? 'checked' : ''}>
        Group · ${escapeHtml(group.name)} (${group.objectIds.length})
      </label>
    `),
    ...objects.map((block) => `
      <label>
        <input type="checkbox" data-chunk-object-member data-object-ids="${escapeAttribute(JSON.stringify([block.id]))}" ${members.has(block.id) ? 'checked' : ''}>
        ${escapeHtml(objectLabel(block))}
      </label>
    `),
  ];
  editor.querySelector('[data-chunk-object-list]').innerHTML = entries.join('')
    || '<p>Add course objects or scoring thresholds first.</p>';
}

function populateThresholdObjects(editor, threshold, map) {
  const changes = new Map(threshold.objectChanges.map((change) => [change.id, change.action]));
  const chunks = map.blocks.filter((block) => block.type === 'chunk');
  const thresholdChunkIds = new Set(
    chunks.filter((chunk) => chunk.objectIds.includes(threshold.id)).map((chunk) => chunk.id),
  );
  const availableObjects = map.blocks.filter((block) => {
    if (block.id === threshold.id || block.type === 'chunk') return false;
    const objectChunkIds = chunks
      .filter((chunk) => chunk.objectIds.includes(block.id))
      .map((chunk) => chunk.id);
    return objectChunkIds.length === 0 || objectChunkIds.some((id) => thresholdChunkIds.has(id));
  });
  editor.querySelector('[data-threshold-object-list]').innerHTML = availableObjects
    .map((block) => `
      <label>${escapeHtml(objectLabel(block))}
        <select data-threshold-object-change data-object-id="${escapeAttribute(block.id)}">
          <option value="none" ${!changes.has(block.id) ? 'selected' : ''}>No change</option>
          <option value="add" ${changes.get(block.id) === 'add' ? 'selected' : ''}>Add</option>
          <option value="remove" ${changes.get(block.id) === 'remove' ? 'selected' : ''}>Remove</option>
        </select>
      </label>
    `).join('') || '<p>No objects are available in this threshold’s chunk.</p>';
  const chunkChanges = new Map(threshold.chunkChanges.map((change) => [change.id, change.action]));
  editor.querySelector('[data-threshold-chunk-list]').innerHTML = map.blocks
    .filter((block) => block.type === 'chunk')
    .map((chunk) => `
      <label>${escapeHtml(objectLabel(chunk))}
        <select data-threshold-chunk-change data-chunk-id="${escapeAttribute(chunk.id)}">
          <option value="none" ${!chunkChanges.has(chunk.id) ? 'selected' : ''}>No change</option>
          <option value="load" ${chunkChanges.get(chunk.id) === 'load' ? 'selected' : ''}>Load</option>
          <option value="unload" ${chunkChanges.get(chunk.id) === 'unload' ? 'selected' : ''}>Unload</option>
        </select>
      </label>
    `).join('') || '<p>Add a chunk region first.</p>';
}

function populateHumanWaypoints(editor, human) {
  editor.querySelector('[data-human-waypoints]').innerHTML = human.waypoints.map((waypoint, index) => `
    <div class="human-waypoint" data-waypoint-index="${index}">
      <span>${index + 1}</span>
      <label>X<input type="number" step="0.1" value="${waypoint[0]}" data-human-waypoint-field data-waypoint-index="${index}" data-waypoint-axis="0"></label>
      <label>Z<input type="number" step="0.1" value="${waypoint[1]}" data-human-waypoint-field data-waypoint-index="${index}" data-waypoint-axis="1"></label>
      <label>Wait<input type="number" min="0" max="60" step="0.5" value="${waypoint[2]}" data-human-waypoint-field data-waypoint-index="${index}" data-waypoint-axis="2"></label>
      <button type="button" data-action="remove-human-waypoint" aria-label="Remove waypoint ${index + 1}" ${human.waypoints.length <= 1 ? 'disabled' : ''}>×</button>
    </div>
  `).join('');
}

function populateCarDestinations(editor, car) {
  editor.querySelector('[data-car-destinations]').innerHTML = car.destinations.map((destination, index) => `
    <div class="car-destination" data-destination-index="${index}">
      <span>${index + 1}</span>
      <label>X<input type="number" step="0.1" value="${destination[0]}" data-car-destination-field data-destination-index="${index}" data-destination-axis="0"></label>
      <label>Z<input type="number" step="0.1" value="${destination[1]}" data-car-destination-field data-destination-index="${index}" data-destination-axis="1"></label>
      <button type="button" data-action="remove-car-destination" aria-label="Remove destination ${index + 1}" ${car.destinations.length <= 1 ? 'disabled' : ''}>×</button>
    </div>
  `).join('');
}

function populateLineEditor(editor, line) {
  editor.querySelector('[data-line-field="thickness"]').value = line.thickness;
  editor.querySelector('[data-line-field="curved"]').checked = line.curved;
  editor.querySelector('[data-line-points]').innerHTML = line.points.map((point, index) => `
    <div class="line-point" data-point-index="${index}">
      <span>${index + 1}</span>
      <label>X<input type="number" step="0.1" value="${point[0]}" data-line-field="point" data-point-index="${index}" data-point-axis="0"></label>
      <label>Z<input type="number" step="0.1" value="${point[1]}" data-line-field="point" data-point-index="${index}" data-point-axis="1"></label>
      <button type="button" data-action="remove-line-point" aria-label="Remove point ${index + 1}" ${line.points.length <= 2 ? 'disabled' : ''}>×</button>
    </div>
  `).join('');
}

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
