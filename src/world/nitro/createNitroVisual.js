import * as THREE from 'three';

export function createNitroVisual(nitro) {
  const root = new THREE.Group();
  root.name = nitro.id;
  const material = new THREE.MeshStandardMaterial({ color: '#1769c2', roughness: 0.42, metalness: 0.35 });
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 20), material);
  cylinder.position.y = 0.45;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.16), createNitroLabelMaterial());
  label.position.set(0, 0.48, 0.221);
  root.add(cylinder, label);
  root.userData.colorMaterial = material;
  root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return root;
}

function createNitroLabelMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f4f0e6';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0b3f7a';
  context.font = 'bold 50px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('NITRO', 128, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture });
}
