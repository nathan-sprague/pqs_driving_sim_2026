const STORAGE_KEY = 'quarter-scale-tractor-map';
export const MAX_MAP_OBJECTS = 5000;
export const MAX_MAP_GROUPS = 2500;

export function createEmptyMap() {
  return {
    version: 1,
    name: 'Untitled test map',
    vehicleStart: { position: [0, 0, 0], rotation: [0, 0, 0], yaw: 0 },
    blocks: [],
    groups: [],
  };
}

export function loadSavedMap() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeMap(JSON.parse(saved)) : createEmptyMap();
  } catch (error) {
    console.warn('The saved map was invalid; starting a new map.', error);
    return createEmptyMap();
  }
}

export function saveMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeMap(map)));
}

export function normalizeMap(value) {
  const fallback = createEmptyMap();
  if (!value || typeof value !== 'object') return fallback;
  const start = value.vehicleStart ?? fallback.vehicleStart;

  const blocks = Array.isArray(value.blocks)
    ? value.blocks.slice(0, MAX_MAP_OBJECTS).map((block, index) => {
      const normalized = normalizeBlock(block, index);
      if (normalized && !['chunk', 'threshold', 'line', 'asset', 'waypoint'].includes(normalized.type)) {
        normalized.structuralDamage = Math.min(100, Math.max(0, finite(block.structuralDamage, 0)));
      }
      return normalized;
    }).filter(Boolean)
    : [];
  const objectIds = new Set(blocks.filter((block) => block.type !== 'chunk').map((block) => block.id));
  const claimedIds = new Set();
  const groups = Array.isArray(value.groups) ? value.groups.slice(0, MAX_MAP_GROUPS).map((group, index) => {
    if (!group || typeof group !== 'object') return null;
    const ids = Array.isArray(group.objectIds)
      ? [...new Set(group.objectIds)].filter((id) => objectIds.has(id) && !claimedIds.has(id)).slice(0, MAX_MAP_OBJECTS)
      : [];
    if (ids.length < 2) return null;
    ids.forEach((id) => claimedIds.add(id));
    return {
      id: typeof group.id === 'string' ? group.id : `group-${index}`,
      name: normalizeName(group.name, `Group ${index + 1}`),
      objectIds: ids,
      rotation: vector(group.rotation, [0, 0, 0]),
    };
  }).filter(Boolean) : [];

  return {
    version: 1,
    name: typeof value.name === 'string' ? value.name.slice(0, 80) : fallback.name,
    vehicleStart: {
      position: vector(start.position, fallback.vehicleStart.position),
      rotation: vector(start.rotation, [0, finite(start.yaw, 0), 0]),
      yaw: vector(start.rotation, [0, finite(start.yaw, 0), 0])[1],
    },
    blocks,
    groups,
  };
}

export function createBlock(position = [0, 0.5, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Block',
    type: 'box',
    position: vector(position, [0, 0.5, 0]),
    size: [1, 1, 1],
    rotation: [0, 0, 0],
    color: '#c67a34',
    sign: null,
    invisible: false,
    initiallyActive: true,
    castShadow: true,
    movable: false,
    massKg: 25,
  };
}

export function createWaypoint(position = [0, 1.5, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Waypoint',
    type: 'waypoint',
    position: vector(position, [0, 1.5, 0]),
    rotation: [0, 0, 0],
    initiallyActive: true,
  };
}

export function createNitro(position = [0, 0, 0]) {
  return { id: crypto.randomUUID(), name: 'Nitrous oxide', type: 'nitro', position: vector(position, [0, 0, 0]), rotation: [0, 0, 0] };
}

export function createPost(position = [0, 0, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Maneuverability post',
    type: 'post',
    position: vector(position, [0, 0, 0]),
    rotation: [0, 0, 0],
    color: '#f0c229',
    classification: 'yellow',
  };
}

export function createHuman(position = [0, 0, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Human',
    type: 'human',
    position: vector(position, [0, 0, 0]),
    rotation: [0, 0, 0],
    behavior: 'stand',
    waypoints: [[2, 0, 1]],
    waypointLoop: false,
    flagColor: 'none',
    fleeFromTractor: true,
  };
}

export function createThreshold(position = [0, 1.25, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Threshold',
    type: 'threshold',
    position: vector(position, [0, 1.25, 0]),
    size: [4, 2.5, 0.08],
    rotation: [0, 0, 0],
    thresholdAction: 'maneuver-start',
    initiallyActive: true,
    message: '',
    messageDuration: 3,
    stopDuration: 2,
    objectChanges: [],
    chunkChanges: [],
  };
}

export function createChunkRegion(position = [0, 2.5, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Chunk region',
    type: 'chunk',
    position: vector(position, [0, 2.5, 0]),
    size: [10, 5, 10],
    rotation: [0, 0, 0],
    objectIds: [],
    initiallyLoaded: true,
    editorVisible: true,
  };
}

export function createGroundLine(position = [0, 0.02, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Ground line',
    type: 'line',
    position: vector(position, [0, 0.02, 0]),
    rotation: [0, 0, 0],
    points: [[-2, 0], [2, 0]],
    thickness: 0.1,
    curved: false,
    color: '#ffffff',
  };
}

export function createCart(position = [0, 0, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Cart',
    type: 'cart',
    position: vector(position, [0, 0, 0]),
    rotation: [0, 0, 0],
    color: '#496b3f',
  };
}

export function createCar(position = [0, 0, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Car',
    type: 'car',
    position: vector(position, [0, 0, 0]),
    rotation: [0, 0, 0],
    carBehavior: 'coordinates',
    destinations: [[position[0], position[2] + 12]],
    tractorHitDamage: 20,
    carHitDamage: 10,
    maxSpeedMph: 16,
    acceleration: 3,
  };
}

export function createPullingSled(position = [0, 0, 0]) {
  return {
    id: crypto.randomUUID(),
    name: 'Pulling sled',
    type: 'pulling-sled',
    position: vector(position, [0, 0, 0]),
    rotation: [0, 0, 0],
    color: '#343a32',
  };
}

export function createMapAsset(asset, position = [0, 0, 0]) {
  const label = asset.replace(/\.glb$/i, '').replace(/[-_]+/g, ' ');
  return {
    id: crypto.randomUUID(),
    name: label || 'GLB asset',
    type: 'asset',
    asset,
    position: vector(position, [0, 0, 0]),
    size: [1, 1, 1],
    rotation: [0, 0, 0],
  };
}

export function downloadMap(map) {
  const blob = new Blob([`${JSON.stringify(normalizeMap(map), null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(map.name) || 'tractor-map'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function importMapFile(file) {
  if (!file) throw new Error('Choose a JSON map file.');
  let value;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (!value || !Array.isArray(value.blocks) || !value.vehicleStart) {
    throw new Error('The JSON must contain vehicleStart and a blocks array.');
  }
  return normalizeMap(value);
}

function normalizeBlock(block, index) {
  if (!block || typeof block !== 'object') return null;
  const type = ['post', 'human', 'threshold', 'line', 'cart', 'car', 'pulling-sled', 'chunk', 'asset', 'nitro', 'waypoint'].includes(block.type) ? block.type : 'box';
  if (type === 'waypoint') return {
    id: typeof block.id === 'string' ? block.id : `waypoint-${index}`,
    name: normalizeName(block.name, 'Waypoint'),
    type,
    position: vector(block.position, [0, 1.5, 0]),
    rotation: [0, 0, 0],
    initiallyActive: block.initiallyActive !== false,
  };
  if (type === 'nitro') return {
    id: typeof block.id === 'string' ? block.id : `nitro-${index}`,
    name: normalizeName(block.name, 'Nitrous oxide'),
    type,
    position: vector(block.position, [0, 0, 0]),
    rotation: vector(block.rotation, [0, 0, 0]),
  };
  if (type === 'asset') {
    if (typeof block.asset !== 'string' || !/^[a-z0-9 _-]+\.glb$/i.test(block.asset)) return null;
    return {
      id: typeof block.id === 'string' ? block.id : `asset-${index}`,
      name: normalizeName(block.name, 'GLB asset'),
      type,
      asset: block.asset.slice(0, 160),
      position: vector(block.position, [0, 0, 0]),
      size: vector(block.size, [1, 1, 1]).map((value) => Math.max(0.01, Math.abs(value))),
      rotation: vector(block.rotation, [0, 0, 0]),
    };
  }
  if (type === 'chunk') {
    return {
      id: typeof block.id === 'string' ? block.id : `chunk-${index}`,
      name: normalizeName(block.name, 'Chunk region'),
      type,
      position: vector(block.position, [0, 2.5, 0]),
      size: vector(block.size, [10, 5, 10]).map((value) => Math.max(0.05, Math.abs(value))),
      rotation: vector(block.rotation, [0, 0, 0]),
      objectIds: Array.isArray(block.objectIds)
        ? [...new Set(block.objectIds.filter((id) => typeof id === 'string'))].slice(0, MAX_MAP_OBJECTS)
        : [],
      initiallyLoaded: block.initiallyLoaded !== false,
      editorVisible: block.editorVisible !== false,
    };
  }
  if (type === 'post') {
    return {
      id: typeof block.id === 'string' ? block.id : `post-${index}`,
      name: normalizeName(block.name, 'Maneuverability post'),
      type,
      position: vector(block.position, [0, 0, 0]),
      rotation: vector(block.rotation, [0, 0, 0]),
      color: /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : '#f0c229',
      classification: block.classification === 'red' ? 'red' : 'yellow',
    };
  }
  if (type === 'human') {
    const waypoints = Array.isArray(block.waypoints)
      ? block.waypoints.slice(0, 50).map((waypoint) => [
        finite(waypoint?.[0], 0),
        finite(waypoint?.[1], 0),
        Math.min(60, Math.max(0, finite(waypoint?.[2], 1))),
      ])
      : [];
    return {
      id: typeof block.id === 'string' ? block.id : `human-${index}`,
      name: normalizeName(block.name, 'Human'),
      type,
      position: vector(block.position, [0, 0, 0]),
      rotation: vector(block.rotation, [0, 0, 0]),
      behavior: ['stand', 'sit', 'walk', 'waypoints'].includes(block.behavior) ? block.behavior : 'stand',
      waypoints: waypoints.length ? waypoints : [[2, 0, 1]],
      waypointLoop: Boolean(block.waypointLoop),
      flagColor: ['none', 'green', 'red'].includes(block.flagColor)
        ? block.flagColor
        : block.holdFlag ? 'green' : 'none',
      fleeFromTractor: block.fleeFromTractor !== false,
    };
  }
  if (type === 'threshold') {
    const legacyAction = block.thresholdRole === 'finish' ? 'all-stop' : 'all-start';
    const migratedAction = block.thresholdAction === 'durability-start'
      ? 'lap-pt1'
      : block.thresholdAction === 'durability-stop' ? 'lap-pt2' : block.thresholdAction;
    const allowedActions = [
      'maneuver-start', 'maneuver-stop',
      'lap-pt1', 'lap-pt2', 'durability-disqualify', 'clear-breakdown-smoke',
      'pulling-start', 'pulling-stop',
      'message', 'stop-tractor', 'objects', 'chunks', 'all-start', 'all-stop',
    ];
    return {
      id: typeof block.id === 'string' ? block.id : `threshold-${index}`,
      name: normalizeName(block.name, 'Threshold'),
      type,
      position: vector(block.position, [0, 1.25, 0]),
      size: vector(block.size, [4, 2.5, 0.08]).map((value) => Math.max(0.05, Math.abs(value))),
      rotation: vector(block.rotation, [0, 0, 0]),
      thresholdAction: allowedActions.includes(migratedAction) ? migratedAction : legacyAction,
      initiallyActive: block.initiallyActive !== false,
      message: typeof block.message === 'string' ? block.message.slice(0, 240) : '',
      messageDuration: Math.min(30, Math.max(0.5, finite(block.messageDuration, 3))),
      stopDuration: Math.min(30, Math.max(0.5, finite(block.stopDuration, 2))),
      objectChanges: Array.isArray(block.objectChanges)
        ? block.objectChanges.slice(0, 100).map((change) => ({
          id: typeof change?.id === 'string' ? change.id : '',
          action: change?.action === 'remove' ? 'remove' : 'add',
        })).filter((change) => change.id)
        : [],
      chunkChanges: Array.isArray(block.chunkChanges)
        ? block.chunkChanges.slice(0, 100).map((change) => ({
          id: typeof change?.id === 'string' ? change.id : '',
          action: change?.action === 'unload' ? 'unload' : 'load',
        })).filter((change) => change.id)
        : [],
    };
  }
  if (type === 'line') {
    const points = Array.isArray(block.points)
      ? block.points.slice(0, 100).map((point) => [finite(point?.[0], 0), finite(point?.[1], 0)])
      : [];
    return {
      id: typeof block.id === 'string' ? block.id : `line-${index}`,
      name: normalizeName(block.name, 'Ground line'),
      type,
      position: vector(block.position, [0, 0.02, 0]),
      rotation: vector(block.rotation, [0, 0, 0]),
      points: points.length >= 2 ? points : [[-2, 0], [2, 0]],
      thickness: Math.min(2, Math.max(0.02, finite(block.thickness, 0.1))),
      curved: Boolean(block.curved),
      color: /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : '#ffffff',
    };
  }
  if (type === 'cart') {
    return {
      id: typeof block.id === 'string' ? block.id : `cart-${index}`,
      name: normalizeName(block.name, 'Cart'),
      type,
      position: vector(block.position, [0, 0, 0]),
      rotation: vector(block.rotation, [0, 0, 0]),
      color: /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : '#496b3f',
    };
  }
  if (type === 'car') {
    const destinations = Array.isArray(block.destinations)
      ? block.destinations.slice(0, 50).map((point) => [finite(point?.[0], 0), finite(point?.[1], 0)])
      : [];
    const position = vector(block.position, [0, 0, 0]);
    return {
      id: typeof block.id === 'string' ? block.id : `car-${index}`,
      name: normalizeName(block.name, 'Car'),
      type,
      position,
      rotation: vector(block.rotation, [0, 0, 0]),
      carBehavior: block.carBehavior === 'player' ? 'player' : 'coordinates',
      destinations: destinations.length ? destinations : [[position[0], position[2] + 12]],
      tractorHitDamage: Math.min(100, Math.max(0, finite(block.tractorHitDamage, 20))),
      carHitDamage: Math.min(100, Math.max(0, finite(block.carHitDamage, 10))),
      maxSpeedMph: Math.min(60, Math.max(1, finite(block.maxSpeedMph, 16))),
      acceleration: Math.min(15, Math.max(0.2, finite(block.acceleration, 3))),
    };
  }
  if (type === 'pulling-sled') {
    return {
      id: typeof block.id === 'string' ? block.id : `pulling-sled-${index}`,
      name: normalizeName(block.name, 'Pulling sled'),
      type,
      position: vector(block.position, [0, 0, 0]),
      rotation: vector(block.rotation, [0, 0, 0]),
      color: /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : '#343a32',
    };
  }
  return {
    id: typeof block.id === 'string' ? block.id : `block-${index}`,
    name: normalizeName(block.name, 'Block'),
    type,
    position: vector(block.position, [0, 0.5, 0]),
    size: vector(block.size, [1, 1, 1]).map((value) => Math.max(0.05, Math.abs(value))),
    rotation: vector(block.rotation, [0, 0, 0]),
    color: /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : '#c67a34',
    sign: normalizeSign(block.sign),
    invisible: Boolean(block.invisible),
    initiallyActive: block.initiallyActive !== false,
    castShadow: block.castShadow !== false,
    movable: Boolean(block.movable),
    massKg: Math.min(10000, Math.max(0.1, finite(block.massKg, 25))),
  };
}

function normalizeSign(sign) {
  if (!sign || typeof sign !== 'object') return null;
  const type = ['time', 'distance', 'text'].includes(sign.type) ? sign.type : null;
  if (!type) return null;
  return {
    type,
    text: typeof sign.text === 'string' ? sign.text.slice(0, 120) : '',
  };
}

function normalizeName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, 80) || fallback;
}

function vector(value, fallback) {
  return fallback.map((defaultValue, index) => finite(value?.[index], defaultValue));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
