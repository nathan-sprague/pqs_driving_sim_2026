export const MAP_ASSET_BASE_PATH = '/assets/models/map-assets/';

export async function loadMapAssetNames() {
  try {
    const response = await fetch(`${MAP_ASSET_BASE_PATH}assets.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error('Expected an array of filenames.');
    return [...new Set(value.filter(isSafeGlbFilename))];
  } catch (error) {
    console.warn('Unable to load map-builder GLB assets.', error);
    return [];
  }
}

export function mapAssetUrl(filename) {
  return `${MAP_ASSET_BASE_PATH}${encodeURIComponent(filename)}`;
}

function isSafeGlbFilename(value) {
  return typeof value === 'string'
    && /^[a-z0-9 _-]+\.glb$/i.test(value)
    && value.length <= 160;
}
