import * as THREE from 'three';

export function createGroundLineGeometry(points, thickness, curved) {
  const controls = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const path = curved && controls.length >= 3
    ? new THREE.CatmullRomCurve3(controls).getPoints(Math.max(24, (controls.length - 1) * 16))
    : controls;
  const positions = [];
  const indices = [];

  for (let index = 0; index < path.length; index += 1) {
    const previous = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const length = Math.hypot(tangentX, tangentZ) || 1;
    const offsetX = (-tangentZ / length) * thickness / 2;
    const offsetZ = (tangentX / length) * thickness / 2;
    positions.push(path[index].x + offsetX, 0, path[index].z + offsetZ);
    positions.push(path[index].x - offsetX, 0, path[index].z - offsetZ);
    if (index === 0) continue;
    const start = (index - 1) * 2;
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
