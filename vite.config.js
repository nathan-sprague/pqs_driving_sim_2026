import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const root = process.cwd();

export default defineConfig({
  base: '/pqs_driving_sim_2026/',
  plugins: [{
    name: 'tractor-library',
    resolveId(id) { return id === 'virtual:tractor-library' ? `\0${id}` : null; },
    load(id) {
      if (id !== '\0virtual:tractor-library') return null;
      const modelRoot = join(root, 'public/assets/models/tractor');
      const configRoot = join(root, 'public/tractor-configs');
      const assets = readdirSync(modelRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.glb')
        .map((entry) => `/pqs_driving_sim_2026/assets/models/tractor/${relative(modelRoot, join(entry.parentPath, entry.name)).replaceAll('\\', '/')}`)
        .sort();
      const configs = readdirSync(configRoot)
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({
          id: basename(file, '.json'),
          file: `/pqs_driving_sim_2026/tractor-configs/${file}`,
          data: JSON.parse(readFileSync(join(configRoot, file), 'utf8')),
        }))
        .filter(({ data }) => Object.values(data.parts ?? {}).every((part) => typeof part.file === 'string'));
      return `export const tractorAssets=${JSON.stringify(assets)};export const tractorConfigs=${JSON.stringify(configs)};`;
    },
  }],
});
