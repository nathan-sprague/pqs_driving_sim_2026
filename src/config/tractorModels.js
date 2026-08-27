import { tractorAssets, tractorConfigs } from 'virtual:tractor-library';
import { publicUrl } from './publicUrl.js';

export const tractorAssetFolders = tractorAssets.reduce((folders, file) => {
  const folder = file.split('/').at(-2);
  (folders[folder] ??= []).push(file);
  return folders;
}, {});
export const DEFAULT_TRACTOR_MODEL_ID = tractorConfigs.find((entry) => entry.id === 'tractor-2026')?.id ?? tractorConfigs[0]?.id;
export const CUSTOM_TRACTOR_MODEL_ID = 'custom-cad-tractor';
export const CUSTOM_TRACTOR_STORAGE_KEY = 'quarter-scale-custom-tractor';

export const tractorModels = Object.fromEntries(tractorConfigs.map(({ id, file, data }) => [id, {
  name: (data.name ?? id).replaceAll(/[-_]/g, ' '),
  specs: data.specs ?? null,
  placementFile: file,
  placement: data,
  parts: Object.fromEntries(Object.entries(data.parts ?? {}).flatMap(([partId, placement]) => (
    placement.file ? [[partId, definition(placement.file)]] : []
  ))),
}]));

export function getTractorModel(modelId = DEFAULT_TRACTOR_MODEL_ID) {
  if (modelId === CUSTOM_TRACTOR_MODEL_ID) {
    try {
      const placement = JSON.parse(localStorage.getItem(CUSTOM_TRACTOR_STORAGE_KEY));
      if (placement?.parts) return {
        name: placement.name ?? 'My custom tractor',
        placement,
        parts: Object.fromEntries(Object.entries(placement.parts).map(([id, part]) => [id, part.file ? definition(part.file) : { procedural: part.procedural }])),
      };
    } catch { /* Fall through to the library default. */ }
  }
  return tractorModels[modelId] ?? tractorModels[DEFAULT_TRACTOR_MODEL_ID];
}

export function hasCustomTractor() {
  try { return Boolean(JSON.parse(localStorage.getItem(CUSTOM_TRACTOR_STORAGE_KEY))?.parts); } catch { return false; }
}

export function definition(file) {
  const folder = file?.split('/').at(-2) ?? 'other';
  const resolvedFile = file ? publicUrl(file.replace(import.meta.env.BASE_URL, '')) : file;
  return {
    folder,
    files: tractorAssetFolders[folder] ?? (resolvedFile ? [resolvedFile] : []),
    defaultFile: resolvedFile,
    role: folder === 'front_wheel' ? 'steering' : folder === 'rear_wheel' ? 'drive-wheel' : null,
  };
}
