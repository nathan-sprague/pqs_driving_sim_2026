import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CART_COLOR = '#496b3f';

export function createCartVisual(cart) {
  const root = new THREE.Group();
  root.name = cart.id;
  const material = new THREE.MeshStandardMaterial({ color: cart.color ?? CART_COLOR, roughness: 0.78, metalness: 0.12 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.5), material);
  deck.position.y = 0.5;
  const upright = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.25, 0.18), material);
  upright.position.set(1.38, 0.87, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.18), material);
  neck.position.set(1.72, 0.94, 0);
  const hitch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: 0x22251f, metalness: 0.6, roughness: 0.4 }));
  hitch.position.set(2.55, 0.65, 0);
  const hitchDrop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.18), material);
  hitchDrop.position.set(2.5, 0.79, 0);
  root.add(deck, upright, neck, hitchDrop, hitch);
  root.userData.colorMaterial = material;
  for (const mesh of [deck, upright, neck, hitchDrop, hitch]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.blockId = cart.id;
  }

  new GLTFLoader().loadAsync('/assets/models/tractor/rear_wheel/rear_wheel.glb').then(({ scene }) => {
    if (!root.parent) return;
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry = object.geometry.clone();
      object.geometry.translate(0.25, 0, 0.41);
      if (/left/i.test(object.name)) object.position.z += 0.42;
      if (/right/i.test(object.name)) object.position.z -= 0.42;
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.blockId = cart.id;
    });
    scene.position.set(-0.72, 0.41, 0);
    scene.rotation.z = Math.PI / 2;
    root.add(scene);
    root.userData.wheels = scene;
  }).catch((error) => console.error('Unable to load cart wheels.', error));
  return root;
}
