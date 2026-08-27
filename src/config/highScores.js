const STORAGE_KEY = 'quarter-scale-high-scores';

export const highScoreEvents = [
  { id: 'maneuverability', name: 'Maneuverability' },
  { id: 'durability', name: 'Durability' },
  { id: 'pulling', name: 'Tractor Pull' },
];

export function loadHighScores() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== 'object') return {};
    return Object.fromEntries(highScoreEvents.flatMap(({ id }) => (
      Number.isFinite(stored[id]) ? [[id, stored[id]]] : []
    )));
  } catch {
    return {};
  }
}

export function saveHighScore(eventId, score) {
  if (!highScoreEvents.some((event) => event.id === eventId) || !Number.isFinite(score)) return false;
  const scores = loadHighScores();
  if (Number.isFinite(scores[eventId]) && score <= scores[eventId]) return false;
  scores[eventId] = score;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    return false;
  }
  return true;
}

export function formatHighScore(score) {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
