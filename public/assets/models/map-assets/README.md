# Map-builder GLB assets

Place arbitrary `.glb` files in this folder, then add each filename to
`assets.json`. For example:

```json
[
  "hay-bale.glb",
  "traffic-cone.glb"
]
```

The map builder reads this list when it opens. Filenames may contain letters,
numbers, spaces, hyphens, and underscores. Assets are decorative and do not
create physics collisions.
