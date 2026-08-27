# Bundled maps

Place the four exported map-builder JSON files in this directory with these
exact names:

```text
pulling.json
durability.json
manueverability.json
open-world.json
```

They are exposed on the simulator home page automatically. The
`manueverability.json` spelling intentionally matches the configured filename.
Each file must contain a `vehicleStart` object and `blocks` array in the map
builder's version 1 JSON format.

`vehicleStart.position` and `vehicleStart.rotation` are XYZ vectors in metres
and radians. Legacy maps containing only `vehicleStart.yaw` remain supported;
the yaw value is used as the Y rotation.

Box blocks may set `castShadow` to `false` to skip rendering their shadows. The
property defaults to `true` for compatibility with existing maps and can be
changed with the **Cast shadow** checkbox in the map builder.

The optional top-level `groups` array stores editor-only object groupings. Each
entry has an `id`, `name`, `objectIds` array, and editor `rotation` vector. An
object can belong to only one group; grouping does not change simulator
rendering or physics.

Box entries may include a `sign` object with a `type` of `time`, `distance`,
or `text`. Maneuverability scoring is displayed on the simulator HUD. Custom
signs store their label in `sign.text`; omit `sign` or use
`null` for a box without a sign.
Boxes are static by default. Set `movable: true` to make a box a dynamic
physics object and use `massKg` to control its mass and the force required to
move it.

Nitrous bottles use `type: "nitro"` with `position` and `rotation`. They are
movable pickup objects. Dropping one onto the tractor installs it and enables
the nitro HUD, three times normal engine power, and three times normal top speed.

Human entries use `type: "human"`, a ground-level `position`, a `rotation`
vector, and a `behavior` of `stand`, `sit`, `walk`, or `waypoints`. Waypoint
routes store local `[x, z, waitSeconds]` entries in `waypoints` and use
`waypointLoop`; `flagColor` can be `none`, `green`, or `red` and enables the
articulated flag pose.
Humans use `fleeFromTractor` to enable or disable proximity avoidance; waypoint
routes always ignore proximity avoidance.

Maneuverability posts use `classification: "yellow"` or `"red"` independently
of their visual `color`. Missing classifications default to yellow.

Thresholds use `type: "threshold"`, a `size` and `rotation`, and a
`thresholdAction` for starting or stopping one event counter. They are
non-colliding builder guides and invisible in the simulator. A `message`
action also stores `message` text and `messageDuration` in seconds. Distance
signs display feet.

For maneuverability, `maneuver-stop` disqualifies the run. A second crossing
of `maneuver-start` after five seconds completes the run only after every red
post has been knocked down; otherwise scoring continues.

Durability scoring starts a six-minute countdown when a cart is first
attached. Repeatable `lap-pt1` and `lap-pt2` thresholds award one lap after
both parts have been crossed, then reset for the next lap. A
`durability-disqualify` threshold ends the run and releases the cart. The cart
is also released when time expires or structural/driveline durability reaches
zero; durability failures display a broken-tractor result and smoke until a
`clear-breakdown-smoke` threshold is crossed.
Physical course objects may set `structuralDamage` from 0 to 100, indicating
the base percentage of cart structural durability removed on contact. Damage
scales with tractor speed: 0 mph applies none, 5 mph applies the configured
amount, and 10 mph applies twice the configured amount. It defaults to zero.

The `stop-tractor` action uses `stopDuration`. The `objects` action uses an
`objectChanges` array of object IDs and `add` or `remove` actions. Box blocks,
waypoints, and thresholds with `initiallyActive: false` begin inactive; an
`add` change activates one when its threshold is crossed, while `remove`
deactivates it. Thresholds may target other thresholds but not themselves.
Re-added thresholds can be crossed again. The property defaults to true for
existing maps.

Chunk regions use `type: "chunk"` with `position`, `size`, and `rotation` to
define a visible editing guide. Membership is explicit: `objectIds` contains
the IDs of the objects and scoring thresholds loaded and unloaded with the chunk. Region bounds do not
affect membership. `initiallyLoaded` controls whether its members are
visible and collidable when a drive begins; `editorVisible` only controls the
builder view. Chunk members automatically load while the player is inside or
near the region and unload after the player moves away. Different load and
unload margins prevent rapid switching at a region boundary. Chunks with
`initiallyLoaded: false` are excluded from proximity streaming and remain
unloaded until a threshold explicitly loads them.
A threshold with `thresholdAction: "chunks"` uses `chunkChanges`
entries containing a chunk `id` and a `load` or `unload` action. Existing
`objects` thresholds remain supported and can still control individual objects.

Ground markers use `type: "line"`, local `[x, z]` control `points`, a
`thickness`, `color`, and `curved` flag. They render just above the ground and
do not participate in physics.

Waypoint markers use `type: "waypoint"`, a `position`, and their `name` as the
displayed text. During a drive their text is drawn above the scene so objects
cannot obscure it; an edge arrow replaces its position marker when it is out
of view. Waypoints do not participate in physics. Set `initiallyActive: false`
to hide a waypoint when the drive starts. An `objects` threshold can then use an
`add` or `remove` entry for the waypoint ID to show or hide it.

Every object can store a `name`. Box objects can set `invisible: true` to hide
their surface while preserving collision and sign behavior.

Custom GLB entries use `type: "asset"`, an `asset` filename from
`public/assets/models/map-assets/assets.json`, and position, rotation, and size
vectors. For these entries, `size` is the model's X/Y/Z scale. Custom assets
are decorative and do not participate in physics.

Cart entries use `type: "cart"`, a ground-level `position`, `rotation`, and
`color`. Their fixed 3-by-1.5-meter geometry automatically hitches when the
tractor's rear hitch comes within one meter.

Pulling sled entries use `type: "pulling-sled"` with the same transform and
color fields. The six-meter sled automatically hitches within one meter,
increases draft force with forward distance, and blocks reverse while attached.
Press `P` to release it. Carts use the same manual release control; either
towable reconnects after the tractor first leaves and then re-enters hitch range.
Driving cars use `type: "car"`, a ground-level `position` and `rotation`, and
the same `car.glb` scale and `2.73 × 1.73 × 6.21` metre collision box as city
traffic. Set `carBehavior` to `coordinates` and provide absolute `[x, z]`
entries in `destinations` for a looping route, or set it to `player` to have
the car pursue the tractor. Coordinate routes return from the last destination
to the first and repeat continuously. Cars accelerate, steer with a limited turn radius,
and can reverse when a nearby target is behind them. They have 100 durability,
can overturn through physical collisions, and stop driving when overturned or
destroyed. `tractorHitDamage` controls car durability lost when the moving
tractor's front or rear strikes it; `carHitDamage` controls player structural
durability lost when the moving car's front or rear strikes the tractor.
`maxSpeedMph` and `acceleration` configure its forward top speed and acceleration.
Player-pursuit cars use the full configured speed even at close range.
