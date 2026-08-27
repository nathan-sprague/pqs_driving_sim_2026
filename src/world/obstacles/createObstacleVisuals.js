import * as THREE from 'three';
import { createTextDisplay, formatElapsed } from '../createTextDisplay.js';
import { createHumanVisual } from '../humans/createHumanVisual.js';
import { createGroundLineGeometry } from '../lines/createGroundLineGeometry.js';
import { createCartVisual } from '../cart/createCartVisual.js';
import { createPullingSledVisual } from '../sled/createPullingSledVisual.js';
import { createMapAssetVisual } from '../assets/createMapAssetVisual.js';
import { createNitroVisual } from '../nitro/createNitroVisual.js';
import { createCarVisual } from '../cars/createCarVisual.js';
import { obstacleWorldPosition, obstacles, rampGeometry } from '../../config/obstacles.js';
import {
  POST_BALL_CENTER_Y,
  POST_BALL_RADIUS,
  POST_BASE_SIZE,
  POST_POLE_CENTER_Y,
  POST_POLE_HEIGHT,
  POST_POLE_RADIUS,
} from '../../config/posts.js';

export function createObstacleVisuals(startPose) {
  const group = new THREE.Group();
  group.name = 'test-obstacles';

  for (const obstacle of obstacles) {
    const geometry = obstacle.type === 'ramp'
      ? createRampGeometry(obstacle.size)
      : new THREE.BoxGeometry(...obstacle.size);
    const material = new THREE.MeshStandardMaterial({
      color: obstacle.color,
      roughness: 0.82,
      metalness: obstacle.id === 'barrier' ? 0.18 : 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = obstacle.id;
    mesh.position.set(...obstacleWorldPosition(obstacle, startPose));
    mesh.rotation.y = startPose.yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

export function createMapBlockVisuals(blocks) {
  const group = new THREE.Group();
  group.name = 'custom-map-blocks';
  group.userData.posts = new Map();
  group.userData.humans = new Map();
  group.userData.signs = [];
  group.userData.objects = new Map();
  group.userData.carts = new Map();
  group.userData.sleds = new Map();
  group.userData.nitros = new Map();
  group.userData.cars = new Map();
  addStaticBoxInstances(group, blocks);
  for (const block of blocks) {
    if (block.type === 'chunk') continue;
    if (block.type === 'waypoint') continue;
    if (block.type === 'asset') {
      const asset = createMapAssetVisual(block);
      asset.position.set(...block.position);
      asset.rotation.set(...block.rotation, 'XYZ');
      asset.scale.set(...block.size);
      group.add(asset);
      group.userData.objects.set(block.id, [asset]);
      continue;
    }
    if (block.type === 'nitro') {
      const nitro = createNitroVisual(block);
      nitro.position.set(...block.position);
      nitro.rotation.set(...block.rotation, 'XYZ');
      group.add(nitro);
      group.userData.nitros.set(block.id, nitro);
      group.userData.objects.set(block.id, [nitro]);
      continue;
    }
    if (block.type === 'car') {
      const car = createCarVisual(block);
      car.position.set(...block.position);
      car.rotation.set(...block.rotation, 'XYZ');
      group.add(car);
      group.userData.cars.set(block.id, car);
      group.userData.objects.set(block.id, [car]);
      continue;
    }
    if (block.type === 'post') {
      const post = createPostVisual(block);
      group.add(post.body, post.ball);
      group.userData.posts.set(block.id, post);
      group.userData.objects.set(block.id, [post.body, post.ball]);
      continue;
    }
    if (block.type === 'human') {
      const human = createHumanVisual(block);
      human.root.position.set(...block.position);
      human.root.rotation.set(...block.rotation, 'XYZ');
      group.add(human.root);
      group.userData.humans.set(block.id, human);
      group.userData.objects.set(block.id, [human.root]);
      continue;
    }
    if (block.type === 'threshold') {
      // Thresholds are editor-only guides; physics still uses their saved transforms.
      continue;
    }
    if (block.type === 'line') {
      const line = createGroundLineVisual(block);
      group.add(line);
      group.userData.objects.set(block.id, [line]);
      continue;
    }
    if (block.type === 'cart') {
      const cart = createCartVisual(block);
      cart.position.set(...block.position);
      cart.rotation.set(...block.rotation, 'XYZ');
      group.add(cart);
      group.userData.carts.set(block.id, cart);
      group.userData.objects.set(block.id, [cart]);
      continue;
    }
    if (block.type === 'pulling-sled') {
      const sled = createPullingSledVisual(block);
      sled.position.set(...block.position);
      sled.rotation.set(...block.rotation, 'XYZ');
      group.add(sled);
      group.userData.sleds.set(block.id, sled);
      group.userData.objects.set(block.id, [sled]);
      continue;
    }
    if (!block.movable && !block.sign) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...block.size),
      new THREE.MeshStandardMaterial({ color: block.color, roughness: 0.8 }),
    );
    mesh.name = block.id;
    mesh.position.set(...block.position);
    mesh.rotation.set(...block.rotation, 'XYZ');
    mesh.castShadow = block.castShadow !== false;
    mesh.receiveShadow = true;
    mesh.material.visible = !block.invisible;
    group.add(mesh);
    group.userData.objects.set(block.id, [mesh]);
    if (block.sign) {
      const sign = createSignVisual(block);
      mesh.add(sign.mesh);
      group.userData.signs.push({ ...sign, definition: block.sign });
    }
  }
  group.userData.updateSigns = ({ elapsedSeconds, distanceFeet }) => {
    for (const sign of group.userData.signs) {
      const { type, text } = sign.definition;
      const value = type === 'time'
        ? formatElapsed(elapsedSeconds)
        : type === 'distance'
          ? `${distanceFeet.toFixed(1)} ft`
          : text;
      sign.display.setText(value || ' ');
    }
  };
  group.userData.updateHumanAnimations = (deltaSeconds) => {
    for (const human of group.userData.humans.values()) human.update(deltaSeconds);
    for (const sled of group.userData.sleds.values()) sled.userData.humanController?.update(deltaSeconds);
  };
  group.userData.setObjectActive = (id, active) => {
    const nitro = group.userData.nitros.get(id);
    if (nitro && nitro.parent !== group) return;
    for (const object of group.userData.objects.get(id) ?? []) {
      if (object.userData.setActive) object.userData.setActive(active);
      else object.visible = active;
    }
  };
  return group;
}

function addStaticBoxInstances(group, blocks) {
  const batches = new Map();
  for (const block of blocks) {
    if (block.type !== 'box' || block.movable || block.sign || block.invisible) continue;
    const key = block.castShadow === false ? 'no-shadow' : 'shadow';
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(block);
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  for (const [key, batch] of batches) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      batch.length,
    );
    mesh.name = `static-map-boxes-${key}`;
    mesh.castShadow = key === 'shadow';
    mesh.receiveShadow = true;
    mesh.userData.activeInstances = new Uint8Array(batch.length).fill(1);
    batch.forEach((block, index) => {
      position.fromArray(block.position);
      quaternion.setFromEuler(euler.set(...block.rotation, 'XYZ'));
      scale.fromArray(block.size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(block.color));
      const controller = { userData: {} };
      controller.userData.setActive = (active) => {
        mesh.userData.activeInstances[index] = active ? 1 : 0;
        if (active) matrix.compose(position.fromArray(block.position), quaternion.setFromEuler(euler.set(...block.rotation, 'XYZ')), scale.fromArray(block.size));
        else matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(index, matrix);
        mesh.instanceMatrix.needsUpdate = true;
      };
      group.userData.objects.set(block.id, [controller]);
    });
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

function createGroundLineVisual(line) {
  const mesh = new THREE.Mesh(
    createGroundLineGeometry(line.points, line.thickness, line.curved),
    new THREE.MeshBasicMaterial({ color: line.color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.name = line.id;
  mesh.position.set(...line.position);
  mesh.rotation.set(...line.rotation, 'XYZ');
  return mesh;
}

function createSignVisual(block) {
  const display = createTextDisplay();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(block.size[0] * 0.84, block.size[1] * 0.58),
    new THREE.MeshBasicMaterial({ map: display.texture, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.name = `${block.id}-sign`;
  mesh.position.z = block.size[2] / 2 + 0.006;
  return { mesh, display };
}

function createPostVisual(post) {
  const body = new THREE.Group();
  body.name = `${post.id}-body`;
  const baseMaterial = new THREE.MeshStandardMaterial({ color: post.color, roughness: 0.7 });
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(...POST_BASE_SIZE), baseMaterial);
  base.position.y = POST_BASE_SIZE[1] / 2;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POST_POLE_RADIUS, POST_POLE_RADIUS, POST_POLE_HEIGHT, 16),
    whiteMaterial,
  );
  pole.position.y = POST_POLE_CENTER_Y;
  body.add(base, pole);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(POST_BALL_RADIUS, 16, 12), whiteMaterial);
  ball.name = `${post.id}-ball`;
  body.position.set(...post.position);
  body.rotation.set(...post.rotation, 'XYZ');
  body.updateMatrixWorld(true);
  body.localToWorld(ball.position.set(0, POST_BALL_CENTER_Y, 0));
  ball.quaternion.copy(body.quaternion);

  for (const object of [base, pole, ball]) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
  return { body, ball };
}

function createRampGeometry(size) {
  const { vertices, indices } = rampGeometry(size);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
