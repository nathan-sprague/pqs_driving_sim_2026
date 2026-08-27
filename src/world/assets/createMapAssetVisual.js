import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mapAssetUrl } from '../../config/mapAssets.js';

const loader = new GLTFLoader();

export function createMapAssetVisual(asset) {
  const root = new THREE.Group();
  root.name = asset.id;
  loader.load(mapAssetUrl(asset.asset), ({ scene }) => {
    scene.traverse((child) => {
      child.userData.blockId = asset.id;
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    root.add(scene);
  }, undefined, (error) => {
    console.error(`Unable to load map asset ${asset.asset}.`, error);
    root.add(createMissingAssetMarker());
  });
  return root;
}

function createMissingAssetMarker() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff3b30, wireframe: true }),
  );
  mesh.position.y = 0.5;
  return mesh;
}
