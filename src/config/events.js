export const events = [
  {
    id: 'pull',
    mapId: 'pulling',
    name: 'Tractor Pull',
    eyebrow: 'Power & traction',
    description: 'Hook to the sled and pull for maximum distance.',
  },
  {
    id: 'maneuver',
    mapId: 'manueverability',
    name: 'Maneuverability',
    eyebrow: 'Precision driving',
    description: 'Navigate a tight technical course with control.',
  },
  {
    id: 'durability',
    mapId: 'durability',
    name: 'Durability',
    eyebrow: 'Endurance test',
    description: 'Take the tractor through the rough-course challenge.',
  },
];

export function eventFromLocation() {
  const eventId = new URLSearchParams(window.location.search).get('event');
  return events.find(({ id }) => id === eventId) ?? null;
}
