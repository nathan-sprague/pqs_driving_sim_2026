import { tractorAssetFolders, tractorModels } from '../config/tractorModels.js';
import { createTractorPlacementEditor } from '../world/tractor/createTractorPlacementEditor.js';

export async function renderTractorPlacement(root) {
  document.title = 'Build Tractor | Quarter Scale';
  const requestedId = new URLSearchParams(location.search).get('tractor') ?? 'blank';
  const modelId = requestedId === 'blank' || tractorModels[requestedId] ? requestedId : 'blank';
  const model = modelId === 'blank' ? { name: 'Custom Tractor' } : tractorModels[modelId];
  const assetOptions = Object.entries(tractorAssetFolders).map(([folder, files]) => (
    `<optgroup label="${label(folder)}">${files.map((file) => `<option value="${file}">${file.split('/').at(-1)}</option>`).join('')}</optgroup>`
  )).join('');
  root.innerHTML = `<main class="tractor-config-shell"><section class="tractor-config-view" data-placement-view><p>Drag empty space to orbit · Scroll to zoom · Drag gizmo to edit</p></section><aside class="tractor-config-panel tractor-placement-panel">
    <a class="back-link" href="/">← Home</a><p class="panel-kicker">Model workshop</p><h1>Build tractor</h1>
    <label>Start from<select data-model><option value="blank" ${modelId === 'blank' ? 'selected' : ''}>Blank tractor</option>${Object.entries(tractorModels).map(([id, entry]) => `<option value="${id}" ${id === modelId ? 'selected' : ''}>${entry.name}</option>`).join('')}</select></label>
    <label>Tractor name<input data-name value="${escapeAttribute(model.name)}" maxlength="80"></label>
    <label>Available model<select data-asset>${assetOptions}</select></label>
    <button type="button" class="placement-download" data-add>Add model to tractor</button>
    <button type="button" class="placement-download" data-add-display>Add display</button>
    <button type="button" class="placement-download" data-select-bounds>Edit tractor bounding area</button>
    <label class="person-visible"><input type="checkbox" data-person-visible checked> Show person model</label>
    <label>Selected object<select data-part></select></label>
    <button type="button" class="placement-remove" data-remove>Remove selected model</button>
    <div class="placement-modes"><button type="button" class="is-active" data-mode="translate">Move</button><button type="button" data-mode="rotate">Rotate</button></div>
    <fieldset><legend>Position (meters)</legend>${axisFields('position')}</fieldset><fieldset><legend>Rotation (degrees)</legend>${axisFields('rotation')}</fieldset>
    <fieldset><legend>Size / scale</legend>${axisFields('scale', 1)}</fieldset>
    <button type="button" class="placement-download" data-download>Download tractor JSON</button>
    <p class="config-help">Put the downloaded JSON in <code>public/tractor-configs/</code>, then restart Vite. It will appear in Configure Tractor and every driving simulation.</p><p class="config-status" data-placement-status>Loading models…</p>
  </aside></main>`;
  try {
    const editor = await createTractorPlacementEditor(root.querySelector('[data-placement-view]'), modelId, showTransform);
    const partSelect = root.querySelector('[data-part]');
    const refreshParts = (selected = partSelect.value || 'tractor') => {
      partSelect.innerHTML = `<option value="tractor">Whole tractor</option>${editor.listParts().map(({ id, file, special }) => `<option value="${id}">${label(id)}${special ? '' : ` — ${file.split('/').at(-2)}`}</option>`).join('')}`;
      partSelect.value = selected;
    };
    refreshParts();
    editor.select('tractor');
    root.querySelector('[data-person-visible]').checked = editor.isPersonVisible();
    root.querySelector('[data-placement-status]').textContent = 'Ready. Add any number or combination of models.';
    root.querySelector('[data-model]').addEventListener('change', (event) => { location.href = `/?mode=tractor-placement&tractor=${encodeURIComponent(event.target.value)}`; });
    partSelect.addEventListener('change', (event) => editor.select(event.target.value));
    root.querySelector('[data-add]').addEventListener('click', async () => {
      const id = await editor.addPart(root.querySelector('[data-asset]').value);
      refreshParts(id);
      root.querySelector('[data-placement-status]').textContent = `Added ${label(id)}.`;
    });
    root.querySelector('[data-add-display]').addEventListener('click', () => { const id = editor.addDisplay(); refreshParts(id); });
    root.querySelector('[data-select-bounds]').addEventListener('click', () => { editor.select('tractorBounds'); refreshParts('tractorBounds'); root.querySelector('[data-placement-status]').textContent = 'Editing the tractor collision bounds. Move, rotate, and size the green box to enclose the tractor.'; });
    root.querySelector('[data-person-visible]').addEventListener('change', (event) => editor.setPersonVisible(event.target.checked));
    root.querySelector('[data-remove]').addEventListener('click', () => { if (editor.removeSelected()) { refreshParts('tractor'); root.querySelector('[data-placement-status]').textContent = 'Model removed.'; } });
    root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { editor.setMode(button.dataset.mode); root.querySelectorAll('[data-mode]').forEach((entry) => entry.classList.toggle('is-active', entry === button)); }));
    root.querySelectorAll('[data-transform]').forEach((input) => input.addEventListener('input', () => editor.setTransform(values('position'), values('rotation').map((value) => value * Math.PI / 180), values('scale'))));
    root.querySelector('[data-download]').addEventListener('click', () => {
      const name = root.querySelector('[data-name]').value.trim() || 'Custom Tractor';
      if (!editor.hasEyeLevel()) { root.querySelector('[data-placement-status]').textContent = 'Add and position an eye level before downloading.'; return; }
      download(editor.serialize(name), `${slug(name) || 'custom-tractor'}.json`);
    });
    window.addEventListener('pagehide', editor.dispose, { once: true });
  } catch (error) { root.querySelector('[data-placement-status]').textContent = error.message; }
  function showTransform(object) { ['x', 'y', 'z'].forEach((axis, index) => { root.querySelector(`[data-transform="position-${axis}"]`).value = format(object.position.getComponent(index)); root.querySelector(`[data-transform="rotation-${axis}"]`).value = format(object.rotation[axis] * 180 / Math.PI); root.querySelector(`[data-transform="scale-${axis}"]`).value = format(object.scale.getComponent(index)); }); }
  function values(kind) { return ['x', 'y', 'z'].map((axis) => Number(root.querySelector(`[data-transform="${kind}-${axis}"]`).value) || 0); }
}

function axisFields(kind, initial = 0) { return ['x', 'y', 'z'].map((axis) => `<label>${axis.toUpperCase()}<input type="number" step="0.01" value="${initial}" data-transform="${kind}-${axis}"></label>`).join(''); }
function label(value) { return value.replaceAll(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()); }
function format(value) { return Math.round(value * 1000) / 1000; }
function slug(value) { return value.toLowerCase().trim().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, ''); }
function escapeAttribute(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
function download(data, filename) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' })); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
