export const obstacles = [
  {
    id: 'block',
    type: 'box',
    localPosition: [4.5, 0.13, -1.35],
    size: [1.2, 0.26, 1.2],
    color: 0xc67a34,
  },
  {
    id: 'barrier',
    type: 'box',
    localPosition: [8, 0.75, 0],
    size: [1.5, 1.5, 1.5],
    color: 0x3d4541,
  },
  {
    id: 'ramp',
    type: 'ramp',
    localPosition: [8, 0, 2.1],
    size: [3.4, 0.75, 1.6],
    color: 0x9f5c2d,
  },
];

export function obstacleWorldPosition(obstacle, startPose) {
  const [forward, y, lateral] = obstacle.localPosition;
  const cos = Math.cos(startPose.yaw);
  const sin = Math.sin(startPose.yaw);
  return [
    startPose.position[0] + forward * cos + lateral * sin,
    y,
    startPose.position[2] - forward * sin + lateral * cos,
  ];
}

export function rampGeometry(size) {
  const [length, height, width] = size;
  const halfLength = length / 2;
  const halfWidth = width / 2;

  return {
    vertices: [
      -halfLength, 0, -halfWidth,
      -halfLength, 0, halfWidth,
      0, height, -halfWidth,
      0, height, halfWidth,
      halfLength, 0, -halfWidth,
      halfLength, 0, halfWidth,
    ],
    indices: [
      0, 1, 3, 0, 3, 2,
      2, 3, 5, 2, 5, 4,
      0, 4, 5, 0, 5, 1,
      0, 2, 4,
      1, 5, 3,
    ],
  };
}
