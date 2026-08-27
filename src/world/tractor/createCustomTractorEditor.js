import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CUSTOM_TRACTOR_MODEL_ID, CUSTOM_TRACTOR_STORAGE_KEY } from '../../config/tractorModels.js';
import { saveTractorConfig } from '../../config/tractor.js';
import { publicUrl } from '../../config/publicUrl.js';

const weights = { engine: 32, clutch: 5, transaxle: 28, seat: 6, joystick: 2, wheel: 3, 'clutch-pedal': 1, 'left-brake-pedal': 1, 'right-brake-pedal': 1, 'rear-wheel': 12, 'front-wheel': 7, axle: 9, driveshaft: 4, gearbox: 9, coupler: 1.5, belt: 1, chain: 2, polygon: 12, bracket: 2 };
const colors = { driveshaft: 0xb8bec0, gearbox: 0x59636a, coupler: 0xd89032, belt: 0x252825, chain: 0x765e45, rail: 0x6e7b80, sheet: 0x849498, bracket: 0x5e6a6f, wheel: 0xd6aa45 };
const powerConnectionTypes = ['driveshaft', 'gearbox', 'coupler', 'belt', 'chain'];

function engineHorsepower(part) {
  const filename = part.userData.file?.split('/').pop() ?? '';
  const match = filename.match(/(\d+(?:\.\d+)?)\s*[_-]*\s*hp/i);
  return match ? Number(match[1]) : 32;
}

export async function createCustomTractorEditor(container, onChange) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111714);
  const perspective = new THREE.PerspectiveCamera(45, 1, 0.05, 150);
  const orthographic = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.05, 150);
  let camera = perspective;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  container.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe9f5ed, 0x293126, 2.6));
  const sun = new THREE.DirectionalLight(0xfff1d0, 3.5); sun.position.set(-5, 9, 6); sun.castShadow = true; scene.add(sun);
  scene.add(new THREE.GridHelper(20, 100, 0x6b826d, 0x29382f));
  const assembly = new THREE.Group(); scene.add(assembly);
  const cadOverlays = new THREE.Group(); scene.add(cadOverlays);
  const mateGuides = new Map();
  let powerGuide = null;
  let facingGuide = null;
  const controls = new TransformControls(camera, renderer.domElement); scene.add(controls.getHelper());
  controls.setTranslationSnap(0.1); controls.setRotationSnap(THREE.MathUtils.degToRad(15)); controls.setScaleSnap(0.1);
  const parts = new Map();
  const mates = new Map();
  const mateFaces = new Map();
  const mateFaceHighlights = [];
  let selected = null;
  let sketch = null;
  let matePicking = null;
  let orbiting = false;
  let panning = false;
  let transforming = false;
  let yaw = -0.75;
  let pitch = -0.35;
  let distance = 6;
  const cameraTarget = new THREE.Vector3(0, 0.7, 0);
  let driving = false;
  let speed = 0;
  const keys = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  controls.addEventListener('dragging-changed', (event) => { transforming = event.value; });
  controls.addEventListener('objectChange', () => {
    if (selected && mates.has(selected.userData.id)) {
      if (controls.getMode() === 'translate') constrainMatedPosition(selected);
      else releaseMate(selected.userData.id);
    }
    notify();
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || transforming) return;
    if (event.shiftKey && !sketch) { panning = true; return; }
    if (sketch) {
      const point = pointOnGround(event);
      if (point) { sketch.points.push(sketchCoordinates(point)); updateSketchPreview(); notify(); }
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...parts.values()], true)[0];
    let object = hit?.object;
    while (object && object.parent !== assembly) object = object.parent;
    if (object?.userData.id && matePicking) {
      const pick = facePickFromHit(hit, object);
      const pickedFace = pick.face;
      if (matePicking.phase === 'moving-face') {
        if (object.userData.id !== matePicking.movingId) { matePicking.callback({ ok: false, message: `Click a face on ${parts.get(matePicking.movingId)?.userData.name}.` }); return; }
        matePicking.movingFace = pickedFace;
        matePicking.movingPick = pick;
        matePicking.phase = 'reference-face';
        addMateFaceHighlight(pick, 0x55d9ff);
        matePicking.callback({ ok: true, message: `${object.userData.name} ${pickedFace} face selected. Now click the mating face on the fixed part.` });
      } else {
        addMateFaceHighlight(pick, 0xffb347);
        const result = createMate(object.userData.id, matePicking.movingId, matePicking.movingFace, pickedFace, { moving: matePicking.movingPick, reference: pick, flipped: matePicking.flipped });
        const callback = matePicking.callback;
        matePicking = null;
        if (result.ok) clearMateFaceHighlights();
        callback(result);
      }
      return;
    }
    orbiting = true;
    if (object?.userData.id) select(object.userData.id);
  });
  window.addEventListener('pointerup', () => { orbiting = false; panning = false; });
  window.addEventListener('pointermove', (event) => {
    if (transforming || driving) return;
    if (panning) { const scale = distance * 0.0015; const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); cameraTarget.addScaledVector(right, -event.movementX * scale).addScaledVector(up, event.movementY * scale); return; }
    if (!orbiting) return;
    yaw -= event.movementX * 0.007;
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.006, -1.15, 1.15);
  });
  renderer.domElement.addEventListener('wheel', (event) => { event.preventDefault(); distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.005, 0.35, 18); if (camera === orthographic) { orthographic.zoom = THREE.MathUtils.clamp(6 / distance, 0.35, 16); orthographic.updateProjectionMatrix(); } }, { passive: false });
  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (driving || /INPUT|SELECT/.test(event.target.tagName)) return;
    if (event.code === 'KeyG') controls.setMode('translate');
    if (event.code === 'KeyR') controls.setMode('rotate');
    if (event.code === 'KeyS') controls.setMode('scale');
    if (event.code === 'Delete' && selected) removePart(selected.userData.id);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const clock = new THREE.Clock();

  function resize() { const aspect = container.clientWidth / container.clientHeight; perspective.aspect = aspect; perspective.updateProjectionMatrix(); orthographic.left = -4 * aspect; orthographic.right = 4 * aspect; orthographic.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight, false); }
  function notify() { onChange?.({ parts: [...parts.values()].map((part) => ({ id: part.userData.id, name: part.userData.name, constrained: constrainedToTransaxle(part.userData.id), mates: [...mates].flatMap(([movingId, fixedId]) => { const flipped = Boolean(mateFaces.get(movingId)?.flipped); if (movingId === part.userData.id) return [{ movingId, otherName: parts.get(fixedId)?.userData.name ?? fixedId, direction: 'to', flipped }]; if (fixedId === part.userData.id) return [{ movingId, otherName: parts.get(movingId)?.userData.name ?? movingId, direction: 'from', flipped }]; return []; }) })), selected: selected?.userData.id, transform: selected ? { px: selected.position.x, py: selected.position.y, pz: selected.position.z, rx: THREE.MathUtils.radToDeg(selected.rotation.x), ry: THREE.MathUtils.radToDeg(selected.rotation.y), rz: THREE.MathUtils.radToDeg(selected.rotation.z), sx: selected.scale.x, sy: selected.scale.y, sz: selected.scale.z } : null, sketchPoints: sketch?.points.length ?? 0 }); }
  function register(object, type, name = type, procedural = null) { let id = type; let suffix = 2; while (parts.has(id)) id = `${type}-${suffix++}`; object.userData = { ...object.userData, id, type, name: `${name}${suffix > 2 ? ` ${suffix - 1}` : ''}`, mass: weights[type] ?? 5, procedural }; object.name = id; assembly.add(object); parts.set(id, object); select(id); return object; }
  function select(id) { selected = parts.get(id) ?? null; if (selected && !driving) controls.attach(selected); else controls.detach(); updateMateAxes(); notify(); }
  async function addModel(type, file) { const model = (await new GLTFLoader().loadAsync(file)).scene; model.userData.file = file; model.scale.setScalar(type === 'seat' ? 1 : 0.7); const defaults = { engine: [0.9, 0.65, 0], clutch: [0, 0.55, 0], transaxle: [-1, 0.5, 0], seat: [-0.55, 1.1, 0] }; const duplicateCount = types().filter((partType) => partType === type).length; model.position.fromArray(defaults[type] ?? [0, 0.5, 0]); model.position.z += duplicateCount * 0.4; register(model, type, type[0].toUpperCase() + type.slice(1)); }
  function addPrimitive(type) { let geometry; let procedural; if (type === 'driveshaft' || type === 'coupler' || type === 'axle') { const radius = type === 'driveshaft' ? 0.01 : type === 'coupler' ? 0.12 : 0.08; const length = type === 'coupler' ? 0.22 : type === 'axle' ? 1.4 : 1; geometry = new THREE.CylinderGeometry(radius, radius, length, 20); geometry.rotateZ(Math.PI / 2); procedural = { kind: 'cylinder', radius, length, color: colors[type] ?? 0x77837b }; } else if (type === 'belt' || type === 'chain') { geometry = new THREE.TorusGeometry(0.42, type === 'belt' ? 0.04 : 0.025, 10, 32); procedural = { kind: 'box', size: [.84, .08, .84], color: colors[type] }; } else { const size = type === 'display' ? [.3, .17, .035] : type === 'bracket' ? [.3, .3, .3] : [1, .1, .1]; geometry = new THREE.BoxGeometry(...size); procedural = { kind: 'box', size, color: type === 'display' ? 0x65e58e : colors[type] ?? 0x77837b }; } const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: procedural.color, emissive: type === 'display' ? 0x163d22 : 0, metalness: type === 'display' ? .1 : .55, roughness: 0.38 })); mesh.position.set(type === 'display' ? -0.05 : 0, type === 'display' ? 1.35 : type === 'bracket' ? 0.38 : 0.65, type === 'display' ? -0.28 : 0); mesh.castShadow = true; register(mesh, type, type[0].toUpperCase() + type.slice(1), procedural); }
  async function addWheelPair(position) {
    const type = `${position}-wheel`;
    const file = publicUrl(`assets/models/tractor/${position}_wheel/${position}_wheel.glb`);
    const x = position === 'rear' ? -0.9 : 1.1;
    for (const z of [-0.62, 0.62]) { const model = (await new GLTFLoader().loadAsync(file)).scene; model.position.set(x, position === 'rear' ? 0.42 : 0.34, z); model.userData.file = file; register(model, type, `${position === 'rear' ? 'Rear' : 'Front'} wheel`); }
  }
  async function addSteering(type) { if (type === 'joystick') { const files = [publicUrl('assets/models/tractor/joysticks/joystick.glb')]; await addModel('joystick', files[0]); selected.position.set(-0.15, 1.15, 0.38); } else { const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 12, 32), new THREE.MeshStandardMaterial({ color: 0x202522, metalness: 0.3 })); wheel.rotation.x = Math.PI / 2; wheel.position.set(-0.05, 1.35, 0); register(wheel, 'wheel', 'Steering wheel'); } }
  async function addPedal(type) {
    const pedalFile = publicUrl('assets/models/tractor/brakes/pedal1.glb');
    const model = (await new GLTFLoader().loadAsync(pedalFile)).scene;
    model.scale.setScalar(0.7);
    model.userData.file = pedalFile;
    const definitions = {
      'clutch-pedal': { name: 'Clutch pedal', position: [-0.05, 0.25, 0.32] },
      'left-brake-pedal': { name: 'Left brake pedal', position: [-0.05, 0.25, -0.08] },
      'right-brake-pedal': { name: 'Right brake pedal', position: [-0.05, 0.25, -0.32] },
    };
    const definition = definitions[type] ?? definitions['clutch-pedal'];
    model.position.fromArray(definition.position);
    register(model, type, definition.name);
  }
  function types() { return [...parts.values()].map((part) => part.userData.type); }
  function setView(view) { const views = { perspective: [-0.75, -0.35], top: [-Math.PI / 2, Math.PI / 2 - 0.01], front: [0, 0], right: [-Math.PI / 2, 0] }; [yaw, pitch] = views[view] ?? views.perspective; }
  function updateSelectedTransform(values) { if (!selected) return; const nextRotation = [values.rx, values.ry, values.rz].map(THREE.MathUtils.degToRad); const rotationChanged = nextRotation.some((value, index) => Math.abs(value - [selected.rotation.x, selected.rotation.y, selected.rotation.z][index]) > 1e-5); const nextScale = [values.sx, values.sy, values.sz].map((value) => Math.max(0.01, value)); const scaleChanged = nextScale.some((value, index) => Math.abs(value - selected.scale.toArray()[index]) > 1e-5); selected.position.set(values.px, values.py, values.pz); selected.rotation.set(...nextRotation); selected.scale.set(...nextScale); if (mates.has(selected.userData.id)) { if (rotationChanged || scaleChanged) releaseMate(selected.userData.id); else constrainMatedPosition(selected); } controls.updateMatrixWorld(); notify(); }
  function createMate(fixedId, movingId, movingFace = '+X', referenceFace = '-X', picks = null) {
    if (!fixedId || !movingId || fixedId === movingId) return { ok: false, message: 'Choose two different parts for the mate.' };
    const fixed = parts.get(fixedId); const moving = parts.get(movingId);
    if (!fixed || !moving) return { ok: false, message: 'Both mate references must exist.' };
    const faceNormal = (face) => { const normal = new THREE.Vector3(); normal[face[1].toLowerCase()] = face[0] === '+' ? 1 : -1; return normal; };
    const movingNormal = picks?.moving?.worldNormal?.clone() ?? faceNormal(movingFace).applyQuaternion(moving.quaternion);
    const referenceNormal = picks?.reference?.worldNormal?.clone() ?? faceNormal(referenceFace).applyQuaternion(fixed.quaternion);
    const targetNormal = picks?.flipped ? referenceNormal.clone() : referenceNormal.clone().negate();
    moving.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(movingNormal.normalize(), targetNormal.normalize()));
    moving.updateMatrixWorld(true);
    let mateData = { movingFace, referenceFace };
    if (picks?.moving && picks?.reference) {
      const currentMovingPoint = moving.localToWorld(picks.moving.localPoint.clone());
      const worldOffset = picks.reference.worldPoint.clone().sub(currentMovingPoint);
      const assemblyRotation = assembly.getWorldQuaternion(new THREE.Quaternion()).invert();
      moving.position.add(worldOffset.applyQuaternion(assemblyRotation));
      const referenceLocalNormal = picks.reference.worldNormal.clone().applyQuaternion(fixed.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
      mateData = { ...mateData, movingPoint: picks.moving.localPoint.toArray(), referencePoint: fixed.worldToLocal(picks.reference.worldPoint.clone()).toArray(), referenceNormal: referenceLocalNormal.toArray(), flipped: Boolean(picks.flipped) };
    } else {
      const fixedBox = new THREE.Box3().setFromObject(fixed); const movingBox = new THREE.Box3().setFromObject(moving);
      const fixedCenter = fixedBox.getCenter(new THREE.Vector3()); const movingCenter = movingBox.getCenter(new THREE.Vector3());
      const axis = referenceFace[1].toLowerCase(); const positiveReference = referenceFace[0] === '+';
      const referenceCoordinate = positiveReference ? fixedBox.max[axis] : fixedBox.min[axis];
      const movingCoordinate = positiveReference ? movingBox.min[axis] : movingBox.max[axis];
      moving.position[axis] += referenceCoordinate - movingCoordinate;
      for (const other of ['x', 'y', 'z']) if (other !== axis) moving.position[other] += fixedCenter[other] - movingCenter[other];
    }
    moving.updateMatrixWorld(true);
    mates.set(movingId, fixedId); mateFaces.set(movingId, mateData); addMateGuide(movingId, fixedId); select(movingId);
    return { ok: true, message: `${moving.userData.name} ${movingFace} face mated to ${fixed.userData.name} ${referenceFace} face.` };
  }
  function facePickFromHit(hit, root) {
    if (!hit?.face) return { face: '+X', localPoint: new THREE.Vector3(), worldPoint: root.getWorldPosition(new THREE.Vector3()), worldNormal: new THREE.Vector3(1, 0, 0) };
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyNormalMatrix(normalMatrix).normalize();
    const localNormal = worldNormal.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    const axes = [['X', Math.abs(localNormal.x), localNormal.x], ['Y', Math.abs(localNormal.y), localNormal.y], ['Z', Math.abs(localNormal.z), localNormal.z]];
    const [axis, , direction] = axes.sort((left, right) => right[1] - left[1])[0];
    return { face: `${direction >= 0 ? '+' : '-'}${axis}`, localPoint: root.worldToLocal(hit.point.clone()), worldPoint: hit.point.clone(), worldNormal };
  }
  function clearMateFaceHighlights() { for (const highlight of mateFaceHighlights) { highlight.geometry.dispose(); highlight.material.dispose(); highlight.removeFromParent(); } mateFaceHighlights.length = 0; }
  function addMateFaceHighlight(pick, color) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthTest: false }));
    plane.position.copy(pick.worldPoint).addScaledVector(pick.worldNormal, 0.003);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pick.worldNormal);
    plane.renderOrder = 1002;
    cadOverlays.add(plane);
    mateFaceHighlights.push(plane);
  }
  function releaseMate(movingId) { mates.delete(movingId); mateFaces.delete(movingId); mateGuides.get(movingId)?.removeFromParent(); mateGuides.delete(movingId); updateMateAxes(); }
  function removeMate(movingId) { if (!mates.has(movingId)) return; releaseMate(movingId); notify(); }
  function setMateFlipped(movingId, flipped) {
    const moving = parts.get(movingId); const fixed = parts.get(mates.get(movingId)); const faces = mateFaces.get(movingId);
    if (!moving || !fixed || !faces || Boolean(faces.flipped) === flipped) return;
    moving.updateMatrixWorld(true); fixed.updateMatrixWorld(true);
    const faceNormal = (face) => { const normal = new THREE.Vector3(); normal[face[1].toLowerCase()] = face[0] === '+' ? 1 : -1; return normal; };
    const movingNormal = faceNormal(faces.movingFace).applyQuaternion(moving.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const referenceNormal = faces.referenceNormal
      ? new THREE.Vector3().fromArray(faces.referenceNormal).applyQuaternion(fixed.getWorldQuaternion(new THREE.Quaternion())).normalize()
      : faceNormal(faces.referenceFace).applyQuaternion(fixed.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const targetNormal = flipped ? referenceNormal : referenceNormal.clone().negate();
    moving.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(movingNormal, targetNormal));
    moving.updateMatrixWorld(true);
    if (faces.movingPoint && faces.referencePoint) {
      const movingPoint = moving.localToWorld(new THREE.Vector3().fromArray(faces.movingPoint));
      const referencePoint = fixed.localToWorld(new THREE.Vector3().fromArray(faces.referencePoint));
      moving.position.add(referencePoint.sub(movingPoint).applyQuaternion(assembly.getWorldQuaternion(new THREE.Quaternion()).invert()));
    } else constrainMatedPosition(moving);
    faces.flipped = flipped;
    moving.updateMatrixWorld(true);
    notify();
  }
  function updateMateAxes() { const lockedAxis = selected && controls.getMode() === 'translate' ? mateFaces.get(selected.userData.id)?.referenceFace?.[1].toLowerCase() : null; controls.showX = lockedAxis !== 'x'; controls.showY = lockedAxis !== 'y'; controls.showZ = lockedAxis !== 'z'; }
  function constrainMatedPosition(moving) {
    const fixed = parts.get(mates.get(moving.userData.id)); const faces = mateFaces.get(moving.userData.id);
    if (!fixed || !faces) return;
    moving.updateMatrixWorld(true); fixed.updateMatrixWorld(true);
    if (faces.movingPoint && faces.referencePoint) {
      const movingPoint = moving.localToWorld(new THREE.Vector3().fromArray(faces.movingPoint));
      const referencePoint = fixed.localToWorld(new THREE.Vector3().fromArray(faces.referencePoint));
      const normal = faces.referenceNormal ? new THREE.Vector3().fromArray(faces.referenceNormal) : new THREE.Vector3();
      if (!faces.referenceNormal) normal[faces.referenceFace[1].toLowerCase()] = faces.referenceFace[0] === '+' ? 1 : -1;
      normal.applyQuaternion(fixed.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const correction = normal.multiplyScalar(referencePoint.clone().sub(movingPoint).dot(normal));
      moving.position.add(correction.applyQuaternion(assembly.getWorldQuaternion(new THREE.Quaternion()).invert()));
      moving.updateMatrixWorld(true);
      return;
    }
    let movingBox = new THREE.Box3().setFromObject(moving); const fixedBox = new THREE.Box3().setFromObject(fixed);
    const axis = faces.referenceFace[1].toLowerCase(); const positiveReference = faces.referenceFace[0] === '+';
    const fixedFace = positiveReference ? fixedBox.max[axis] : fixedBox.min[axis];
    const movingFace = positiveReference ? movingBox.min[axis] : movingBox.max[axis];
    moving.position[axis] += fixedFace - movingFace;
    moving.updateMatrixWorld(true); movingBox = new THREE.Box3().setFromObject(moving);
    const movingCenter = movingBox.getCenter(new THREE.Vector3()); const movingSize = movingBox.getSize(new THREE.Vector3());
    for (const tangent of ['x', 'y', 'z']) {
      if (tangent === axis) continue;
      const halfSize = movingSize[tangent] / 2;
      const minimum = fixedBox.min[tangent] + halfSize; const maximum = fixedBox.max[tangent] - halfSize;
      const target = minimum <= maximum ? THREE.MathUtils.clamp(movingCenter[tangent], minimum, maximum) : (fixedBox.min[tangent] + fixedBox.max[tangent]) / 2;
      moving.position[tangent] += target - movingCenter[tangent];
    }
    moving.updateMatrixWorld(true);
  }
  function beginMatePicking(callback) { matePicking = { movingId: null, callback }; controls.detach(); }
  function beginMateFromSelected(callback) { if (!selected) { callback({ ok: false, message: 'Select a moving part first.' }); return; } if (selected.userData.id === 'transaxle') { callback({ ok: false, message: 'The transaxle is the fixed assembly root; select another moving part.' }); return; } clearMateFaceHighlights(); matePicking = { movingId: selected.userData.id, phase: 'moving-face', flipped: false, callback }; controls.detach(); callback({ ok: true, message: `Mate tool active. Click the mating face on ${selected.userData.name}.` }); }
  function removePart(id) {
    const part = parts.get(id);
    if (!part) return;
    clearMateFaceHighlights();
    releaseMate(id);
    for (const [movingId, fixedId] of [...mates]) if (fixedId === id) releaseMate(movingId);
    if (matePicking?.movingId === id) matePicking = null;
    parts.delete(id);
    part.removeFromParent();
    select(null);
  }
  function addMateGuide(movingId, fixedId) { mateGuides.get(movingId)?.removeFromParent(); const material = new THREE.LineDashedMaterial({ color: 0x9eb7a7, dashSize: .06, gapSize: .045, depthTest: false, transparent: true, opacity: .9 }); const line = new THREE.Line(new THREE.BufferGeometry(), material); line.renderOrder = 1000; line.userData = { movingId, fixedId }; cadOverlays.add(line); mateGuides.set(movingId, line); updateGuide(line); }
  function updateGuide(line) { const moving = parts.get(line.userData.movingId); const fixed = parts.get(line.userData.fixedId); if (!moving || !fixed) return; line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints([moving.getWorldPosition(new THREE.Vector3()), fixed.getWorldPosition(new THREE.Vector3())]); line.computeLineDistances(); }
  function constrainedToTransaxle(id, visited = new Set()) { if (id === 'transaxle') return true; if (visited.has(id)) return false; visited.add(id); const parent = mates.get(id); return parent ? constrainedToTransaxle(parent, visited) : false; }
  function validateConstraints(filter = () => true) { const free = [...parts.values()].filter((part) => part.userData.id !== 'transaxle' && filter(part) && !constrainedToTransaxle(part.userData.id)); return free.length ? `${free.slice(0, 3).map((part) => part.userData.name).join(', ')}${free.length > 3 ? ` and ${free.length - 3} more` : ''} must be mated into the transaxle constraint chain.` : null; }
  function validateDriveline() {
    const list = types();
    const missingCore = ['engine', 'clutch', 'transaxle'].filter((type) => !list.includes(type));
    if (missingCore.length) return { ok: false, message: `Install the missing core ${missingCore.length === 1 ? 'part' : 'parts'}: ${missingCore.map(labelPartType).join(', ')}.` };
    if (list.filter((type) => type === 'rear-wheel').length !== 2) return { ok: false, message: 'Install both rear wheels before validating the driveline.' };
    const connections = list.filter((type) => powerConnectionTypes.includes(type)).length;
    if (connections < 2) {
      const disconnected = [...parts.values()]
        .filter((part) => ['engine', 'clutch'].includes(part.userData.type) && !constrainedToTransaxle(part.userData.id))
        .map((part) => part.userData.name);
      const connectionCount = `${connections} of 2 connector parts installed`;
      const disconnectedMessage = disconnected.length ? ` Not connected to the transaxle chain: ${disconnected.join(', ')}.` : '';
      return { ok: false, message: `${connectionCount}. Add driveshafts, gearboxes, couplers, belts, or chains to link Engine → Clutch → Transaxle.${disconnectedMessage}` };
    }
    const engineCount = list.filter((type) => type === 'engine').length;
    const couplerCount = list.filter((type) => type === 'coupler').length;
    if (engineCount > 1 && couplerCount < engineCount - 1) return { ok: false, message: `Connecting ${engineCount} engines requires at least ${engineCount - 1} coupler${engineCount > 2 ? 's' : ''}.` };
    const disconnectedPowerParts = [...parts.values()].filter((part) => (
      ['engine', 'clutch', ...powerConnectionTypes].includes(part.userData.type)
      && !constrainedToTransaxle(part.userData.id)
    ));
    if (disconnectedPowerParts.length) return {
      ok: false,
      message: `Not connected to the transaxle chain: ${disconnectedPowerParts.map((part) => part.userData.name).join(', ')}. Mate each listed part into the Engine → Clutch → Transaxle power path.`,
    };
    const connectionCounts = new Map();
    for (const [movingId, fixedId] of mates) {
      connectionCounts.set(movingId, (connectionCounts.get(movingId) ?? 0) + 1);
      connectionCounts.set(fixedId, (connectionCounts.get(fixedId) ?? 0) + 1);
    }
    const overloaded = [...parts.values()].find((part) => ['driveshaft', 'clutch'].includes(part.userData.type) && (connectionCounts.get(part.userData.id) ?? 0) > 2);
    if (overloaded) return { ok: false, message: `${overloaded.userData.name} has more than two connections. Add a coupler to branch or combine the power path.` };
    const free = validateConstraints();
    return free ? { ok: false, message: free } : { ok: true };
  }
  function labelPartType(type) { return type.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase()); }
  function validateFrame() { const list = types(); if (!list.includes('polygon')) return { ok: false, message: 'Create and extrude at least one closed 2D frame sketch.' }; if (!list.includes('axle')) return { ok: false, message: 'Add a front axle.' }; if (list.filter((type) => type === 'front-wheel').length !== 2) return { ok: false, message: 'Install both front wheels.' }; const free = validateConstraints(); return free ? { ok: false, message: free } : { ok: true }; }
  function validateOperator() { const seat = [...parts.values()].find((part) => part.userData.type === 'seat'); const steering = [...parts.values()].find((part) => ['joystick', 'wheel'].includes(part.userData.type)); if (!seat || !steering) return { ok: false, message: 'Install both a seat and a steering mechanism.' }; const requiredPedals = ['clutch-pedal', 'left-brake-pedal', 'right-brake-pedal']; const missingPedals = requiredPedals.filter((type) => !types().includes(type)); if (missingPedals.length) return { ok: false, message: 'Install a clutch pedal plus separate left and right brake pedals.' }; if (seat.position.distanceTo(steering.position) > 1.05) return { ok: false, message: 'Move the steering mechanism within 1.05 m of the seat.' }; const free = validateConstraints(); return free ? { ok: false, message: free } : { ok: true }; }
  function showPowerPath() { powerGuide?.removeFromParent(); const order = [...parts.values()].filter((part) => ['engine', 'clutch', 'transaxle', ...powerConnectionTypes].includes(part.userData.type)).map((part) => part.userData.id); const material = new THREE.LineBasicMaterial({ color: 0x4dff8b, depthTest: false, transparent: true, opacity: .95 }); powerGuide = new THREE.Line(new THREE.BufferGeometry(), material); powerGuide.userData.ids = order; powerGuide.renderOrder = 1001; cadOverlays.add(powerGuide); updatePowerGuide(); }
  function updatePowerGuide() { if (!powerGuide) return; const points = powerGuide.userData.ids.map((id) => parts.get(id)?.getWorldPosition(new THREE.Vector3())).filter(Boolean); powerGuide.geometry.dispose(); powerGuide.geometry = new THREE.BufferGeometry().setFromPoints(points); }
  function complete(transmissionSetup = {}) { let total = 0; const center = new THREE.Vector3(); for (const part of parts.values()) { const scaleMass = part.userData.mass * Math.max(0.25, part.scale.x * part.scale.y * part.scale.z); total += scaleMass; center.addScaledVector(part.position, scaleMass); } center.divideScalar(total || 1); const list = types(); const connections = list.filter((type) => powerConnectionTypes.includes(type)).length; const structure = list.filter((type) => ['rail', 'sheet', 'bracket'].includes(type)).length; const engines = [...parts.values()].filter((part) => part.userData.type === 'engine'); const horsepower = engines.reduce((sum, engine) => sum + engineHorsepower(engine), 0); const multiEnginePenalty = Math.max(0, engines.length - 1) * 18; const finalDriveRatio = Math.min(10, Math.max(0.5, Number(transmissionSetup.finalDriveRatio) || 1)); const gearRatios = Array.isArray(transmissionSetup.gearRatios) ? transmissionSetup.gearRatios : [3, 2, 1]; return { massKg: total.toFixed(1), centerOfMass: center.toArray().map((value) => value.toFixed(2)), horsepower: horsepower.toFixed(0), efficiency: Math.max(35, 98 - connections * 3 - multiEnginePenalty).toFixed(0), durability: Math.min(100, Math.round(46 + structure * 9 + Math.min(connections, 5) * 4)), transmission: transmissionSetup.transmission === 'manual' ? 'manual' : 'automatic', finalDriveRatio, topSpeedMph: 6 / finalDriveRatio, gearCount: gearRatios.length, gearRatios }; }
  function startDriving() {
    driving = true;
    controls.detach();
    cadOverlays.visible = false;
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x171a18, roughness: 0.85 });
    [[-0.85, 0.42, -0.7], [-0.85, 0.42, 0.7], [0.95, 0.35, -0.62], [0.95, 0.35, 0.62]].forEach(([x, y, z], index) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(index < 2 ? 0.42 : 0.34, index < 2 ? 0.42 : 0.34, 0.22, 24), wheelMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, y, z);
      assembly.add(wheel);
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x354c31, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);
  }
  function pointOnGround(event) { const bounds = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const normals = { XY: new THREE.Vector3(0, 0, 1), XZ: new THREE.Vector3(0, 1, 0), YZ: new THREE.Vector3(1, 0, 0) }; const point = new THREE.Vector3(); return raycaster.ray.intersectPlane(new THREE.Plane(normals[sketch?.plane ?? 'XZ'], 0), point); }
  function beginSketch(plane = 'XZ') { controls.detach(); sketch = { plane, points: [], preview: new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x62f39d, depthTest: false })) }; scene.add(sketch.preview); notify(); }
  function sketchVector([u, v], plane = sketch?.plane ?? 'XZ') { if (plane === 'XY') return new THREE.Vector3(u, v, .015); if (plane === 'YZ') return new THREE.Vector3(.015, u, v); return new THREE.Vector3(u, .015, v); }
  function sketchCoordinates(point, plane = sketch?.plane ?? 'XZ') { if (plane === 'XY') return [point.x, point.y]; if (plane === 'YZ') return [point.y, point.z]; return [point.x, point.z]; }
  function updateSketchPreview() { if (!sketch) return; sketch.preview.geometry.dispose(); sketch.preview.geometry = new THREE.BufferGeometry().setFromPoints(sketch.points.map((point) => sketchVector(point))); }
  function undoSketchPoint() { if (!sketch) return; sketch.points.pop(); updateSketchPreview(); notify(); }
  function finishSketch(depth = 0.01) { if (!sketch || sketch.points.length < 3) return { ok: false, message: 'A closed profile needs at least three points.' }; const { points, plane } = sketch; const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v))); const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); orientSketchGeometry(geometry, plane); geometry.center(); const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x788b91, metalness: .65, roughness: .35, side: THREE.DoubleSide })); mesh.position.y = 0.35; sketch.preview.removeFromParent(); sketch = null; register(mesh, 'polygon', 'Extruded frame profile', { kind: 'polygon', plane, points, depth, color: 0x788b91 }); return { ok: true }; }
  function orientSketchGeometry(geometry, plane) { if (plane === 'XZ') geometry.rotateX(Math.PI / 2); if (plane === 'YZ') geometry.rotateY(Math.PI / 2); }
  function setFacingDirection(direction = 'positive-x') { const vectors = { 'positive-x': [1, 0, 0], 'negative-x': [-1, 0, 0], 'positive-z': [0, 0, 1], 'negative-z': [0, 0, -1] }; const vector = new THREE.Vector3(...(vectors[direction] ?? vectors['positive-x'])); facingGuide?.removeFromParent(); facingGuide = new THREE.ArrowHelper(vector, new THREE.Vector3(0, 0.08, 0), 2, 0x62f39d, 0.38, 0.2); facingGuide.renderOrder = 1002; facingGuide.line.material.depthTest = false; facingGuide.cone.material.depthTest = false; cadOverlays.add(facingGuide); }
  function saveForSimulator(metrics, facingDirection = 'positive-x') { const transform = (part) => ({ position: part.position.toArray(), rotation: [part.rotation.x, part.rotation.y, part.rotation.z], scale: part.scale.toArray() }); const facingYaw = { 'positive-x': 0, 'negative-x': Math.PI, 'positive-z': Math.PI / 2, 'negative-z': -Math.PI / 2 }[facingDirection] ?? 0; const placement = { schemaVersion: 5, modelId: CUSTOM_TRACTOR_MODEL_ID, name: 'My custom tractor', facingDirection, tractor: { position: [0, 0, 0], rotation: [0, facingYaw, 0] }, parts: Object.fromEntries([...parts].map(([id, part]) => [id, { ...(part.userData.file ? { file: part.userData.file } : { procedural: part.userData.procedural }), ...transform(part) }])), eyeLevel: { position: [-.45, 1.45, 0], rotation: [0, Math.PI / 2, 0], personVisible: true } }; localStorage.setItem(CUSTOM_TRACTOR_STORAGE_KEY, JSON.stringify(placement)); saveTractorConfig({ modelId: CUSTOM_TRACTOR_MODEL_ID, massLb: Number(metrics.massKg) * 2.20462, centerOfMassInches: metrics.centerOfMass.map((value) => Number(value) / 0.0254), topSpeedMph: metrics.topSpeedMph, powerHp: Number(metrics.horsepower), durability: Number(metrics.durability), transmission: metrics.transmission, gearCount: metrics.gearCount, gearRatios: metrics.gearRatios }); }
  function serializeProject() { const transform = (part) => ({ position: part.position.toArray(), rotation: [part.rotation.x, part.rotation.y, part.rotation.z], scale: part.scale.toArray() }); return { schemaVersion: 2, type: 'quarter-scale-cad-tractor', parts: Object.fromEntries([...parts].map(([id, part]) => [id, { type: part.userData.type, name: part.userData.name, ...(part.userData.file ? { file: part.userData.file } : { procedural: part.userData.procedural }), ...transform(part) }])), mates: Object.fromEntries([...mates].map(([movingId, fixedId]) => [movingId, { fixedId, ...(mateFaces.get(movingId) ?? {}) }])) }; }
  async function loadProject(project) { if (project?.type !== 'quarter-scale-cad-tractor' || !project.parts || typeof project.parts !== 'object') throw new Error('This is not a custom tractor CAD project.'); controls.detach(); for (const part of parts.values()) part.removeFromParent(); parts.clear(); mates.clear(); mateFaces.clear(); clearMateFaceHighlights(); for (const line of mateGuides.values()) line.removeFromParent(); mateGuides.clear(); powerGuide?.removeFromParent(); powerGuide = null; for (const [wantedId, spec] of Object.entries(project.parts)) { let object; if (spec.file) object = (await new GLTFLoader().loadAsync(publicUrl(spec.file))).scene; else object = createObjectFromProcedural(spec.procedural); object.userData.file = spec.file ? publicUrl(spec.file) : spec.file; const added = register(object, spec.type, spec.name, spec.procedural); if (added.userData.id !== wantedId) { parts.delete(added.userData.id); added.userData.id = wantedId; added.name = wantedId; parts.set(wantedId, added); } added.position.fromArray(spec.position ?? [0, 0, 0]); added.rotation.fromArray(spec.rotation ?? [0, 0, 0]); added.scale.fromArray(spec.scale ?? [1, 1, 1]); } for (const [movingId, mate] of Object.entries(project.mates ?? {})) { const fixedId = typeof mate === 'string' ? mate : mate.fixedId; if (parts.has(movingId) && parts.has(fixedId)) { mates.set(movingId, fixedId); if (typeof mate === 'object') mateFaces.set(movingId, { movingFace: mate.movingFace ?? '+X', referenceFace: mate.referenceFace ?? '-X', flipped: Boolean(mate.flipped), ...(mate.movingPoint ? { movingPoint: mate.movingPoint } : {}), ...(mate.referencePoint ? { referencePoint: mate.referencePoint } : {}), ...(mate.referenceNormal ? { referenceNormal: mate.referenceNormal } : {}) }); addMateGuide(movingId, fixedId); } } select(parts.keys().next().value); notify(); }
  function createObjectFromProcedural(spec = {}) { let geometry; if (spec.kind === 'cylinder') { geometry = new THREE.CylinderGeometry(spec.radius ?? .08, spec.radius ?? .08, spec.length ?? 1, 20); geometry.rotateZ(Math.PI / 2); } else if (spec.kind === 'polygon' && spec.points?.length >= 3) { geometry = new THREE.ExtrudeGeometry(new THREE.Shape(spec.points.map(([x, y]) => new THREE.Vector2(x, y))), { depth: spec.depth ?? .01, bevelEnabled: false }); orientSketchGeometry(geometry, spec.plane ?? 'XZ'); geometry.center(); } else geometry = new THREE.BoxGeometry(...(spec.size ?? [1, .1, .1])); return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: spec.color ?? 0x77837b, metalness: .5, roughness: .4 })); }
  function animate() { const delta = Math.min(clock.getDelta(), 0.05); if (driving) { const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0); speed = THREE.MathUtils.damp(speed, keys.has('Space') ? 0 : throttle * 3.2, 2.2, delta); assembly.rotation.y += ((keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0)) * delta * speed * 0.45; assembly.position.x += Math.cos(assembly.rotation.y) * speed * delta; assembly.position.z -= Math.sin(assembly.rotation.y) * speed * delta; const target = assembly.position.clone().add(new THREE.Vector3(-Math.cos(assembly.rotation.y) * 5, 2.7, Math.sin(assembly.rotation.y) * 5)); camera.position.lerp(target, 1 - Math.exp(-4 * delta)); camera.lookAt(assembly.position.x, 0.8, assembly.position.z); } else { camera.position.set(cameraTarget.x + Math.cos(yaw) * Math.cos(pitch) * distance, cameraTarget.y + Math.sin(pitch) * distance, cameraTarget.z + Math.sin(yaw) * Math.cos(pitch) * distance); camera.lookAt(cameraTarget); for (const line of mateGuides.values()) updateGuide(line); updatePowerGuide(); } renderer.render(scene, camera); requestAnimationFrame(animate); }
  animate();
  return { addModel, addPrimitive, addWheelPair, addSteering, addPedal, select, createMate, beginMatePicking, beginMateFromSelected, beginSketch, undoSketchPoint, finishSketch, showPowerPath, setFacingDirection, serializeProject, loadProject, removeMate, setMateFlipped, setMode: (mode) => { controls.setMode(mode); updateMateAxes(); }, setSnap: (enabled) => { controls.setTranslationSnap(enabled ? 0.1 : null); controls.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null); controls.setScaleSnap(enabled ? 0.1 : null); }, removeSelected: () => { if (selected) removePart(selected.userData.id); }, setView, toggleProjection: () => { const wasPerspective = camera === perspective; camera = wasPerspective ? orthographic : perspective; controls.camera = camera; return wasPerspective; }, updateSelectedTransform, validateDriveline, validateFrame, validateOperator, complete, saveForSimulator, startDriving };
}
