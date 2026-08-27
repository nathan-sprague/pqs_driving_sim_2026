import { CUSTOM_TRACTOR_MODEL_ID, DEFAULT_TRACTOR_MODEL_ID, hasCustomTractor, tractorModels } from './tractorModels.js';

const STORAGE_KEY = 'quarter-scale-tractor-config';

export const DEFAULT_TRACTOR_CONFIG = {
  modelId: DEFAULT_TRACTOR_MODEL_ID,
  massLb: 900,
  centerOfMassInches: [16.61, 22.83, 0],
  topSpeedMph: 5,
  powerHp: 34,
  durability: 100,
  idleRpm: 1800,
  maxRpm: 3600,
  transmission: 'automatic',
  gearCount: 3,
  gearRatios: [3, 2, 1],
};

export function loadTractorConfig() {
  try {
    const stored = normalizeTractorConfig(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    const modelSpecs = tractorModels[stored.modelId]?.specs;
    return modelSpecs ? normalizeTractorConfig({ ...stored, ...modelSpecs, modelId: stored.modelId }) : stored;
  } catch {
    return { ...DEFAULT_TRACTOR_CONFIG, centerOfMassInches: [...DEFAULT_TRACTOR_CONFIG.centerOfMassInches] };
  }
}

export function saveTractorConfig(config) {
  const normalized = normalizeTractorConfig(config);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function saveTractorModel(modelId) {
  let stored;
  try {
    stored = normalizeTractorConfig(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    stored = normalizeTractorConfig(null);
  }
  return saveTractorConfig({ ...stored, modelId });
}

export function normalizeTractorConfig(value) {
  const source = value && typeof value === 'object' ? value : DEFAULT_TRACTOR_CONFIG;
  const legacyMassLb = Number(source.mass) * 2.20462;
  const legacyCenterInches = Array.isArray(source.centerOfMass)
    ? source.centerOfMass.map((coordinate) => Number(coordinate) / 0.0254)
    : null;
  const gearCount = Math.round(clamp(source.gearCount, 1, 9, DEFAULT_TRACTOR_CONFIG.gearCount));
  const sourceRatios = Array.isArray(source.gearRatios) ? source.gearRatios : DEFAULT_TRACTOR_CONFIG.gearRatios;
  const gearRatios = Array.from({ length: gearCount }, (_, index) => (
    clamp(sourceRatios[index], 0.1, 20, Math.max(1, gearCount - index))
  ));
  const idleRpm = clamp(source.idleRpm, 300, 5000, DEFAULT_TRACTOR_CONFIG.idleRpm);
  const maxRpm = clamp(source.maxRpm, idleRpm + 100, 10000, DEFAULT_TRACTOR_CONFIG.maxRpm);
  return {
    modelId: tractorModels[source.modelId] || (source.modelId === CUSTOM_TRACTOR_MODEL_ID && hasCustomTractor()) ? source.modelId : DEFAULT_TRACTOR_MODEL_ID,
    massLb: clamp(source.massLb ?? legacyMassLb, 100, 5000, DEFAULT_TRACTOR_CONFIG.massLb),
    centerOfMassInches: DEFAULT_TRACTOR_CONFIG.centerOfMassInches.map((fallback, index) => (
      clamp(source.centerOfMassInches?.[index] ?? legacyCenterInches?.[index], -120, 120, fallback)
    )),
    topSpeedMph: clamp(source.topSpeedMph, 0.5, 30, DEFAULT_TRACTOR_CONFIG.topSpeedMph),
    powerHp: clamp(source.powerHp, 1, 200, DEFAULT_TRACTOR_CONFIG.powerHp),
    durability: clamp(source.durability, 0, 100, DEFAULT_TRACTOR_CONFIG.durability),
    idleRpm,
    maxRpm,
    transmission: source.transmission === 'manual' ? 'manual' : 'automatic',
    gearCount,
    gearRatios,
  };
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
