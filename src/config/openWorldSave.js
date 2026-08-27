const STORAGE_KEY = 'quarter-scale-open-world-save';
const SCORE_IDS = ['maneuverability', 'durability', 'pulling'];

export function saveOpenWorld(pose, scores) {
  const save = normalizeSave({ pose, scores });
  if (!save) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function loadOpenWorldSave() {
  try {
    return normalizeSave(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return null;
  }
}

function normalizeSave(value) {
  if (!value || typeof value !== 'object') return null;
  const position = normalizeVector(value.pose?.position, 3);
  const quaternion = normalizeVector(value.pose?.quaternion, 4);
  if (!position || !quaternion) return null;
  const length = Math.hypot(...quaternion);
  if (length < 0.001) return null;
  const scores = Object.fromEntries(SCORE_IDS.flatMap((id) => (
    Number.isFinite(value.scores?.[id]) ? [[id, value.scores[id]]] : []
  )));
  return {
    version: 1,
    savedAt: Number.isFinite(value.savedAt) ? value.savedAt : Date.now(),
    pose: { position, quaternion: quaternion.map((component) => component / length) },
    scores,
  };
}

function normalizeVector(value, length) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) return null;
  return value.map(Number);
}
