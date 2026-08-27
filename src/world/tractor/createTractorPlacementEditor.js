import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { loadTractor } from './loadTractor.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { definition as assetDefinition, getTractorModel } from '../../config/tractorModels.js';

export async function createTractorPlacementEditor(container, modelId, onChange) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b211c);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x40382c, 2.5));
  const light = new THREE.DirectionalLight(0xfff1d5, 4);
  light.position.set(-4, 7, 5);
  scene.add(light);
  scene.add(new THREE.GridHelper(10, 20, 0x6b725f, 0x3b4037));
  const tractor = modelId === 'blank' ? createEmptyTractor() : await loadTractor(modelId);
  tractor.userData.eyeLevel?.removeFromParent();
  scene.add(tractor);
  const placement = modelId === 'blank' ? {} : getTractorModel(modelId).placement;
  const specialObjects = {};
  let personMixer = null;
  await addEyeLevelObject(placement.eyeLevel ?? { position: [-0.3, 1.7, 0], rotation: [0, Math.PI / 2, 0] });
  if (placement.display) addDisplayObject(placement.display);
  addBoundsObject(placement.bounds);
  const controls = new TransformControls(camera, renderer.domElement);
  scene.add(controls.getHelper());
  let selected = tractor.userData.assembly;
  let selectedId = 'tractor';
  let controlMode = 'translate';
  let cameraDragging = false;
  let transforming = false;
  let yaw = -0.7;
  let pitch = -0.18;
  let distance = 4.6;
  controls.attach(selected);
  controls.addEventListener('dragging-changed', (event) => { transforming = event.value; });
  controls.addEventListener('objectChange', () => onChange?.(selected));
  const down = (event) => { if (!transforming && event.button === 0) cameraDragging = true; };
  const up = () => { cameraDragging = false; };
  const move = (event) => {
    if (!cameraDragging || transforming) return;
    yaw += event.movementX * 0.008;
    pitch = THREE.MathUtils.clamp(pitch + event.movementY * 0.006, -1.1, 0.55);
  };
  const wheel = (event) => { event.preventDefault(); distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.004, 2.4, 12); };
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointermove', move);
  const resize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  let frame;
  const clock = new THREE.Clock();
  const animate = () => {
    personMixer?.update(Math.min(clock.getDelta(), 0.1));
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * distance, 1.05 + Math.sin(-pitch) * distance, Math.sin(yaw) * Math.cos(pitch) * distance);
    camera.lookAt(0.55, 0.8, 0);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  };
  animate();
  return {
    select(id) { selectedId = id; selected = id === 'tractor' ? tractor.userData.assembly : (tractor.userData.parts[id] ?? specialObjects[id]); controls.attach(selected); updateControlAxes(); onChange?.(selected); },
    listParts() { return [...Object.entries(tractor.userData.parts).map(([id, part]) => ({ id, file: part.userData.file })), ...Object.keys(specialObjects).map((id) => ({ id, special: true }))]; },
    getPartFile(id) { return tractor.userData.parts[id]?.userData.file ?? ''; },
    setMode(mode) { controlMode = mode; controls.setMode(mode); updateControlAxes(); },
    setTransform(position, rotation, scale = null) { selected.position.fromArray(position); selected.rotation.set(...(selectedId === 'eyeLevel' ? [0, rotation[1], 0] : rotation)); if (scale) selected.scale.fromArray(selectedId === 'tractorBounds' ? scale.map((value) => Math.max(0.05, Math.abs(value))) : scale); controls.updateMatrixWorld(); },
    async addEyeLevel() { if (!specialObjects.eyeLevel) await addEyeLevelObject({ position: [-0.3, 1.7, 0], rotation: [0, Math.PI / 2, 0] }); this.select('eyeLevel'); return 'eyeLevel'; },
    addDisplay() { if (!specialObjects.display) addDisplayObject({ position: [0.6, 1.2, 0.1], rotation: [0, -Math.PI / 2, 0] }); this.select('display'); return 'display'; },
    hasEyeLevel() { return Boolean(specialObjects.eyeLevel); },
    isPersonVisible() { return specialObjects.eyeLevel?.visible ?? true; },
    setPersonVisible(visible) { if (specialObjects.eyeLevel) specialObjects.eyeLevel.visible = visible; },
    async setPartFile(id, file) {
      const definition = assetDefinition(file);
      if (!definition.files.includes(file)) return;
      const previous = tractor.userData.parts[id];
      const replacement = (await new GLTFLoader().loadAsync(file)).scene;
      if (definition.geometryOffset) translateModelGeometry(replacement, ...definition.geometryOffset);
      replacement.name = id;
      replacement.position.copy(previous.position);
      replacement.rotation.copy(previous.rotation);
      replacement.scale.copy(previous.scale);
      replacement.userData.file = file;
      replacement.userData.role = definition.role;
      replacement.userData.baseRotation = replacement.rotation.toArray();
      previous.parent.add(replacement);
      previous.removeFromParent();
      tractor.userData.parts[id] = replacement;
      selected = replacement;
      controls.attach(selected);
      onChange?.(selected);
    },
    async addPart(file) {
      const definition = assetDefinition(file);
      const part = (await new GLTFLoader().loadAsync(file)).scene;
      const stem = file.split('/').at(-1).replace(/\.glb$/i, '').replaceAll(/[^a-zA-Z0-9]+/g, '-');
      let id = stem;
      let suffix = 2;
      while (tractor.userData.parts[id]) id = `${stem}-${suffix++}`;
      part.name = id;
      part.userData.file = file;
      part.userData.role = definition.role;
      part.userData.baseRotation = part.rotation.toArray();
      tractor.userData.assembly.add(part);
      tractor.userData.parts[id] = part;
      selectedId = id;
      selected = part;
      controls.attach(part);
      onChange?.(part);
      return id;
    },
    removeSelected() {
      if (selectedId === 'tractor' || selectedId === 'eyeLevel' || selectedId === 'tractorBounds') return false;
      const object = tractor.userData.parts[selectedId] ?? specialObjects[selectedId];
      object.removeFromParent();
      delete tractor.userData.parts[selectedId];
      delete specialObjects[selectedId];
      selectedId = 'tractor';
      selected = tractor.userData.assembly;
      controls.attach(selected);
      onChange?.(selected);
      return true;
    },
    serialize(name) {
      const transform = (object) => ({ position: object.position.toArray().map(round), rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(round) });
      const eyeTransform = specialObjects.eyeLevel ? transform(specialObjects.eyeLevel) : null;
      return { schemaVersion: 5, name, tractor: transform(tractor.userData.assembly), parts: Object.fromEntries(Object.entries(tractor.userData.parts).map(([id, part]) => [id, { file: part.userData.file, ...transform(part) }])), bounds: { ...transform(specialObjects.tractorBounds), size: specialObjects.tractorBounds.scale.toArray().map(round) }, eyeLevel: eyeTransform ? { ...eyeTransform, rotation: [0, eyeTransform.rotation[1], 0], personVisible: specialObjects.eyeLevel.visible } : null, display: specialObjects.display ? { ...transform(specialObjects.display), scale: specialObjects.display.scale.toArray().map(round) } : null };
    },
    dispose() { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move); controls.dispose(); renderer.dispose(); },
  };

  async function addEyeLevelObject(transform = {}) {
    const { scene: person, animations } = await new GLTFLoader().loadAsync('/assets/models/human/person.glb');
    person.name = 'eyeLevel';
    person.children.forEach((child) => { child.position.y -= 1.65; });
    personMixer = new THREE.AnimationMixer(person);
    const sittingClip = animations.find((clip) => clip.name === 'Rig|sitting_idle');
    if (sittingClip) personMixer.clipAction(sittingClip).play();
    applyObjectTransform(person, { ...transform, rotation: [0, transform.rotation?.[1] ?? Math.PI / 2, 0] });
    person.visible = transform.personVisible ?? true;
    tractor.userData.assembly.add(person);
    specialObjects.eyeLevel = person;
  }

  function addDisplayObject(transform = {}) {
    const display = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.15, 0.025), new THREE.MeshStandardMaterial({ color: 0x8ff09b }));
    display.name = 'display';
    applyObjectTransform(display, transform);
    tractor.userData.assembly.add(display);
    specialObjects.display = display;
  }

  function addBoundsObject(bounds = {}) {
    const measuredBox = new THREE.Box3();
    Object.values(tractor.userData.parts).forEach((part) => measuredBox.union(new THREE.Box3().setFromObject(part)));
    const measuredSize = measuredBox.isEmpty() ? new THREE.Vector3(2.4, 0.6, 0.88) : measuredBox.getSize(new THREE.Vector3());
    const measuredCenter = measuredBox.isEmpty() ? new THREE.Vector3(0.8, 0.63, 0) : measuredBox.getCenter(new THREE.Vector3());
    const boundsBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x62f39d, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    boundsBox.name = 'tractorBounds';
    boundsBox.position.fromArray(bounds.position ?? measuredCenter.toArray());
    boundsBox.rotation.fromArray(bounds.rotation ?? [0, 0, 0]);
    boundsBox.scale.fromArray(bounds.size ?? measuredSize.toArray());
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boundsBox.geometry), new THREE.LineBasicMaterial({ color: 0x62f39d }));
    boundsBox.add(edges);
    tractor.userData.assembly.add(boundsBox);
    specialObjects.tractorBounds = boundsBox;
  }

  function updateControlAxes() {
    const yawOnly = selectedId === 'eyeLevel' && controlMode === 'rotate';
    controls.showX = !yawOnly;
    controls.showY = true;
    controls.showZ = !yawOnly;
  }
}

function round(value) { return Math.round(value * 1000000) / 1000000; }
function translateModelGeometry(model, x, y, z) { model.traverse((object) => { if (object.isMesh) { object.geometry = object.geometry.clone(); object.geometry.translate(x, y, z); } }); }
function createEmptyTractor() {
  const tractor = new THREE.Group();
  tractor.name = 'tractor';
  const assembly = new THREE.Group();
  assembly.name = 'tractor-placement';
  tractor.add(assembly);
  tractor.userData.assembly = assembly;
  tractor.userData.parts = {};
  return tractor;
}
function applyObjectTransform(object, transform) { object.position.fromArray(transform.position ?? [0, 0, 0]); object.rotation.fromArray(transform.rotation ?? [0, 0, 0]); object.scale.fromArray(transform.scale ?? [1, 1, 1]); }
