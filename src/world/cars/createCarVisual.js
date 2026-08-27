import * as THREE from 'three';
import { createMapAssetVisual } from '../assets/createMapAssetVisual.js';

export const CAR_VISUAL_SCALE = 0.15;
export const CAR_SIZE = [2.73, 1.73, 6.21];
export const CAR_CENTER_OF_MASS_HEIGHT = 0.32;

export function createCarVisual(car) {
  const root = new THREE.Group();
  root.name = car.id;
  const model = createMapAssetVisual({ id: `${car.id}-model`, asset: 'car.glb' });
  model.scale.setScalar(CAR_VISUAL_SCALE);
  // car.glb's long axis is perpendicular to the physics/body forward axis.
  model.rotation.y = Math.PI / 2;
  const durabilityBar = createDurabilityBar();
  durabilityBar.position.y = CAR_SIZE[1] + 0.55;
  root.add(model, durabilityBar);
  root.userData.setDurability = durabilityBar.userData.setDurability;
  return root;
}

function createDurabilityBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 40;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.2, 0.5, 1);
  let displayed = -1;
  sprite.userData.setDurability = (durability) => {
    const value = Math.max(0, Math.min(100, Math.round(durability)));
    if (value === displayed) return;
    displayed = value;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(12, 14, 11, .88)';
    context.fillRect(0, 0, 256, 40);
    context.fillStyle = value > 60 ? '#79c879' : value > 25 ? '#e7c04a' : '#e05245';
    context.fillRect(5, 5, 246 * value / 100, 30);
    context.strokeStyle = '#f4f0e6';
    context.lineWidth = 3;
    context.strokeRect(3, 3, 250, 34);
    texture.needsUpdate = true;
  };
  sprite.userData.setDurability(100);
  return sprite;
}
