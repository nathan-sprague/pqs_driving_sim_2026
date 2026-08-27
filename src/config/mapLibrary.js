import { normalizeMap } from './maps.js';

export const mapLibrary = [
  { id: 'pulling', name: 'Pulling', file: 'pulling.json', description: 'Official tractor-pull course.' },
  { id: 'durability', name: 'Durability', file: 'durability.json', description: 'Rough-course endurance event.' },
  { id: 'manueverability', name: 'Maneuverability', file: 'manueverability.json', description: 'Precision handling course.' },
  { id: 'open_world', name: 'Open World', file: 'open-world.json', description: 'Unstructured driving and testing.' },
  { id: 'demolition_derby', name: 'Demolition Derby', file: 'demolition-derby.json', description: 'Battle other vehicles in the demolition arena.' },
  { id: 'race', name: 'Race', file: 'race.json', description: 'Drive the unofficial racing course.' },
  { id: 'parkour', name: 'Parkour', file: 'parkour.json', description: 'Take on the tractor parkour challenge.' },
];

export const unofficialEvents = mapLibrary.filter(({ id }) => ['demolition_derby', 'race', 'parkour'].includes(id));

export async function loadLibraryMap(id) {
  const entry = mapLibrary.find((candidate) => candidate.id === id);
  if (!entry) throw new Error('Unknown map.');
  const response = await fetch(`/maps/${entry.file}`);
  if (!response.ok) throw new Error(`${entry.file} is not installed yet.`);
  const value = await response.json();
  if (!value || !Array.isArray(value.blocks) || !value.vehicleStart) {
    throw new Error(`${entry.file} does not contain a valid tractor map.`);
  }
  return normalizeMap(value);
}
