import * as THREE from 'three';
import { createHumanVisual } from '../humans/createHumanVisual.js';

const ORANGE = 0xe56f19;

export function createPullingSledVisual(sled) {
  const root = new THREE.Group();
  root.name = sled.id;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: sled.color ?? '#343a32', roughness: 0.72, metalness: 0.22 });
  const orangeMaterial = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.65 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x20231f, roughness: 0.8 });
  const archMaterial = new THREE.MeshStandardMaterial({ color: 0x111311, roughness: 0.7, metalness: 0.35 });

  const deck = mesh(new THREE.BoxGeometry(6, 0.16, 1.5), frameMaterial, [0, 0.49, 0]);
  const weightBox = mesh(new THREE.BoxGeometry(1, 1, 1.2), orangeMaterial, [1.5, 1.07, 0]);
  const seatBase = mesh(new THREE.BoxGeometry(0.72, 0.12, 0.7), darkMaterial, [-2.35, 0.8, 0]);
  const seatBack = mesh(new THREE.BoxGeometry(0.12, 0.72, 0.7), darkMaterial, [-2.68, 1.1, 0]);
  const hitchBar = mesh(new THREE.BoxGeometry(0.65, 0.12, 0.2), frameMaterial, [3.23, 0.63, 0]);
  const hitch = mesh(new THREE.SphereGeometry(0.09, 16, 12), darkMaterial, [3.55, 0.63, 0]);
  root.add(deck, weightBox, seatBase, seatBack, hitchBar, hitch);

  const arch = new THREE.Group();
  arch.position.x = 2.65;
  arch.add(
    mesh(new THREE.BoxGeometry(0.12, 1.45, 0.12), archMaterial, [0, 1.18, 0.62]),
    mesh(new THREE.BoxGeometry(0.12, 1.45, 0.12), archMaterial, [0, 1.18, -0.62]),
    mesh(new THREE.BoxGeometry(0.12, 0.12, 1.36), archMaterial, [0, 1.9, 0]),
  );
  for (const z of [-0.55, 0.55]) {
    const light = mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.055, 20),
      new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 3 }),
      [0.09, 1.9, z],
    );
    // Cylinder faces point along local +X, toward the front/hitch end.
    light.rotation.z = -Math.PI / 2;
    arch.add(light);
  }
  root.add(arch);

  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.87, 0.87]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 20), darkMaterial, [x, 0.34, z]);
      wheel.rotation.x = Math.PI / 2;
      root.add(wheel);
    }
  }

  const operator = createHumanVisual({ id: `${sled.id}-operator`, behavior: 'sit', flagColor: 'none' });
  operator.root.position.set(-2.32, 0.82, 0);
  operator.root.rotation.y = Math.PI / 2;
  operator.root.scale.setScalar(0.9);
  root.add(operator.root);
  root.userData.humanController = operator;
  root.userData.colorMaterial = frameMaterial;
  root.traverse((object) => {
    object.userData.blockId = sled.id;
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

function mesh(geometry, material, position) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  return result;
}
