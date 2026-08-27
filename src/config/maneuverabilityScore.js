export const MANEUVERABILITY_PENALTY_START_SECONDS = 5 * 60;
export const MANEUVERABILITY_TIME_LIMIT_SECONDS = 8 * 60;
export const MANEUVERABILITY_PENALTY_INTERVAL_SECONDS = 15;

export function formatManeuverabilityScore(elapsedSeconds, demarcations = 0) {
  if (elapsedSeconds >= MANEUVERABILITY_TIME_LIMIT_SECONDS) return 'DQ';
  const overtime = Math.max(0, elapsedSeconds - MANEUVERABILITY_PENALTY_START_SECONDS);
  const points = Math.max(0, demarcations)
    + Math.floor(overtime / MANEUVERABILITY_PENALTY_INTERVAL_SECONDS);
  return `${points} ${points === 1 ? 'pt' : 'pts'}`;
}
