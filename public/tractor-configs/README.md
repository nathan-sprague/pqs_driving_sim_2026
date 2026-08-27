# Tractor placement files

Each tractor has one JSON placement file. The app discovers every valid JSON
file in this directory when Vite starts or builds.

Open **Place tractor parts** on the home page, select a part, move or rotate it,
choose a model from its asset subfolder, then download the JSON. Copy the downloaded file into this folder, replacing
the file with the same name. Vite will then bundle it and all driving modes will
use the chosen parts and new placements. Positions use meters and rotations use radians.

To add a tractor, use **Build tractor**, download its named JSON file, and put
it here. Restart the development server; the tractor will then appear in
**Configure tractor** and be available to every driving mode.

The current year-based models use `2023_tractor_body.glb` with
`2023_tractor.json`, and `2026_tractor_body.glb` with `2026_tractor.json`.
