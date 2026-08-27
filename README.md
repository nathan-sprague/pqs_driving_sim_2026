# Quarter-Scale Tractor Simulator

The rewrite begins with a Vite + Three.js foundation. It currently contains only:

- an event-selection home page;
- routes for pulling, maneuverability, and durability;
- a shared Three.js world that assembles the tractor assets and presents them
  from the driver's first-person viewpoint with mouse-look controls.
- rigid-body tractor dynamics with four suspension contact points, front-wheel
  steering, rear-wheel drive, and W/S forward-reverse control.
- a 5 mph drivetrain limit and a small physics test area containing a solid
  barrier, traversable block, and double-sided ramp.
- a browser-based map builder with free-flight navigation, editable box
  obstacles, full three-axis rotation, color controls, vehicle spawn placement,
  local autosave, JSON download, and custom-map test driving.
- JSON upload for reopening and continuing work on an exported map, plus a
  home-page library for bundled event and open-world maps.
- block-mounted signs for elapsed time, distance travelled, or custom text,
  plus a tractor-mounted speed display.
- animated people who can stand, sit, or patrol a 5-by-5-meter area, flee a
  nearby tractor, and react physically when struck.
- waypoint-driven people with configurable stops and looping, plus optional
  articulated green or red flags.
- colorable maneuverability posts with articulated impact physics: gentle
  wobble, detachable marker balls, full knockdown, and post-to-post collisions.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Structure

```text
public/assets/       Static models and textures
src/config/          Event definitions
src/pages/           Page-level UI
src/styles/          Shared presentation
src/world/           Three.js scene and tractor assembly
```

Event courses, attachments, scoring, transmission controls, and event-specific
mechanics are intentionally not implemented yet.

## Map builder

Open **Build a custom test course** from the home page. Use **Enter fly mode**
and move with W/A/S/D, Space/Ctrl, and Shift. Escape releases the pointer so a
block can be selected and edited in the side panel. **Test drive** saves and
opens the current map using the same geometry for rendering and collision.

Use **Upload JSON** to replace the current working map with an exported file
and continue editing it. Bundled maps belong in `public/maps/`; see
`public/maps/README.md` for the four required filenames.

The three competition cards load their bundled JSON maps directly. Use
**Add maneuverability post** in the builder to place a post; post entries are
stored alongside boxes in the map's `blocks` array with `type: "post"`.
Select a box to add a sign to its local front face. Time and distance signs
update while driving; custom signs display the text saved with the map.
Maneuverability-score signs count automatic course demarcations between the
configured start and finish thresholds.
Ground-line objects provide straight or smoothly curved, non-colliding course
markings with editable control points, thickness, and color.
Builder objects can be named, blocks can act as invisible collision geometry,
and human tractor-avoidance behavior can be enabled per person.
Placeable two-wheel carts reuse the tractor rear-wheel model and automatically
connect to the tractor's rear hitch at close range.

## Tractor configuration

Open **Configure tractor** from the home page to inspect the model and save its
weight in pounds, center of mass in inches, top speed, power, and transmission. The viewer marks the center of mass and reports static front/rear wheel loading. Manual transmission
also configures idle/max RPM, 1–9 forward gears, and individual ratios. It uses
W for throttle, S for braking, C plus a gear number or R to shift, and C plus N
or 0 for neutral.

## Tractor part placement

Open **Place tractor parts** to move or rotate the complete visual assembly,
body, joystick, or wheels. Download the result and put it in
`public/tractor-configs/`, using the filename shown by the editor. All
driving modes load that placement file. New tractor models are added to
`src/config/tractorModels.js`; see `public/tractor-configs/README.md` for the
schema and workflow.
