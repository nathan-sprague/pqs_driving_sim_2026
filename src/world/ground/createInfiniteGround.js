import * as THREE from 'three';

const CHUNK_SIZE = 40;
const LOAD_RADIUS = 2;
const TEXTURE_REPEATS_PER_CHUNK = 12;

export function createInfiniteGround(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(TEXTURE_REPEATS_PER_CHUNK, TEXTURE_REPEATS_PER_CHUNK);

  const root = new THREE.Group();
  root.name = 'infinite-ground';
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.96 });
  const chunks = new Map();
  let centerChunkX = null;
  let centerChunkZ = null;

  function update(position) {
    const nextCenterX = Math.floor((position.x + CHUNK_SIZE / 2) / CHUNK_SIZE);
    const nextCenterZ = Math.floor((position.z + CHUNK_SIZE / 2) / CHUNK_SIZE);
    if (nextCenterX === centerChunkX && nextCenterZ === centerChunkZ) return;
    centerChunkX = nextCenterX;
    centerChunkZ = nextCenterZ;

    const needed = new Set();
    for (let x = centerChunkX - LOAD_RADIUS; x <= centerChunkX + LOAD_RADIUS; x += 1) {
      for (let z = centerChunkZ - LOAD_RADIUS; z <= centerChunkZ + LOAD_RADIUS; z += 1) {
        const key = `${x}:${z}`;
        needed.add(key);
        if (chunks.has(key)) continue;
        const chunk = new THREE.Mesh(geometry, material);
        chunk.name = `ground-chunk-${key}`;
        chunk.position.set(x * CHUNK_SIZE, 0, z * CHUNK_SIZE);
        chunk.receiveShadow = true;
        chunks.set(key, chunk);
        root.add(chunk);
      }
    }

    for (const [key, chunk] of chunks) {
      if (needed.has(key)) continue;
      root.remove(chunk);
      chunks.delete(key);
    }
  }

  function dispose() {
    root.removeFromParent();
    chunks.clear();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { root, update, dispose };
}
