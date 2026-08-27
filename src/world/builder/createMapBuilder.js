import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createBlock, createCar, createCart, createChunkRegion, createGroundLine, createHuman, createMapAsset, createNitro, createPost, createPullingSled, createThreshold, createWaypoint, MAX_MAP_OBJECTS } from '../../config/maps.js';
import { createNitroVisual } from '../nitro/createNitroVisual.js';
import { createMapAssetVisual } from '../assets/createMapAssetVisual.js';
import { createTextDisplay } from '../createTextDisplay.js';
import { createHumanVisual } from '../humans/createHumanVisual.js';
import { createGroundLineGeometry } from '../lines/createGroundLineGeometry.js';
import { createCartVisual } from '../cart/createCartVisual.js';
import { createPullingSledVisual } from '../sled/createPullingSledVisual.js';
import { createCarVisual } from '../cars/createCarVisual.js';
import {
  POST_BALL_CENTER_Y,
  POST_BALL_RADIUS,
  POST_BASE_SIZE,
  POST_POLE_CENTER_Y,
  POST_POLE_HEIGHT,
  POST_POLE_RADIUS,
} from '../../config/posts.js';

export function createMapBuilder(container, map, callbacks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bb5c0);
  scene.fog = new THREE.Fog(0x9bb5c0, 45, 130);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 250);
  camera.position.set(-6, 5, 6);
  camera.lookAt(3, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x705843, 2.3));
  const sun = new THREE.DirectionalLight(0xfff4da, 3.4);
  sun.position.set(-8, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -35;
  sun.shadow.camera.right = sun.shadow.camera.top = 35;
  scene.add(sun);

  const grid = new THREE.GridHelper(100, 100, 0x46534c, 0x748078);
  grid.position.y = 0.003;
  scene.add(grid);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x82705b, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const objectMeshes = new Map();
  const carPathMeshes = new Map();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  map.groups ??= [];
  let selectedId = null;
  let yaw = -Math.PI / 2;
  let pitch = -0.25;
  const keys = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const transformControls = new TransformControls(camera, renderer.domElement);
  const groupTransformTarget = new THREE.Object3D();
  let transforming = false;
  let skipNextCanvasClick = false;
  scene.add(transformControls.getHelper(), groupTransformTarget);

  const spawnMarker = createSpawnMarker();
  scene.add(spawnMarker);

  for (const block of map.blocks) addObjectMesh(block);
  updateEditorVisibility();
  updateSpawnMarker();

  function addObjectMesh(block) {
    const mesh = block.type === 'asset'
      ? createMapAssetVisual(block)
      : block.type === 'waypoint'
        ? createWaypointMesh()
      : block.type === 'nitro'
        ? createNitroVisual(block)
      : block.type === 'post'
      ? createPostMesh(block.color)
      : block.type === 'human'
        ? createHumanMesh(block)
        : block.type === 'threshold'
          ? createThresholdMesh(block.thresholdAction)
          : block.type === 'chunk'
            ? createChunkMesh()
          : block.type === 'line'
            ? createGroundLineMesh(block)
            : block.type === 'cart'
              ? createCartVisual(block)
            : block.type === 'car'
              ? createCarVisual(block)
            : block.type === 'pulling-sled'
              ? createPullingSledVisual(block)
        : new THREE.Mesh(
        boxGeometry,
        new THREE.MeshStandardMaterial({ color: block.color, roughness: 0.78 }),
      );
    mesh.userData.blockId = block.id;
    mesh.traverse((child) => {
      child.userData.blockId = block.id;
      if (child.isMesh) {
        child.castShadow = block.type !== 'box' || block.castShadow !== false;
        child.receiveShadow = true;
      }
    });
    scene.add(mesh);
    objectMeshes.set(block.id, mesh);
    syncBlockMesh(block);
  }

  function syncBlockMesh(block) {
    const mesh = objectMeshes.get(block.id);
    if (!mesh) return;
    mesh.position.set(...block.position);
    if (block.type === 'box' || block.type === 'threshold' || block.type === 'chunk' || block.type === 'asset') mesh.scale.set(...block.size);
    mesh.rotation.set(...block.rotation, 'XYZ');
    const material = mesh.userData.colorMaterial ?? mesh.material;
    material?.color?.set(block.color);
    const selected = isBlockSelected(block.id);
    material?.emissive?.set(selected ? 0x332106 : 0x000000);
    if (block.type === 'box') {
      mesh.traverse((child) => {
        if (child.isMesh) child.castShadow = block.castShadow !== false;
      });
      material.transparent = block.invisible;
      material.opacity = block.invisible ? (selected ? 0.34 : 0.16) : 1;
      syncSign(mesh, block);
    }
    if (block.type === 'human') {
      mesh.userData.humanController.setState(block.behavior);
      mesh.userData.humanController.setFlag(block.flagColor);
    }
    if (block.type === 'threshold') setThresholdAppearance(mesh, block.thresholdAction, selected);
    if (block.type === 'chunk') setChunkAppearance(mesh, selected);
    if (block.type === 'line') syncGroundLine(mesh, block, selected);
    if (block.type === 'car') syncCarPath(block);
  }

  function syncCarPath(car) {
    let path = carPathMeshes.get(car.id);
    if (!path) {
      path = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({ color: 0xffd15c, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.9 }),
      );
      path.name = `${car.id}-route`;
      path.raycast = () => {};
      scene.add(path);
      carPathMeshes.set(car.id, path);
    }
    path.visible = car.carBehavior === 'coordinates' && car.destinations.length > 0;
    if (!path.visible) return;
    const points = [
      new THREE.Vector3(car.position[0], 0.12, car.position[2]),
      ...car.destinations.map(([x, z]) => new THREE.Vector3(x, 0.12, z)),
    ];
    if (car.destinations.length > 1) {
      const [firstX, firstZ] = car.destinations[0];
      points.push(new THREE.Vector3(firstX, 0.12, firstZ));
    }
    path.geometry.dispose();
    path.geometry = new THREE.BufferGeometry().setFromPoints(points);
    path.computeLineDistances();
  }

  function updateEditorVisibility() {
    const chunks = map.blocks.filter((block) => block.type === 'chunk');
    const hiddenObjectIds = new Set();
    chunks.filter((chunk) => !chunk.editorVisible).forEach((chunk) => {
      chunk.objectIds.forEach((id) => hiddenObjectIds.add(id));
    });
    for (const block of map.blocks) {
      const mesh = objectMeshes.get(block.id);
      if (!mesh) continue;
      if (block.type === 'chunk') {
        mesh.visible = block.editorVisible;
        continue;
      }
      mesh.visible = !hiddenObjectIds.has(block.id);
      const carPath = carPathMeshes.get(block.id);
      if (carPath) carPath.visible = mesh.visible && block.carBehavior === 'coordinates' && block.destinations.length > 0;
    }
  }

  function updateSpawnMarker() {
    spawnMarker.position.set(...map.vehicleStart.position);
    spawnMarker.rotation.set(...map.vehicleStart.rotation, 'XYZ');
  }

  function groupForObject(id) {
    return map.groups.find((group) => group.objectIds.includes(id));
  }

  function isBlockSelected(id) {
    return id === selectedId || Boolean(map.groups.find((group) => group.id === selectedId)?.objectIds.includes(id));
  }

  function groupSelection(group) {
    const members = group.objectIds.map((id) => map.blocks.find((block) => block.id === id)).filter(Boolean);
    const position = members.reduce((sum, block) => sum.map((value, axis) => value + block.position[axis]), [0, 0, 0])
      .map((value) => value / Math.max(1, members.length));
    return { id: group.id, name: group.name, type: 'group', position, rotation: [...(group.rotation ?? [0, 0, 0])], objectIds: [...group.objectIds] };
  }

  function select(id) {
    const group = map.groups.find((candidate) => candidate.id === id) ?? groupForObject(id);
    if (group) id = group.id;
    selectedId = id;
    for (const block of map.blocks) syncBlockMesh(block);
    if (group) {
      const selection = groupSelection(group);
      groupTransformTarget.position.fromArray(selection.position);
      groupTransformTarget.rotation.set(...selection.rotation, 'XYZ');
      transformControls.attach(groupTransformTarget);
    } else if (objectMeshes.has(id)) {
      transformControls.attach(objectMeshes.get(id));
    } else {
      transformControls.detach();
    }
    callbacks.onSelectionChange?.(group ? groupSelection(group) : map.blocks.find((block) => block.id === id) ?? null);
  }

  transformControls.addEventListener('dragging-changed', (event) => {
    transforming = event.value;
    if (!event.value) skipNextCanvasClick = true;
  });
  transformControls.addEventListener('objectChange', () => {
    const group = map.groups.find((candidate) => candidate.id === selectedId);
    if (group) {
      applyGroupGizmoTransform(group);
      callbacks.onSelectionChange?.(groupSelection(group));
      return;
    }
    const block = map.blocks.find((candidate) => candidate.id === selectedId);
    const mesh = objectMeshes.get(selectedId);
    if (!block || !mesh) return;
    block.position = mesh.position.toArray();
    block.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
    if (block.type === 'box' || block.type === 'threshold' || block.type === 'chunk' || block.type === 'asset') {
      block.size = mesh.scale.toArray().map((value) => Math.max(0.05, Math.abs(value)));
    }
    callbacks.onSelectionChange?.(block);
  });
  transformControls.addEventListener('mouseUp', () => callbacks.onMapChange?.(map));

  function applyGroupGizmoTransform(group) {
    const selection = groupSelection(group);
    const previousCenter = new THREE.Vector3(...selection.position);
    const nextCenter = groupTransformTarget.position;
    const previousQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...selection.rotation, 'XYZ'));
    const nextRotation = [groupTransformTarget.rotation.x, groupTransformTarget.rotation.y, groupTransformTarget.rotation.z];
    const nextQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nextRotation, 'XYZ'));
    const deltaQuaternion = nextQuaternion.multiply(previousQuaternion.invert());
    for (const id of group.objectIds) {
      const member = map.blocks.find((candidate) => candidate.id === id);
      if (!member) continue;
      const position = new THREE.Vector3(...member.position)
        .sub(previousCenter)
        .applyQuaternion(deltaQuaternion)
        .add(nextCenter);
      const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...member.rotation, 'XYZ'));
      orientation.premultiply(deltaQuaternion);
      member.position = position.toArray();
      member.rotation = new THREE.Euler().setFromQuaternion(orientation, 'XYZ').toArray().slice(0, 3);
      syncBlockMesh(member);
    }
    group.rotation = nextRotation;
  }

  function cloneObject(block, offset, idMap) {
    const clone = structuredClone(block);
    clone.id = crypto.randomUUID();
    clone.name = `${block.name} copy`.slice(0, 80);
    clone.position = clone.position.map((value, axis) => value + (axis === 0 || axis === 2 ? offset : 0));
    if (clone.objectChanges) clone.objectChanges = clone.objectChanges.map((change) => ({
      ...change,
      id: idMap.get(change.id) ?? change.id,
    }));
    return clone;
  }

  const handleCanvasClick = (event) => {
    if (transforming || skipNextCanvasClick) {
      skipNextCanvasClick = false;
      return;
    }
    if (document.pointerLockElement === renderer.domElement) pointer.set(0, 0);
    else {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }
    raycaster.setFromCamera(pointer, camera);
    const selectableMeshes = [...objectMeshes.values()].filter((mesh) => mesh.visible);
    const hit = raycaster.intersectObjects(selectableMeshes, true)[0];
    if (hit) {
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      select(hit.object.userData.blockId);
      return;
    }
    if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  };

  const handleMouseMove = (event) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= event.movementX * 0.0025;
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0025, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  };
  const handleKeyDown = (event) => keys.add(event.code);
  const handleKeyUp = (event) => keys.delete(event.code);
  const clearKeys = () => keys.clear();
  renderer.domElement.addEventListener('click', handleCanvasClick);
  document.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', clearKeys);

  const resize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  let previous = performance.now();
  let frameId;
  const animate = (time) => {
    const delta = Math.min((time - previous) / 1000, 0.05);
    previous = time;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (document.pointerLockElement === renderer.domElement) moveCamera(delta);
    for (const mesh of objectMeshes.values()) mesh.userData.humanController?.update(delta);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  };

  function moveCamera(delta) {
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 7) * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    if (keys.has('KeyW')) camera.position.addScaledVector(forward, speed);
    if (keys.has('KeyS')) camera.position.addScaledVector(forward, -speed);
    if (keys.has('KeyA')) camera.position.addScaledVector(right, -speed);
    if (keys.has('KeyD')) camera.position.addScaledVector(right, speed);
    if (keys.has('Space')) camera.position.y += speed;
    if (keys.has('ControlLeft') || keys.has('ControlRight')) camera.position.y -= speed;
  }

  animate(previous);

  return {
    selectObject(id) {
      if (!objectMeshes.has(id) && !map.groups.some((group) => group.id === id)) return;
      select(id);
    },
    enterFlyMode() {
      renderer.domElement.requestPointerLock();
    },
    setTransformMode(mode) {
      if (mode === 'translate' || mode === 'rotate') transformControls.setMode(mode);
    },
    addBlock() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      position.y = Math.max(0.5, position.y);
      const block = createBlock(position.toArray());
      map.blocks.push(block);
      addObjectMesh(block);
      select(block.id);
      callbacks.onMapChange?.(map);
    },
    addNitro() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const nitro = createNitro([position.x, Math.max(0, position.y), position.z]);
      map.blocks.push(nitro);
      addObjectMesh(nitro);
      select(nitro.id);
      callbacks.onMapChange?.(map);
    },
    addMapAsset(filename) {
      if (!filename) return;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const asset = createMapAsset(filename, [position.x, Math.max(0, position.y), position.z]);
      map.blocks.push(asset);
      addObjectMesh(asset);
      select(asset.id);
      callbacks.onMapChange?.(map);
    },
    addPost() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const post = createPost([position.x, 0, position.z]);
      map.blocks.push(post);
      addObjectMesh(post);
      select(post.id);
      callbacks.onMapChange?.(map);
    },
    addHuman() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const human = createHuman([position.x, 0, position.z]);
      map.blocks.push(human);
      addObjectMesh(human);
      select(human.id);
      callbacks.onMapChange?.(map);
    },
    addWaypoint() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const waypoint = createWaypoint([position.x, Math.max(0.5, position.y), position.z]);
      map.blocks.push(waypoint);
      addObjectMesh(waypoint);
      select(waypoint.id);
      callbacks.onMapChange?.(map);
    },
    addThreshold() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const threshold = createThreshold([position.x, 1.25, position.z]);
      map.blocks.push(threshold);
      addObjectMesh(threshold);
      select(threshold.id);
      callbacks.onMapChange?.(map);
    },
    addChunk() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 8);
      const chunk = createChunkRegion([position.x, Math.max(2.5, position.y), position.z]);
      map.blocks.push(chunk);
      addObjectMesh(chunk);
      select(chunk.id);
      callbacks.onMapChange?.(map);
    },
    addGroundLine() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 4);
      const line = createGroundLine([position.x, 0.02, position.z]);
      map.blocks.push(line);
      addObjectMesh(line);
      select(line.id);
      callbacks.onMapChange?.(map);
    },
    addCart() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 5);
      const cart = createCart([position.x, 0, position.z]);
      map.blocks.push(cart);
      addObjectMesh(cart);
      select(cart.id);
      callbacks.onMapChange?.(map);
    },
    addCar() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 7);
      const car = createCar([position.x, 0, position.z]);
      map.blocks.push(car);
      addObjectMesh(car);
      select(car.id);
      callbacks.onMapChange?.(map);
    },
    addPullingSled() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const position = camera.position.clone().addScaledVector(direction, 7);
      const sled = createPullingSled([position.x, 0, position.z]);
      map.blocks.push(sled);
      addObjectMesh(sled);
      select(sled.id);
      callbacks.onMapChange?.(map);
    },
    groupObjects(objectIds) {
      const validIds = [...new Set(objectIds)].filter((id) => {
        const block = map.blocks.find((candidate) => candidate.id === id);
        return block && block.type !== 'chunk';
      });
      if (validIds.length < 2) return null;
      for (const group of map.groups) group.objectIds = group.objectIds.filter((id) => !validIds.includes(id));
      map.groups = map.groups.filter((group) => group.objectIds.length >= 2);
      const group = { id: crypto.randomUUID(), name: `Group ${map.groups.length + 1}`, objectIds: validIds, rotation: [0, 0, 0] };
      map.groups.push(group);
      select(group.id);
      callbacks.onMapChange?.(map);
      return group;
    },
    ungroupObjects(objectIds) {
      const ids = new Set(objectIds);
      map.groups.forEach((group) => { group.objectIds = group.objectIds.filter((id) => !ids.has(id)); });
      map.groups = map.groups.filter((group) => group.objectIds.length >= 2);
      callbacks.onMapChange?.(map);
    },
    ungroupSelected() {
      const group = map.groups.find((candidate) => candidate.id === selectedId);
      if (!group) return;
      const firstId = group.objectIds[0];
      map.groups = map.groups.filter((candidate) => candidate.id !== group.id);
      select(firstId);
      callbacks.onMapChange?.(map);
    },
    duplicateObjects(objectIds) {
      const originals = [...new Set(objectIds)]
        .map((id) => map.blocks.find((block) => block.id === id))
        .filter((block) => block && block.type !== 'chunk');
      if (!originals.length || map.blocks.length + originals.length > MAX_MAP_OBJECTS) return [];
      const idMap = new Map(originals.map((block) => [block.id, crypto.randomUUID()]));
      const clones = originals.map((block) => {
        const clone = cloneObject(block, 1, idMap);
        clone.id = idMap.get(block.id);
        return clone;
      });
      map.blocks.push(...clones);
      clones.forEach(addObjectMesh);
      for (const chunk of map.blocks.filter((block) => block.type === 'chunk')) {
        const duplicatedMembers = chunk.objectIds.filter((id) => idMap.has(id)).map((id) => idMap.get(id));
        chunk.objectIds.push(...duplicatedMembers);
      }
      updateEditorVisibility();
      const sourceGroups = map.groups.filter((group) => group.objectIds.some((id) => idMap.has(id)));
      for (const source of sourceGroups) {
        const members = source.objectIds.filter((id) => idMap.has(id)).map((id) => idMap.get(id));
        if (members.length >= 2) map.groups.push({
          id: crypto.randomUUID(),
          name: `${source.name} copy`,
          objectIds: members,
          rotation: [...(source.rotation ?? [0, 0, 0])],
        });
      }
      select(clones[0].id);
      callbacks.onMapChange?.(map);
      return clones.map((clone) => clone.id);
    },
    updateSelected(field, axis, value) {
      const group = map.groups.find((candidate) => candidate.id === selectedId);
      if (group) {
        const selection = groupSelection(group);
        if (field === 'position') {
          const delta = Number(value) - selection.position[axis];
          for (const id of group.objectIds) {
            const member = map.blocks.find((candidate) => candidate.id === id);
            if (!member) continue;
            member.position[axis] += delta;
            syncBlockMesh(member);
          }
        } else if (field === 'rotation') {
          const center = new THREE.Vector3(...selection.position);
          const nextRotation = [...selection.rotation];
          nextRotation[axis] = Number(value);
          const previousQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...selection.rotation, 'XYZ'));
          const nextQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nextRotation, 'XYZ'));
          const deltaQuaternion = nextQuaternion.multiply(previousQuaternion.invert());
          for (const id of group.objectIds) {
            const member = map.blocks.find((candidate) => candidate.id === id);
            if (!member) continue;
            const position = new THREE.Vector3(...member.position).sub(center).applyQuaternion(deltaQuaternion).add(center);
            const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...member.rotation, 'XYZ'));
            orientation.premultiply(deltaQuaternion);
            member.position = position.toArray();
            member.rotation = new THREE.Euler().setFromQuaternion(orientation, 'XYZ').toArray().slice(0, 3);
            syncBlockMesh(member);
          }
          group.rotation = nextRotation;
        } else {
          return;
        }
        const updatedSelection = groupSelection(group);
        groupTransformTarget.position.fromArray(updatedSelection.position);
        groupTransformTarget.rotation.set(...updatedSelection.rotation, 'XYZ');
        callbacks.onSelectionChange?.(updatedSelection);
        callbacks.onMapChange?.(map);
        return;
      }
      const block = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!block) return;
      if (field === 'color') block.color = value;
      else block[field][axis] = Number(value);
      if (field === 'size') block.size[axis] = Math.max(0.05, Math.abs(block.size[axis]));
      syncBlockMesh(block);
      if (block.type === 'chunk') updateEditorVisibility();
      callbacks.onSelectionChange?.(block);
      callbacks.onMapChange?.(map);
    },
    updateSelectedName(value) {
      const group = map.groups.find((candidate) => candidate.id === selectedId);
      if (group) {
        group.name = String(value).slice(0, 80);
        callbacks.onSelectionChange?.(groupSelection(group));
        callbacks.onMapChange?.(map);
        return;
      }
      const object = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!object) return;
      object.name = String(value).slice(0, 80);
      callbacks.onMapChange?.(map);
    },
    updateSelectedBlockOption(field, value) {
      const block = map.blocks.find((candidate) => candidate.id === selectedId);
      const supportsInitialState = ['waypoint', 'threshold'].includes(block?.type) && field === 'initiallyActive';
      if (!block || (block.type !== 'box' && !supportsInitialState)) return;
      block[field] = Boolean(value);
      syncBlockMesh(block);
      callbacks.onMapChange?.(map);
    },
    updateSelectedPostClassification(value) {
      const post = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!post || post.type !== 'post') return;
      post.classification = value === 'red' ? 'red' : 'yellow';
      callbacks.onSelectionChange?.(post);
      callbacks.onMapChange?.(map);
    },
    updateSelectedBlockPhysics(field, value) {
      const block = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!block || block.type !== 'box') return;
      if (field === 'movable') block.movable = Boolean(value);
      if (field === 'massKg') block.massKg = Math.min(10000, Math.max(0.1, Number(value) || 25));
      callbacks.onSelectionChange?.(block);
      callbacks.onMapChange?.(map);
    },
    updateSelectedImpactDamage(value) {
      const block = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!block || ['chunk', 'threshold', 'line', 'asset'].includes(block.type)) return;
      block.structuralDamage = Math.min(100, Math.max(0, Number(value) || 0));
      callbacks.onSelectionChange?.(block);
      callbacks.onMapChange?.(map);
    },
    updateSelectedChunkOption(field, value) {
      const chunk = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!chunk || chunk.type !== 'chunk') return;
      chunk[field] = Boolean(value);
      callbacks.onMapChange?.(map);
    },
    updateSelectedChunkMembers(objectIds) {
      const chunk = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!chunk || chunk.type !== 'chunk') return;
      const memberIds = [...new Set(objectIds)];
      const memberIdSet = new Set(memberIds);
      for (const otherChunk of map.blocks.filter((candidate) => candidate.type === 'chunk' && candidate.id !== chunk.id)) {
        otherChunk.objectIds = otherChunk.objectIds.filter((id) => !memberIdSet.has(id));
      }
      chunk.objectIds = memberIds;
      updateEditorVisibility();
      callbacks.onMapChange?.(map);
    },
    setChunkEditorVisible(id, visible) {
      const chunk = map.blocks.find((candidate) => candidate.id === id && candidate.type === 'chunk');
      if (!chunk) return;
      chunk.editorVisible = Boolean(visible);
      if (!chunk.editorVisible && selectedId === chunk.id) select(null);
      updateEditorVisibility();
      callbacks.onMapChange?.(map);
    },
    updateSelectedSign(type, text = '') {
      const block = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!block || block.type !== 'box') return;
      block.sign = type === 'none' ? null : { type, text: String(text).slice(0, 120) };
      syncBlockMesh(block);
      callbacks.onSelectionChange?.(block);
      callbacks.onMapChange?.(map);
    },
    updateSelectedBehavior(behavior) {
      const human = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!human || human.type !== 'human') return;
      human.behavior = behavior;
      syncBlockMesh(human);
      callbacks.onSelectionChange?.(human);
      callbacks.onMapChange?.(map);
    },
    updateSelectedHumanOption(field, value) {
      const human = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!human || human.type !== 'human') return;
      human[field] = field === 'flagColor' ? value : Boolean(value);
      syncBlockMesh(human);
      callbacks.onMapChange?.(map);
    },
    updateSelectedHumanWaypoint(index, axis, value) {
      const human = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!human || human.type !== 'human' || !human.waypoints[index]) return;
      const number = Number(value) || 0;
      human.waypoints[index][axis] = axis === 2 ? Math.min(60, Math.max(0, number)) : number;
      callbacks.onMapChange?.(map);
    },
    addHumanWaypoint() {
      const human = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!human || human.type !== 'human' || human.waypoints.length >= 50) return;
      const last = human.waypoints.at(-1);
      human.waypoints.push([last[0] + 2, last[1], last[2]]);
      callbacks.onSelectionChange?.(human);
      callbacks.onMapChange?.(map);
    },
    removeHumanWaypoint(index) {
      const human = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!human || human.type !== 'human' || human.waypoints.length <= 1) return;
      human.waypoints.splice(index, 1);
      callbacks.onSelectionChange?.(human);
      callbacks.onMapChange?.(map);
    },
    updateSelectedCarBehavior(behavior) {
      const car = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!car || car.type !== 'car') return;
      car.carBehavior = behavior === 'player' ? 'player' : 'coordinates';
      syncCarPath(car);
      callbacks.onSelectionChange?.(car);
      callbacks.onMapChange?.(map);
    },
    updateSelectedCarDamage(field, value) {
      const car = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!car || car.type !== 'car' || !['tractorHitDamage', 'carHitDamage'].includes(field)) return;
      car[field] = Math.min(100, Math.max(0, Number(value) || 0));
      callbacks.onMapChange?.(map);
    },
    updateSelectedCarMotion(field, value) {
      const car = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!car || car.type !== 'car' || !['maxSpeedMph', 'acceleration'].includes(field)) return;
      const limits = field === 'maxSpeedMph' ? [1, 60, 16] : [0.2, 15, 3];
      car[field] = Math.min(limits[1], Math.max(limits[0], Number(value) || limits[2]));
      callbacks.onMapChange?.(map);
    },
    updateSelectedCarDestination(index, axis, value) {
      const car = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!car || car.type !== 'car' || !car.destinations[index]) return;
      car.destinations[index][axis] = Number(value) || 0;
      syncCarPath(car);
      callbacks.onMapChange?.(map);
    },
    addCarDestination() {
      const car = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!car || car.type !== 'car' || car.destinations.length >= 50) return;
      const last = car.destinations.at(-1) ?? [car.position[0], car.position[2]];
      car.destinations.push([last[0], last[1] + 12]);
      syncCarPath(car);
      callbacks.onSelectionChange?.(car);
      callbacks.onMapChange?.(map);
    },
    removeCarDestination(index) {
      const car = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!car || car.type !== 'car' || car.destinations.length <= 1) return;
      car.destinations.splice(index, 1);
      syncCarPath(car);
      callbacks.onSelectionChange?.(car);
      callbacks.onMapChange?.(map);
    },
    updateSelectedThreshold({ action, message, duration, stopDuration, objectChanges, chunkChanges }) {
      const threshold = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!threshold || threshold.type !== 'threshold') return;
      threshold.thresholdAction = action;
      threshold.message = String(message).slice(0, 240);
      threshold.messageDuration = Math.min(30, Math.max(0.5, Number(duration) || 3));
      threshold.stopDuration = Math.min(30, Math.max(0.5, Number(stopDuration) || 2));
      threshold.objectChanges = objectChanges;
      threshold.chunkChanges = chunkChanges;
      syncBlockMesh(threshold);
      callbacks.onSelectionChange?.(threshold);
      callbacks.onMapChange?.(map);
    },
    updateSelectedLine(field, value, pointIndex = 0, axis = 0) {
      const line = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!line || line.type !== 'line') return;
      if (field === 'point') line.points[pointIndex][axis] = Number(value) || 0;
      if (field === 'thickness') line.thickness = Math.min(2, Math.max(0.02, Number(value) || 0.1));
      if (field === 'curved') line.curved = Boolean(value);
      syncBlockMesh(line);
      callbacks.onMapChange?.(map);
    },
    addLinePoint() {
      const line = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!line || line.type !== 'line' || line.points.length >= 100) return;
      const last = line.points.at(-1);
      line.points.push([last[0] + 2, last[1]]);
      syncBlockMesh(line);
      callbacks.onSelectionChange?.(line);
      callbacks.onMapChange?.(map);
    },
    removeLinePoint(index) {
      const line = map.blocks.find((candidate) => candidate.id === selectedId);
      if (!line || line.type !== 'line' || line.points.length <= 2) return;
      line.points.splice(index, 1);
      syncBlockMesh(line);
      callbacks.onSelectionChange?.(line);
      callbacks.onMapChange?.(map);
    },
    deleteSelected() {
      const selectedGroup = map.groups.find((group) => group.id === selectedId);
      const idsToDelete = new Set(selectedGroup?.objectIds ?? (selectedId ? [selectedId] : []));
      const blocksToDelete = map.blocks.filter((block) => idsToDelete.has(block.id));
      if (!blocksToDelete.length) return;
      map.blocks = map.blocks.filter((block) => !idsToDelete.has(block.id));
      for (const chunk of map.blocks.filter((candidate) => candidate.type === 'chunk')) {
        chunk.objectIds = chunk.objectIds.filter((id) => !idsToDelete.has(id));
      }
      for (const threshold of map.blocks.filter((candidate) => candidate.type === 'threshold')) {
        threshold.objectChanges = threshold.objectChanges.filter((change) => !idsToDelete.has(change.id));
        threshold.chunkChanges = threshold.chunkChanges.filter((change) => !idsToDelete.has(change.id));
      }
      for (const group of map.groups) group.objectIds = group.objectIds.filter((id) => !idsToDelete.has(id));
      map.groups = map.groups.filter((group) => group.objectIds.length >= 2);
      for (const block of blocksToDelete) {
        const mesh = objectMeshes.get(block.id);
        scene.remove(mesh);
        mesh.traverse((child) => {
          if (child.geometry !== boxGeometry) child.geometry?.dispose();
          child.material?.dispose();
        });
        objectMeshes.delete(block.id);
        const carPath = carPathMeshes.get(block.id);
        if (carPath) {
          scene.remove(carPath);
          carPath.geometry.dispose();
          carPath.material.dispose();
          carPathMeshes.delete(block.id);
        }
      }
      select(null);
      callbacks.onMapChange?.(map);
    },
    setVehicleStart() {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      map.vehicleStart.position = [camera.position.x, map.vehicleStart.position[1], camera.position.z];
      map.vehicleStart.rotation = [0, Math.atan2(-direction.z, direction.x), 0];
      map.vehicleStart.yaw = map.vehicleStart.rotation[1];
      updateSpawnMarker();
      callbacks.onMapChange?.(map);
    },
    updateVehicleStart(field, axis, value) {
      if (!['position', 'rotation'].includes(field) || !Number.isFinite(value) || axis < 0 || axis > 2) return;
      map.vehicleStart[field][axis] = value;
      map.vehicleStart.yaw = map.vehicleStart.rotation[1];
      updateSpawnMarker();
      callbacks.onMapChange?.(map);
    },
    dispose() {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
      for (const path of carPathMeshes.values()) {
        path.geometry.dispose();
        path.material.dispose();
      }
      transformControls.dispose();
      renderer.dispose();
    },
  };
}

function createHumanMesh(human) {
  const controller = createHumanVisual(human);
  controller.root.userData.humanController = controller;
  return controller.root;
}

function createWaypointMesh() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xe7a329, emissive: 0x4a2d00 });
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), material);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), material);
  stem.position.y = -0.48;
  root.add(pin, stem);
  return root;
}

function createThresholdMesh(action) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false }),
  );
  setThresholdAppearance(mesh, action, false);
  return mesh;
}

function createChunkMesh() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x58b8e8, wireframe: true, transparent: true, opacity: 0.6 }),
  );
}

function setChunkAppearance(mesh, selected) {
  mesh.material.color.set(selected ? 0xe7a329 : 0x58b8e8);
  mesh.material.opacity = selected ? 1 : 0.6;
}

function setThresholdAppearance(mesh, action, selected) {
  const color = action === 'message' ? 0x6ba7ef : action?.endsWith('stop') ? 0xe05245 : 0x54d895;
  mesh.material.color.set(color);
  mesh.material.opacity = selected ? 0.48 : 0.28;
}

function createGroundLineMesh(line) {
  const mesh = new THREE.Mesh(
    createGroundLineGeometry(line.points, line.thickness, line.curved),
    new THREE.MeshBasicMaterial({ color: line.color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.userData.geometryKey = JSON.stringify([line.points, line.thickness, line.curved]);
  return mesh;
}

function syncGroundLine(mesh, line, selected) {
  const geometryKey = JSON.stringify([line.points, line.thickness, line.curved]);
  if (mesh.userData.geometryKey !== geometryKey) {
    mesh.geometry.dispose();
    mesh.geometry = createGroundLineGeometry(line.points, line.thickness, line.curved);
    mesh.userData.geometryKey = geometryKey;
  }
  mesh.material.color.set(line.color);
  mesh.material.opacity = selected ? 0.82 : 1;
  mesh.material.transparent = selected;
}

function syncSign(mesh, block) {
  const signKey = block.sign ? `${block.sign.type}:${block.sign.text ?? ''}` : '';
  if (mesh.userData.signKey === signKey) return;
  mesh.userData.signKey = signKey;
  mesh.userData.signMesh?.removeFromParent();
  mesh.userData.signMesh?.material.map.dispose();
  mesh.userData.signMesh?.geometry.dispose();
  mesh.userData.signMesh?.material.dispose();
  mesh.userData.signMesh = null;
  if (!block.sign) return;

  const display = createTextDisplay();
  const labels = { time: '00:00', distance: '0.0 ft', text: block.sign.text || 'Custom text' };
  display.setText(labels[block.sign.type]);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.58),
    new THREE.MeshBasicMaterial({ map: display.texture, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  sign.position.z = 0.501;
  sign.userData.blockId = block.id;
  mesh.add(sign);
  mesh.userData.signMesh = sign;
}

function createPostMesh(color) {
  const group = new THREE.Group();
  const baseMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(...POST_BASE_SIZE), baseMaterial);
  base.position.y = POST_BASE_SIZE[1] / 2;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POST_POLE_RADIUS, POST_POLE_RADIUS, POST_POLE_HEIGHT, 16),
    whiteMaterial,
  );
  pole.position.y = POST_POLE_CENTER_Y;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(POST_BALL_RADIUS, 16, 12), whiteMaterial);
  ball.position.y = POST_BALL_CENTER_Y;
  group.userData.colorMaterial = baseMaterial;
  group.add(base, pole, ball);
  return group;
}

function createSpawnMarker() {
  const marker = new THREE.Group();
  marker.name = 'vehicle-start';
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.68, 32),
    new THREE.MeshBasicMaterial({ color: 0x67d6a0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.65, 3),
    new THREE.MeshBasicMaterial({ color: 0x67d6a0 }),
  );
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(0.6, 0.04, 0);
  marker.add(ring, arrow);
  return marker;
}
