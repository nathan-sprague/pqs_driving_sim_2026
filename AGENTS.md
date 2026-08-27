# Repository Guidelines

## Project Structure & Module Organization

The application is a Vite-powered browser simulator built with Three.js and `cannon-es`. `index.html` is the entry document and `src/main.js` selects the home, simulator, or map-builder page. Keep page-level rendering in `src/pages/`, data definitions and map loading in `src/config/`, shared styling in `src/styles/main.css`, and scene, physics, tractor, obstacle, and builder logic under `src/world/`.

Static files are served from `public/`. Tractor GLB files belong in `public/assets/models/tractor/`, textures in `public/assets/textures/`, and bundled course JSON in `public/maps/`. Preserve the intentionally spelled `manueverability.json`; configured filenames are documented in `public/maps/README.md`. Treat `dist/`, `.vite/`, and `node_modules/` as generated content. `old_code.js` is legacy reference code, not the current entry point.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies.
- `npm run dev` starts Vite's local development server with hot reload.
- `npm run build` produces a production bundle in `dist/` and catches bundling/import errors.
- `npm run preview` serves the production bundle for a final browser check.

There is currently no automated test, lint, or formatting command. Always run `npm run build` before submitting changes.

## Coding Style & Naming Conventions

Use modern JavaScript ES modules, two-space indentation, semicolons, and single-quoted strings, matching existing files. Use `camelCase` for variables and functions, `PascalCase` only for classes, and descriptive factory names such as `createWorld`. Keep modules focused and place new functionality in the closest existing domain directory. Avoid adding dependencies when a small native browser solution is sufficient.

## Testing Guidelines

Until a test framework is added, validate changes manually through `npm run dev`. Exercise affected routes, map loading, builder save/upload behavior, keyboard and pointer controls, and physics interactions. For asset or map changes, verify both rendering and collision behavior. Include reproducible manual test steps in the pull request.

## Commit & Pull Request Guidelines

Repository history is not available in this checkout, so use concise, imperative commit subjects such as `Add ramp rotation controls`. Keep commits focused. Pull requests should explain the user-visible change, list validation performed, link relevant issues, and include screenshots or short recordings for UI, model, map, or physics changes. Call out new assets, schema changes, or browser-storage compatibility concerns explicitly.
