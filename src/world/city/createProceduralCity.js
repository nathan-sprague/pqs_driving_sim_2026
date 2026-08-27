import * as THREE from 'three';
import { createHumanVisual } from '../humans/createHumanVisual.js';
import { createMapAssetVisual } from '../assets/createMapAssetVisual.js';

const TILE_SIZE = 40;
const LOAD_RADIUS = 1;
const CITY_BUFFER = 30;
const CAR_VISUAL_SCALE = 0.15;
const CAR_LENGTH = 6.21;
const CAR_HEIGHT = 1.73;
const CAR_WIDTH = 2.73;
const ENVIRONMENT_REGION_SIZE = 5;
const COMPANY_NAMES = [
  "Mike's Fried Chicken",
  'Omega Consulting Solutions',
  'Blue River Accounting',
  'Northstar Robotics',
  'Sunny Side Bakery',
  'Atlas Outdoor Supply',
  'Copper Kettle Cafe',
  'Evergreen Legal Group',
  'Pixel Forge Studios',
  'Summit Family Dental',
];

export function createProceduralCity(blocks, physics) {
  const root = new THREE.Group();
  root.name = 'procedural-city';
  const tiles = new Map();
  const bounds = courseBounds(blocks);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buildingMaterial = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.08 });
  const roadGeometry = new THREE.PlaneGeometry(1, 1);
  roadGeometry.rotateX(-Math.PI / 2);
  const roadMaterial = new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.92 });
  const sidewalkGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: '#aaa9a3', roughness: 0.88 });
  const doorGeometry = new THREE.BoxGeometry(1, 1, 1);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: '#493426', roughness: 0.7, metalness: 0.08 });
  const signGeometry = new THREE.PlaneGeometry(4.8, 1.05);
  const companyMaterials = COMPANY_NAMES.map(createCompanyMaterial);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  const sphereGeometry = new THREE.SphereGeometry(1, 10, 8);
  const pitchedRoofGeometry = createPitchedRoofGeometry();
  const cityMaterials = {
    grass: new THREE.MeshStandardMaterial({ color: '#47733f', roughness: 1 }),
    court: new THREE.MeshStandardMaterial({ color: '#98513f', roughness: 0.92 }),
    tree: new THREE.MeshStandardMaterial({ color: '#356b38', roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#65472f', roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#596168', roughness: 0.55, metalness: 0.45 }),
    dumpster: new THREE.MeshStandardMaterial({ color: '#315b48', roughness: 0.82, metalness: 0.2 }),
    yellow: new THREE.MeshBasicMaterial({ color: '#dfbd38' }),
    water: new THREE.MeshStandardMaterial({ color: '#2389c9', roughness: 0.28, metalness: 0.08 }),
    roof: new THREE.MeshStandardMaterial({ color: '#69463c', roughness: 0.94, side: THREE.DoubleSide }),
    brick: new THREE.MeshStandardMaterial({ color: '#7b4436', roughness: 0.96 }),
    forestFloor: new THREE.MeshStandardMaterial({ color: '#365b2f', roughness: 1 }),
    bush: new THREE.MeshStandardMaterial({ color: '#294f29', roughness: 1 }),
  };

  function update(position, elapsedSeconds, deltaSeconds) {
    const outside = position.x < bounds.minX - CITY_BUFFER || position.x > bounds.maxX + CITY_BUFFER
      || position.z < bounds.minZ - CITY_BUFFER || position.z > bounds.maxZ + CITY_BUFFER;
    if (!outside) {
      clearTiles();
      return;
    }
    const centerX = Math.round(position.x / TILE_SIZE);
    const centerZ = Math.round(position.z / TILE_SIZE);
    const needed = new Set();
    for (let x = centerX - LOAD_RADIUS; x <= centerX + LOAD_RADIUS; x += 1) {
      for (let z = centerZ - LOAD_RADIUS; z <= centerZ + LOAD_RADIUS; z += 1) {
        if (tileOverlapsProtectedBounds(x, z, bounds)) continue;
        const key = `${x}:${z}`;
        needed.add(key);
        if (!tiles.has(key)) addTile(key, x, z, elapsedSeconds, position);
      }
    }
    for (const [key, tile] of tiles) {
      for (const [index] of tile.openRooms) {
        const building = tile.buildings[index];
        if (Math.abs(position.x - building.position[0]) > building.size[0] / 2 + 1
          || Math.abs(position.z - building.position[2]) > building.size[2] / 2 + 1) closeRoom(key, tile, index);
      }
      if (needed.has(key)) continue;
      removeTile(key, tile);
    }
    for (const [key, tile] of tiles) {
      const targets = [];
      for (const person of tile.people) {
        const phase = elapsedSeconds * person.speed + person.phase;
        targets.push(sidewalkPosition(person.centerX, person.centerZ, phase, person.lane));
      }
      const states = physics.updateProceduralCityPedestrians(key, targets);
      tile.people.forEach((person, index) => {
        const state = states[index];
        if (!state) return;
        person.visual.root.position.fromArray(state.position);
        person.visual.root.quaternion.fromArray(state.quaternion);
        person.visual.setState('walk', state.fallen);
        person.visual.update(deltaSeconds);
      });
      for (const room of tile.openRooms.values()) {
        room.userData.people?.forEach((person) => person.update(1 / 60));
      }
      const carTargets = tile.cars.map((car) => carPosition(car, elapsedSeconds, carStreetSpan(car, tiles)));
      const carStates = physics.updateProceduralCityCars(key, carTargets);
      tile.cars.forEach((car, index) => {
        const state = carStates[index];
        if (!state) return;
        car.visual.position.fromArray(state.position);
        car.visual.quaternion.fromArray(state.quaternion);
        car.visual.rotateY(Math.PI / 2);
      });
    }
  }

  function addTile(key, tileX, tileZ, elapsedSeconds, playerPosition) {
    const random = seededRandom(hash(`${tileX}:${tileZ}`));
    const hasVerticalRiver = isRiverLine(tileX, 'vertical');
    const hasHorizontalRiver = isRiverLine(tileZ, 'horizontal');
    const biome = environmentBiome(tileX, tileZ, bounds);
    const forest = biome === 'forest';
    const residential = biome === 'residential';
    const buildings = [];
    const parkLot = !residential && random() < 0.28 ? Math.floor(random() * 4) : -1;
    let lotIndex = 0;
    let parkCenter = null;
    for (const offsetX of [-13, 0, 13]) {
      for (const offsetZ of [-13, 0, 13]) {
        if (offsetX === 0 || offsetZ === 0) continue;
        if (forest) continue;
        if ((hasVerticalRiver && offsetX === 13) || (hasHorizontalRiver && offsetZ === 13)) {
          lotIndex += 1;
          continue;
        }
        const x = tileX * TILE_SIZE + offsetX;
        const z = tileZ * TILE_SIZE + offsetZ;
        if (insideProtectedBounds(x, z, bounds)) continue;
        if (lotIndex === parkLot) {
          parkCenter = [x, z];
          lotIndex += 1;
          continue;
        }
        lotIndex += 1;
        const sizeX = residential ? 11 : 13;
        const sizeZ = residential ? 11 : 13;
        const height = residential ? 3.2 : 6 + random() * 18;
        buildings.push({
          position: [x, height / 2, z],
          size: [sizeX, height, sizeZ],
          color: residential
            ? new THREE.Color().setHSL(0.04 + random() * 0.1, 0.24, 0.55 + random() * 0.18)
            : new THREE.Color().setHSL(0.52 + random() * 0.12, 0.12, 0.32 + random() * 0.28),
          facadeDirection: -Math.sign(offsetZ),
          companyIndex: Math.floor(random() * COMPANY_NAMES.length),
          kind: residential ? 'house' : 'commercial',
        });
      }
    }
    const carDefinitions = forest ? [] : ['x', 'z'].flatMap((axis) => [-1, 1].map((direction) => ({
      position: axis === 'x'
        ? [tileX * TILE_SIZE, CAR_HEIGHT / 2, tileZ * TILE_SIZE + direction * 1.7]
        : [tileX * TILE_SIZE - direction * 1.7, CAR_HEIGHT / 2, tileZ * TILE_SIZE],
      // The model's long axis is rotated 90 degrees relative to the physics yaw.
      size: [CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH],
      direction,
      laneOffset: direction * 1.7,
      speed: 4 + random() * 3,
      phase: random() * TILE_SIZE,
      spawnedAt: elapsedSeconds,
      axis,
    }))).filter(() => random() > 0.15);
    const mesh = new THREE.InstancedMesh(boxGeometry, buildingMaterial, buildings.length);
    const matrix = new THREE.Matrix4();
    const buildingMatrices = [];
    buildings.forEach((building, index) => {
      matrix.compose(new THREE.Vector3(...building.position), new THREE.Quaternion(), new THREE.Vector3(...building.size));
      mesh.setMatrixAt(index, matrix);
      buildingMatrices.push(matrix.clone());
      mesh.setColorAt(index, building.color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    const doors = new THREE.InstancedMesh(doorGeometry, doorMaterial, buildings.length);
    const doorMatrices = [];
    const signs = [];
    buildings.forEach((building, index) => {
      const [x, , z] = building.position;
      const facadeZ = z + building.facadeDirection * (building.size[2] / 2 + 0.07);
      const yaw = building.facadeDirection > 0 ? 0 : Math.PI;
      matrix.compose(
        new THREE.Vector3(x, 1.05, facadeZ),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        new THREE.Vector3(1.2, 2.1, 0.15),
      );
      doors.setMatrixAt(index, matrix);
      doorMatrices.push(matrix.clone());
      if (building.kind !== 'house') {
        const sign = new THREE.Mesh(signGeometry, companyMaterials[building.companyIndex]);
        sign.position.set(x, 3.05, z + building.facadeDirection * (building.size[2] / 2 + 0.16));
        sign.rotation.y = yaw;
        root.add(sign);
        signs.push(sign);
      }
    });
    doors.castShadow = true;
    root.add(doors);
    const decorations = [];
    const collisionProps = [];
    const addDecoration = (geometry, material, position, scale) => {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(...position);
      object.scale.set(...scale);
      object.castShadow = true;
      object.receiveShadow = true;
      root.add(object);
      decorations.push(object);
      return object;
    };
    buildings.forEach((building, index) => {
      const [x, , z] = building.position;
      const roofY = building.size[1];
      if (building.kind === 'house') {
        addDecoration(pitchedRoofGeometry, cityMaterials.roof, [x, roofY + 1.1, z], [building.size[0] + 0.8, 2.2, building.size[2] + 0.8]);
        const chimneyX = x + (index % 2 === 0 ? -2.8 : 2.8);
        addDecoration(boxGeometry, cityMaterials.brick, [chimneyX, roofY + 1.45, z + 1.8], [0.8, 2.1, 0.8]);
        return;
      }
      const hvac = { position: [x - 2.5, roofY + 0.45, z], size: [2.2, 0.9, 1.6] };
      addDecoration(boxGeometry, cityMaterials.metal, hvac.position, hvac.size);
      collisionProps.push(hvac);
      if ((index + tileX + tileZ) % 2 === 0) {
        addDecoration(cylinderGeometry, cityMaterials.metal, [x + 2.8, roofY + 0.9, z + 1.8], [0.8, 1.8, 0.8]);
        collisionProps.push({ position: [x + 2.8, roofY + 0.9, z + 1.8], size: [1.6, 1.8, 1.6] });
      }
      const dumpster = { position: [x + Math.sign(x - tileX * TILE_SIZE) * 5.5, 0.55, z - building.facadeDirection * 5.5], size: [1.8, 1.1, 1.2] };
      addDecoration(boxGeometry, cityMaterials.dumpster, dumpster.position, dumpster.size);
      collisionProps.push(dumpster);
    });
    if (!forest) {
      for (const [lightX, lightZ] of [[-7, -5.8], [7, -5.8], [-5.8, 7], [-5.8, -7]]) {
        const x = tileX * TILE_SIZE + lightX;
        const z = tileZ * TILE_SIZE + lightZ;
        addDecoration(cylinderGeometry, cityMaterials.metal, [x, 2.4, z], [0.07, 4.8, 0.07]);
        addDecoration(sphereGeometry, cityMaterials.yellow, [x, 4.85, z], [0.18, 0.18, 0.18]);
        collisionProps.push({ position: [x, 2.4, z], size: [0.18, 4.8, 0.18] });
      }
    }
    if (parkCenter) {
      const [x, z] = parkCenter;
      addDecoration(boxGeometry, cityMaterials.grass, [x, 0.04, z], [13, 0.08, 13]);
      addDecoration(boxGeometry, cityMaterials.court, [x, 0.09, z], [8, 0.06, 5.5]);
      for (const [treeX, treeZ] of [[-4.8, -4.8], [4.8, 4.8], [-4.8, 4.8]]) {
        addDecoration(cylinderGeometry, cityMaterials.trunk, [x + treeX, 1.25, z + treeZ], [0.22, 2.5, 0.22]);
        addDecoration(sphereGeometry, cityMaterials.tree, [x + treeX, 3.1, z + treeZ], [1.25, 1.45, 1.25]);
        collisionProps.push({ position: [x + treeX, 1.25, z + treeZ], size: [0.5, 2.5, 0.5] });
      }
      for (const side of [-1, 1]) {
        const bench = { position: [x + side * 4.6, 0.45, z], size: [0.55, 0.9, 2.4] };
        addDecoration(boxGeometry, doorMaterial, bench.position, bench.size);
        collisionProps.push(bench);
      }
      for (const side of [-1, 1]) {
        addDecoration(cylinderGeometry, cityMaterials.metal, [x + side * 4.2, 1.5, z], [0.06, 3, 0.06]);
        addDecoration(boxGeometry, cityMaterials.metal, [x + side * 4.2, 2.8, z], [0.12, 0.9, 1.4]);
      }
    }
    if (forest) {
      for (let index = 0; index < 30; index += 1) {
        const x = tileX * TILE_SIZE - TILE_SIZE / 2 + 2 + random() * (TILE_SIZE - 4);
        const z = tileZ * TILE_SIZE - TILE_SIZE / 2 + 2 + random() * (TILE_SIZE - 4);
        if (random() < 0.72) {
          const height = 3.8 + random() * 6.5;
          const trunkWidth = 0.25 + random() * 0.28;
          const canopyWidth = 1.8 + random() * 2.5;
          addDecoration(cylinderGeometry, cityMaterials.trunk, [x, height * 0.42, z], [trunkWidth, height * 0.84, trunkWidth]);
          addDecoration(sphereGeometry, cityMaterials.tree, [x, height * 0.82, z], [canopyWidth, height * 0.38, canopyWidth]);
          collisionProps.push({ position: [x, height * 0.42, z], size: [trunkWidth * 2, height * 0.84, trunkWidth * 2] });
        } else {
          const width = 0.8 + random() * 1.8;
          const height = 0.55 + random() * 1.25;
          addDecoration(sphereGeometry, cityMaterials.bush, [x, height / 2, z], [width, height, width * (0.75 + random() * 0.4)]);
        }
      }
    }
    const roads = forest ? [] : [
      createSurface(roadGeometry, roadMaterial, [tileX * TILE_SIZE, 0.008, tileZ * TILE_SIZE], [TILE_SIZE, 1, 8]),
      createSurface(roadGeometry, roadMaterial, [tileX * TILE_SIZE, 0.009, tileZ * TILE_SIZE], [8, 1, TILE_SIZE]),
    ];
    const markings = forest ? [] : [-14, -6, 6, 14].flatMap((offset) => [
      createSurface(roadGeometry, cityMaterials.yellow, [tileX * TILE_SIZE + offset, 0.018, tileZ * TILE_SIZE], [3.5, 1, 0.12]),
      createSurface(roadGeometry, cityMaterials.yellow, [tileX * TILE_SIZE, 0.019, tileZ * TILE_SIZE + offset], [0.12, 1, 3.5]),
    ]);
    const sidewalks = forest ? [] : [
      ...[-5.25, 5.25].flatMap((z) => [-12, 12].map((x) => createSurface(sidewalkGeometry, sidewalkMaterial, [tileX * TILE_SIZE + x, 0.09, tileZ * TILE_SIZE + z], [16, 0.18, 2.5]))),
      ...[-5.25, 5.25].flatMap((x) => [-12, 12].map((z) => createSurface(sidewalkGeometry, sidewalkMaterial, [tileX * TILE_SIZE + x, 0.09, tileZ * TILE_SIZE + z], [2.5, 0.18, 16]))),
    ];
    const rivers = [];
    const bridges = [];
    const terrain = forest
      ? [createSurface(roadGeometry, cityMaterials.forestFloor, [tileX * TILE_SIZE, 0.007, tileZ * TILE_SIZE], [TILE_SIZE + 0.2, 1, TILE_SIZE + 0.2])]
      : [];
    if (!forest && hasVerticalRiver) {
      rivers.push(createSurface(roadGeometry, cityMaterials.water, [tileX * TILE_SIZE + 13, 0.014, tileZ * TILE_SIZE], [10, 1, TILE_SIZE + 0.2]));
      bridges.push(createSurface(roadGeometry, roadMaterial, [tileX * TILE_SIZE + 13, 0.032, tileZ * TILE_SIZE], [14, 1, 12]));
    }
    if (!forest && hasHorizontalRiver) {
      rivers.push(createSurface(roadGeometry, cityMaterials.water, [tileX * TILE_SIZE, 0.015, tileZ * TILE_SIZE + 13], [TILE_SIZE + 0.2, 1, 10]));
      bridges.push(createSurface(roadGeometry, roadMaterial, [tileX * TILE_SIZE, 0.033, tileZ * TILE_SIZE + 13], [12, 1, 14]));
    }
    [...terrain, ...roads, ...sidewalks, ...markings, ...rivers, ...bridges].forEach((surface) => root.add(surface));
    const people = Array.from({ length: forest ? 0 : 3 }, (_, index) => {
      const visual = createHumanVisual({ id: `city-${key}-${index}`, behavior: 'walk', flagColor: 'none' });
      root.add(visual.root);
      return {
        visual,
        centerX: tileX * TILE_SIZE,
        centerZ: tileZ * TILE_SIZE,
        lane: (index + Math.floor(random() * 8)) % 8,
        speed: 0.9 + random() * 0.4,
        phase: index * 12 + random() * 4,
      };
    });
    const cars = carDefinitions.map((definition, index) => {
      const car = createMapAssetVisual({ id: `city-car-${key}-${index}`, asset: 'car.glb' });
      car.scale.setScalar(CAR_VISUAL_SCALE);
      root.add(car);
      return { visual: car, ...definition, tileX, tileZ, centerX: tileX * TILE_SIZE, centerZ: tileZ * TILE_SIZE };
    });
    tiles.set(key, { tileX, tileZ, mesh, doors, signs, terrain, roads, sidewalks, markings, rivers, bridges, decorations, people, cars, buildings, buildingMatrices, doorMatrices, openRooms: new Map() });
    physics.addProceduralCityTile(key, buildings, people.map((person) => sidewalkPosition(person.centerX, person.centerZ, person.phase, person.lane)), carDefinitions, collisionProps);
  }

  function removeTile(key, tile) {
    for (const room of tile.openRooms.values()) {
      root.remove(room);
      disposeRoom(room);
    }
    root.remove(tile.mesh);
    root.remove(tile.doors);
    tile.signs.forEach((sign) => root.remove(sign));
    [...tile.terrain, ...tile.roads, ...tile.sidewalks, ...tile.markings, ...tile.rivers, ...tile.bridges, ...tile.decorations].forEach((object) => root.remove(object));
    tile.cars.forEach((car) => root.remove(car.visual));
    tile.people.forEach((person) => root.remove(person.visual.root));
    physics.removeProceduralCityTile(key);
    tiles.delete(key);
  }

  function clearTiles() {
    for (const [key, tile] of [...tiles]) removeTile(key, tile);
  }

  function tryOpenDoor(position) {
    let nearest = null;
    for (const [key, tile] of tiles) tile.buildings.forEach((building, index) => {
      if (tile.openRooms.has(index)) return;
      const doorZ = building.position[2] + building.facadeDirection * (building.size[2] / 2 + 0.2);
      const distance = Math.hypot(position.x - building.position[0], position.z - doorZ);
      if (distance < 3.5 && (!nearest || distance < nearest.distance)) nearest = { key, tile, index, building, distance };
    });
    if (!nearest) return false;
    const walls = createRoomContents(nearest.building);
    const room = new THREE.Group();
    walls.forEach((wall) => {
      const mesh = new THREE.Mesh(boxGeometry, new THREE.MeshStandardMaterial({ color: wall.color ?? '#d8d1bd', roughness: 0.9 }));
      mesh.position.set(...wall.position);
      mesh.scale.set(...wall.size);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.roomSurface = true;
      room.add(mesh);
    });
    const roomPeople = [-2.2, 2.2].map((offset, index) => {
      const visual = createHumanVisual({ id: `room-${nearest.key}-${nearest.index}-${index}`, behavior: 'stand', flagColor: 'none' });
      visual.root.position.set(nearest.building.position[0] + offset, 0.2, nearest.building.position[2]);
      visual.root.rotation.y = index ? Math.PI : 0;
      room.add(visual.root);
      return visual;
    });
    room.userData.people = roomPeople;
    const light = new THREE.PointLight(0xffe7bd, 16, 18);
    light.position.set(nearest.building.position[0], 3.2, nearest.building.position[2]);
    room.add(light);
    root.add(room);
    nearest.tile.openRooms.set(nearest.index, room);
    nearest.tile.mesh.setMatrixAt(nearest.index, new THREE.Matrix4().makeScale(0, 0, 0));
    nearest.tile.mesh.instanceMatrix.needsUpdate = true;
    nearest.tile.doors.setMatrixAt(nearest.index, new THREE.Matrix4().makeScale(0, 0, 0));
    nearest.tile.doors.instanceMatrix.needsUpdate = true;
    physics.openProceduralCityRoom(nearest.key, nearest.index, walls);
    return true;
  }

  function closeRoom(key, tile, index) {
    const room = tile.openRooms.get(index);
    if (!room) return;
    root.remove(room);
    disposeRoom(room);
    tile.openRooms.delete(index);
    tile.mesh.setMatrixAt(index, tile.buildingMatrices[index]);
    tile.mesh.instanceMatrix.needsUpdate = true;
    tile.doors.setMatrixAt(index, tile.doorMatrices[index]);
    tile.doors.instanceMatrix.needsUpdate = true;
    physics.closeProceduralCityRoom(key, index);
  }

  function dispose() {
    clearTiles();
    root.removeFromParent();
    boxGeometry.dispose();
    buildingMaterial.dispose();
    roadGeometry.dispose();
    roadMaterial.dispose();
    sidewalkGeometry.dispose();
    sidewalkMaterial.dispose();
    doorGeometry.dispose();
    doorMaterial.dispose();
    signGeometry.dispose();
    cylinderGeometry.dispose();
    sphereGeometry.dispose();
    pitchedRoofGeometry.dispose();
    Object.values(cityMaterials).forEach((material) => material.dispose());
    companyMaterials.forEach((material) => {
      material.map.dispose();
      material.dispose();
    });
  }

  return { root, update, tryOpenDoor, dispose };
}

function createRoomContents(building) {
  const [x, , z] = building.position;
  const [sizeX, height, sizeZ] = building.size;
  const floorCount = Math.max(2, Math.floor(height / 3));
  const floorHeight = height / floorCount;
  const frontZ = z + building.facadeDirection * (sizeZ / 2);
  const backZ = z - building.facadeDirection * (sizeZ / 2);
  const contents = [
    { position: [x, 0.1, z], size: [sizeX, 0.2, sizeZ] },
    { position: [x, height / 2, backZ], size: [sizeX, height, 0.2] },
    { position: [x - sizeX / 2, height / 2, z], size: [0.2, height, sizeZ] },
    { position: [x + sizeX / 2, height / 2, z], size: [0.2, height, sizeZ] },
    { position: [x - (sizeX + 1.4) / 4, height / 2, frontZ], size: [(sizeX - 1.4) / 2, height, 0.2] },
    { position: [x + (sizeX + 1.4) / 4, height / 2, frontZ], size: [(sizeX - 1.4) / 2, height, 0.2] },
    { position: [x, (height + 2.1) / 2, frontZ], size: [1.4, height - 2.1, 0.2] },
    { position: [x, 0.75, z], size: [3.2, 1.5, 1.2], color: '#79563b' },
    { position: [x - 4.8, 1.1, backZ + building.facadeDirection * 0.6], size: [2.4, 2.2, 0.7], color: '#5b4938' },
    { position: [x + 4.2, 0.45, z + 2], size: [1.4, 0.9, 1.4], color: '#8b6b4c' },
  ];
  if (building.kind === 'house') {
    contents.push(
      { position: [x - 2.5, 0.5, z + 2.4], size: [2.2, 1, 0.9], color: '#506b78' },
      { position: [x + 2.8, 0.9, z - 2.8], size: [2.6, 1.8, 0.8], color: '#9b8b75' },
    );
    return contents;
  }
  for (let level = 1; level <= floorCount; level += 1) {
    const floorY = level * floorHeight;
    const stairLocalX = level % 2 === 1 ? 4 : -4;
    addFloorAroundStairwell(contents, x, floorY, z, sizeX, sizeZ, stairLocalX, level === floorCount ? '#777d82' : '#c6c0ae');
    const baseY = (level - 1) * floorHeight;
    const reverse = level % 2 === 0;
    const stepCount = 8;
    for (let step = 0; step < stepCount; step += 1) {
      const stepTop = floorHeight * (step + 1) / stepCount;
      const progress = (step + 0.5) / stepCount;
      const localZ = (reverse ? 1 - progress : progress) * 4 - 2;
      contents.push({
        position: [x + stairLocalX, baseY + stepTop / 2, z + localZ],
        size: [2.2, stepTop, 4 / stepCount + 0.05],
        color: '#8f8b82',
      });
    }
  }
  // Low parapets make the generated roof usable without closing its stairwell.
  contents.push(
    { position: [x - sizeX / 2, height + 0.55, z], size: [0.25, 1.1, sizeZ], color: '#676d72' },
    { position: [x + sizeX / 2, height + 0.55, z], size: [0.25, 1.1, sizeZ], color: '#676d72' },
    { position: [x, height + 0.55, z - sizeZ / 2], size: [sizeX, 1.1, 0.25], color: '#676d72' },
    { position: [x, height + 0.55, z + sizeZ / 2], size: [sizeX, 1.1, 0.25], color: '#676d72' },
  );
  return contents;
}

function addFloorAroundStairwell(contents, x, y, z, sizeX, sizeZ, stairLocalX, color) {
  const openingMinX = stairLocalX - 1.5;
  const openingMaxX = stairLocalX + 1.5;
  const openingHalfZ = 2.5;
  const leftEdge = -sizeX / 2;
  const rightEdge = sizeX / 2;
  const leftWidth = openingMinX - leftEdge;
  const rightWidth = rightEdge - openingMaxX;
  contents.push(
    { position: [x + leftEdge + leftWidth / 2, y, z], size: [leftWidth, 0.2, sizeZ], color },
    { position: [x + openingMaxX + rightWidth / 2, y, z], size: [rightWidth, 0.2, sizeZ], color },
    { position: [x + stairLocalX, y, z - (sizeZ / 2 + openingHalfZ) / 2], size: [3, 0.2, sizeZ / 2 - openingHalfZ], color },
    { position: [x + stairLocalX, y, z + (sizeZ / 2 + openingHalfZ) / 2], size: [3, 0.2, sizeZ / 2 - openingHalfZ], color },
  );
}

function disposeRoom(room) {
  room.traverse((object) => { if (object.userData.roomSurface) object.material.dispose(); });
}

function createCompanyMaterial(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f0dfb8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#20231d';
  context.font = 'bold 34px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 28);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture });
}

function createSurface(geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.receiveShadow = true;
  return mesh;
}

function createPitchedRoofGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, 0.5, 0,
    -0.5, -0.5, -0.5,  0.5, 0.5, 0,       -0.5, 0.5, 0,
    -0.5, 0.5, 0,        0.5, 0.5, 0,        0.5, -0.5, 0.5,
    -0.5, 0.5, 0,        0.5, -0.5, 0.5,    -0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, 0.5, 0,       -0.5, -0.5, 0.5,
     0.5, -0.5, -0.5,  0.5, -0.5, 0.5,     0.5, 0.5, 0,
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5,     0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5,  0.5, -0.5, 0.5,     0.5, -0.5, -0.5,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

function sidewalkPosition(centerX, centerZ, phase, lane) {
  const innerEdge = 5.25;
  const outerEdge = TILE_SIZE - innerEdge;
  const sideLength = outerEdge - innerEdge;
  const perimeter = sideLength * 4;
  const block = lane % 4;
  const xSign = block % 2 === 0 ? -1 : 1;
  const zSign = block < 2 ? -1 : 1;
  const direction = lane >= 4 ? -1 : 1;
  const directedPhase = phase * direction;
  const distance = ((directedPhase % perimeter) + perimeter) % perimeter;

  const corners = [
    [innerEdge, innerEdge],
    [outerEdge, innerEdge],
    [outerEdge, outerEdge],
    [innerEdge, outerEdge],
  ];
  const segment = Math.min(3, Math.floor(distance / sideLength));
  const progress = (distance - segment * sideLength) / sideLength;
  const start = corners[segment];
  const end = corners[(segment + 1) % corners.length];
  const localX = start[0] + (end[0] - start[0]) * progress;
  const localZ = start[1] + (end[1] - start[1]) * progress;
  const movementX = (end[0] - start[0]) * xSign * direction;
  const movementZ = (end[1] - start[1]) * zSign * direction;
  return {
    position: [centerX + localX * xSign, 0.18, centerZ + localZ * zSign],
    yaw: Math.atan2(-movementX, -movementZ) + Math.PI,
  };
}

function carPosition(car, elapsedSeconds, span) {
  const distance = car.phase - TILE_SIZE / 2 + (elapsedSeconds - car.spawnedAt) * car.speed * car.direction;
  const horizontal = car.axis === 'x';
  const center = horizontal ? car.centerX : car.centerZ;
  const wrappedOffset = wrap(distance + center, span.min, span.max) - center;
  return {
    position: horizontal
      ? [car.centerX + wrappedOffset, CAR_HEIGHT / 2, car.centerZ + car.laneOffset]
      : [car.centerX - car.laneOffset, CAR_HEIGHT / 2, car.centerZ + wrappedOffset],
    yaw: horizontal
      ? car.direction > 0 ? Math.PI / 2 : -Math.PI / 2
      : car.direction > 0 ? 0 : Math.PI,
    velocity: horizontal ? [car.speed * car.direction, 0, 0] : [0, 0, car.speed * car.direction],
  };
}

function carStreetSpan(car, tiles) {
  const coordinates = [...tiles.values()]
    .filter((tile) => car.axis === 'x' ? tile.tileZ === car.tileZ : tile.tileX === car.tileX)
    .map((tile) => (car.axis === 'x' ? tile.tileX : tile.tileZ) * TILE_SIZE);
  const center = car.axis === 'x' ? car.centerX : car.centerZ;
  return coordinates.length
    ? { min: Math.min(...coordinates) - TILE_SIZE / 2, max: Math.max(...coordinates) + TILE_SIZE / 2 }
    : { min: center - TILE_SIZE / 2, max: center + TILE_SIZE / 2 };
}

function wrap(value, min, max) {
  const length = max - min;
  return min + (((value - min) % length) + length) % length;
}

function isRiverLine(index, direction) {
  return hash(`river:${direction}:${index}`) % 17 === 0;
}

function environmentBiome(tileX, tileZ, bounds) {
  const regionX = Math.floor(tileX / ENVIRONMENT_REGION_SIZE);
  const regionZ = Math.floor(tileZ / ENVIRONMENT_REGION_SIZE);
  const minTileX = regionX * ENVIRONMENT_REGION_SIZE;
  const minTileZ = regionZ * ENVIRONMENT_REGION_SIZE;
  const regionMinX = minTileX * TILE_SIZE - TILE_SIZE / 2;
  const regionMaxX = (minTileX + ENVIRONMENT_REGION_SIZE - 1) * TILE_SIZE + TILE_SIZE / 2;
  const regionMinZ = minTileZ * TILE_SIZE - TILE_SIZE / 2;
  const regionMaxZ = (minTileZ + ENVIRONMENT_REGION_SIZE - 1) * TILE_SIZE + TILE_SIZE / 2;
  const protectedMinX = bounds.minX - CITY_BUFFER;
  const protectedMaxX = bounds.maxX + CITY_BUFFER;
  const protectedMinZ = bounds.minZ - CITY_BUFFER;
  const protectedMaxZ = bounds.maxZ + CITY_BUFFER;
  const distanceX = Math.max(protectedMinX - regionMaxX, regionMinX - protectedMaxX, 0);
  const distanceZ = Math.max(protectedMinZ - regionMaxZ, regionMinZ - protectedMaxZ, 0);
  if (Math.hypot(distanceX, distanceZ) < TILE_SIZE * 4) return 'city';

  const selection = hash(`environment:${regionX}:${regionZ}`) % 10;
  if (selection < 3) return 'residential';
  if (selection < 6) return 'forest';
  return 'city';
}

function courseBounds(blocks) {
  const courseBlocks = blocks.filter((block) => !['chunk', 'threshold'].includes(block.type));
  if (!courseBlocks.length) return { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  return courseBlocks.reduce((bounds, block) => {
    const halfX = (block.size?.[0] ?? 1) / 2;
    const halfZ = (block.size?.[2] ?? 1) / 2;
    bounds.minX = Math.min(bounds.minX, block.position[0] - halfX);
    bounds.maxX = Math.max(bounds.maxX, block.position[0] + halfX);
    bounds.minZ = Math.min(bounds.minZ, block.position[2] - halfZ);
    bounds.maxZ = Math.max(bounds.maxZ, block.position[2] + halfZ);
    return bounds;
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

function insideProtectedBounds(x, z, bounds) {
  return x >= bounds.minX - CITY_BUFFER && x <= bounds.maxX + CITY_BUFFER
    && z >= bounds.minZ - CITY_BUFFER && z <= bounds.maxZ + CITY_BUFFER;
}

function tileOverlapsProtectedBounds(tileX, tileZ, bounds) {
  const halfTile = TILE_SIZE / 2;
  const centerX = tileX * TILE_SIZE;
  const centerZ = tileZ * TILE_SIZE;
  return centerX + halfTile >= bounds.minX - CITY_BUFFER
    && centerX - halfTile <= bounds.maxX + CITY_BUFFER
    && centerZ + halfTile >= bounds.minZ - CITY_BUFFER
    && centerZ - halfTile <= bounds.maxZ + CITY_BUFFER;
}

function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ state >>> 15, 1 | state);
    state ^= state + Math.imul(state ^ state >>> 7, 61 | state);
    return ((state ^ state >>> 14) >>> 0) / 4294967296;
  };
}
