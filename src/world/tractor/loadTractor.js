import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_TRACTOR_MODEL_ID, getTractorModel } from '../../config/tractorModels.js';

export async function loadTractor(modelId = DEFAULT_TRACTOR_MODEL_ID, placementOverride = null) {
  const model = getTractorModel(modelId);
  const loader = new GLTFLoader();
  const loaded = {};
  await Promise.all(Object.entries(model.parts).map(async ([id, definition]) => {
    loaded[id] = await loadPart(loader, definition, placementOverride?.parts?.[id]);
  }));

  const placement = placementOverride ?? model.placement ?? await loadPlacement(model.placementFile, modelId);

  await Promise.all(Object.entries(model.parts).map(async ([id, definition]) => {
    if (placementOverride || !placement.parts?.[id]?.file || placement.parts[id].file === definition.defaultFile) return;
    loaded[id] = await loadPart(loader, definition, placement.parts[id]);
  }));

  const tractor = new THREE.Group();
  tractor.name = 'tractor';
  const assembly = new THREE.Group();
  assembly.name = 'tractor-placement';
  applyTransform(assembly, placement.tractor);
  tractor.add(assembly);
  for (const [id, part] of Object.entries(loaded)) {
    part.name = id;
    applyTransform(part, placement.parts?.[id]);
    part.userData.baseRotation = part.rotation.toArray();
    part.userData.file = placement.parts?.[id]?.file ?? model.parts[id].defaultFile;
    part.userData.role = model.parts[id].role;
    assembly.add(part);
  }
  tractor.userData.assembly = assembly;
  tractor.userData.parts = loaded;
  tractor.userData.placement = placement;

  tractor.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  return tractor;
}

async function loadPart(loader, definition, placement = {}) {
  if (placement.procedural || definition.procedural) return createProceduralPart(placement.procedural ?? definition.procedural);
  const requestedFile = placement.file ?? definition.defaultFile;
  const file = definition.files.includes(requestedFile) ? requestedFile : definition.defaultFile;
  const scene = (await loader.loadAsync(file)).scene;
  if (definition.geometryOffset) translateModelGeometry(scene, ...definition.geometryOffset);
  return scene;
}

function createProceduralPart(spec = {}) {
  const color = spec.color ?? 0x718087;
  const material = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.42, side: THREE.DoubleSide });
  let geometry;
  if (spec.kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(spec.radius ?? 0.08, spec.radius ?? 0.08, spec.length ?? 1, 20);
    geometry.rotateZ(Math.PI / 2);
  } else if (spec.kind === 'polygon' && spec.points?.length >= 3) {
    const shape = new THREE.Shape(spec.points.map(([x, y]) => new THREE.Vector2(x, y)));
    geometry = new THREE.ExtrudeGeometry(shape, { depth: spec.depth ?? 0.01, bevelEnabled: false });
    if ((spec.plane ?? 'XZ') === 'XZ') geometry.rotateX(Math.PI / 2);
    if (spec.plane === 'YZ') geometry.rotateY(Math.PI / 2);
    geometry.center();
  } else {
    geometry = new THREE.BoxGeometry(...(spec.size ?? [1, 0.1, 0.1]));
  }
  return new THREE.Mesh(geometry, material);
}

function applyTransform(object, transform = {}) {
  object.position.fromArray(transform.position ?? [0, 0, 0]);
  object.rotation.fromArray(transform.rotation ?? [0, 0, 0]);
  object.scale.fromArray(transform.scale ?? [1, 1, 1]);
}

async function loadPlacement(file, modelId) {
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const placement = await response.json();
    if (placement.modelId !== modelId || !placement.parts) throw new Error('modelId or parts is invalid');
    return placement;
  } catch (error) {
    throw new Error(`Unable to load tractor placement ${file}: ${error.message}`);
  }
}

function translateModelGeometry(model, x, y, z) {
  model.traverse((object) => {
    if (!object.isMesh) return;
    // Avoid moving another instance when cloned meshes share a geometry object.
    object.geometry = object.geometry.clone();
    object.geometry.translate(x, y, z);
  });
}
