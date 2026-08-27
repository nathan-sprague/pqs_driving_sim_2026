import * as CANNON from 'cannon-es';
import { CAR_CENTER_OF_MASS_HEIGHT, CAR_SIZE } from '../cars/createCarVisual.js';
import { obstacleWorldPosition, obstacles, rampGeometry } from '../../config/obstacles.js';
import {
  POST_BALL_CENTER_Y,
  POST_BALL_RADIUS,
  POST_BASE_SIZE,
  POST_CENTER_OF_MASS_Y,
  POST_POLE_CENTER_Y,
  POST_POLE_HEIGHT,
  POST_POLE_RADIUS,
} from '../../config/posts.js';

// Axles are at X = -0.25 and X = 1.67 (1.92 m wheelbase). A 35% front
// static load puts the longitudinal center of mass 35% of the wheelbase ahead
// of the rear axle: -0.25 + (1.92 * 0.35) = 0.422.
const MAX_STEER_ANGLE = 0.52;
const MAX_CART_ARTICULATION = 50 * Math.PI / 180;
const SLED_INITIAL_DRAFT = 50;
// Tuned so a representative 32 hp, 1,600 lb tractor completes a pull near
// 120 feet, with tire breakaway occurring during the final quarter.
const SLED_DRAFT_PER_METRE_SQUARED = 5;
const SLED_MAX_DRAFT = 12000;
const SLED_DRAG_POINT_LOCAL = new CANNON.Vec3(-2.65, -0.08, 0);
const DRIVEN_WHEEL_STATIC_FRICTION_SLIP = 4.2;
const DRIVEN_WHEEL_KINETIC_FRICTION_SLIP = 0.65;
const TIRE_BREAKAWAY_DRAFT_NEWTONS = 3800;
const PHYSICS_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_SUBSTEPS = 4;
const POST_BALL_ROLLING_DAMPING = 0.18;

export function createTractorPhysics(startPose, mapBlocks = null, tractorConfig = {
  massLb: 900, centerOfMassInches: [16.61, 22.83, 0], topSpeedMph: 5, powerHp: 34, durability: 100,
  idleRpm: 1800, maxRpm: 3600, transmission: 'automatic', gearCount: 3, gearRatios: [3, 2, 1],
}) {
  const centerOfMass = new CANNON.Vec3(...tractorConfig.centerOfMassInches.map((coordinate) => coordinate * 0.0254));
  const baseEngineForceAtTopPower = 2600 * (tractorConfig.powerHp / 34);
  const baseMaxDriveSpeed = tractorConfig.topSpeedMph * 0.44704;
  const durabilityWearMultiplier = 2 - Math.min(100, Math.max(0, tractorConfig.durability ?? 100)) / 100;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.75;

  const groundMaterial = new CANNON.Material('dirt');
  const walkingPlayerMaterial = new CANNON.Material('walking-player');
  world.addContactMaterial(new CANNON.ContactMaterial(walkingPlayerMaterial, groundMaterial, {
    friction: 0,
    restitution: 0,
  }));
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // The rigid body origin is the estimated center of mass. Its longitudinal
  // position produces the measured 65% rear / 35% front static axle loading.
  const chassisMaterial = new CANNON.Material('tractor');
  const chassisBody = new CANNON.Body({
    mass: tractorConfig.massLb * 0.45359237,
    material: chassisMaterial,
    linearDamping: 0.08,
    angularDamping: 0.42,
    allowSleep: false,
  });
  chassisBody.name = 'tractor-chassis';
  const hasConfiguredBounds = Array.isArray(tractorConfig.bounds?.size);
  const boundsSize = hasConfiguredBounds ? tractorConfig.bounds.size : [2.4, 0.6, 0.88];
  const centerOfMassArray = [centerOfMass.x, centerOfMass.y, centerOfMass.z];
  const boundsPosition = hasConfiguredBounds
    ? (tractorConfig.bounds.position ?? [0, 0, 0]).map((value, index) => (Number(value) || 0) - centerOfMassArray[index])
    : [0.38, 0.05, 0];
  const boundsRotation = Array.isArray(tractorConfig.bounds?.rotation) ? tractorConfig.bounds.rotation : [0, 0, 0];
  const boundsOrientation = new CANNON.Quaternion();
  boundsOrientation.setFromEuler(...boundsRotation, 'XYZ');
  chassisBody.addShape(
    new CANNON.Box(new CANNON.Vec3(...boundsSize.map((value) => Math.max(0.025, Math.abs(Number(value) || 0)) / 2))),
    new CANNON.Vec3(...boundsPosition.map((value) => Number(value) || 0)),
    boundsOrientation,
  );

  const startQuaternion = new CANNON.Quaternion();
  startQuaternion.setFromEuler(...(startPose.rotation ?? [0, startPose.yaw ?? 0, 0]), 'XYZ');
  const rotatedCenter = startQuaternion.vmult(centerOfMass);
  chassisBody.position.set(
    startPose.position[0] + rotatedCenter.x,
    startPose.position[1] + rotatedCenter.y,
    startPose.position[2] + rotatedCenter.z,
  );
  chassisBody.quaternion.copy(startQuaternion);
  world.addBody(chassisBody);

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexForwardAxis: 0,
    indexRightAxis: 2,
    indexUpAxis: 1,
  });

  const commonWheel = {
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(0, 0, 1),
    suspensionRestLength: 0.24,
    suspensionStiffness: 42,
    dampingRelaxation: 2.4,
    dampingCompression: 4.8,
    frictionSlip: 4.2,
    rollInfluence: 0.08,
    maxSuspensionForce: 18000,
    maxSuspensionTravel: 0.18,
    customSlidingRotationalSpeed: -25,
    useCustomSlidingRotationalSpeed: true,
  };

  // Wheel order: front right, front left, rear right, rear left.
  addWheel(vehicle, commonWheel, [1.67 - centerOfMass.x, 0.05, 0.38], 0.31, true);
  addWheel(vehicle, commonWheel, [1.67 - centerOfMass.x, 0.05, -0.38], 0.31, true);
  addWheel(vehicle, { ...commonWheel, frictionSlip: DRIVEN_WHEEL_STATIC_FRICTION_SLIP }, [-0.25 - centerOfMass.x, 0.06, 0.48], 0.41, false);
  addWheel(vehicle, { ...commonWheel, frictionSlip: DRIVEN_WHEEL_STATIC_FRICTION_SLIP }, [-0.25 - centerOfMass.x, 0.06, -0.48], 0.41, false);
  vehicle.addToWorld(world);

  const tireContact = new CANNON.ContactMaterial(chassisMaterial, groundMaterial, {
    friction: 0.9,
    restitution: 0,
    contactEquationStiffness: 1e7,
  });
  world.addContactMaterial(tireContact);
  const dynamicObjects = mapBlocks
    ? addMapBodies(world, groundBody, groundMaterial, mapBlocks)
    : { posts: [], humans: [], cars: [], carts: [], sleds: [], nitros: [], boxes: [], objects: new Map(), thresholds: createThresholdState([]) };
  if (!mapBlocks) addObstacleBodies(world, groundMaterial, startPose);

  let steering = 0;
  let wheelRotation = 0;
  let distanceTravelled = 0;
  let lastDriveDirection = 0;
  let directionChanges = 0;
  let exemptNextDirectionChange = false;
  let freezeRemaining = 0;
  let frozenPosition = null;
  let frozenQuaternion = null;
  let engineRpm = tractorConfig.idleRpm;
  let previousGear = 'N';
  let previousClutch = false;
  let drivetrainUnderLoad = false;
  let clutchLoadMemory = false;
  let rpmTransient = 0;
  let engineRunning = true;
  let drivenTireTractionBroken = false;
  let drivenTireSlipPercent = 0;
  const trailerDurability = { structural: 100, driveline: 100, temperature: 0 };
  const lastObstacleImpacts = new WeakMap();
  let pendingStructuralDamage = 0;
  let carriedBox = null;
  const proceduralCityBodies = new Map();
  for (const car of dynamicObjects.cars) {
    car.body.addEventListener('collide', (event) => {
      if (event.body !== chassisBody) return;
      // Car/tractor contacts are damage triggers rather than mass-transfer
      // collisions. This prevents the much heavier car body (and especially
      // its destruction launch) from overturning the tractor.
      event.contact.enabled = false;
      const impactCarSpeed = car.speed;
      if (world.time - car.lastTractorContactAt > 1) {
        car.retreatDistanceRemaining = 1.5;
        car.speed = -Math.min(car.maxSpeedMps * 0.4, 2.8);
        car.body.velocity.x = Math.sin(car.yaw) * car.speed;
        car.body.velocity.z = Math.cos(car.yaw) * car.speed;
        car.lastTractorContactAt = world.time;
      }
      if (world.time - car.lastDamageAt < 0.6) return;
      const tractorToCar = car.body.position.vsub(chassisBody.position);
      const tractorLocal = chassisBody.quaternion.conjugate().vmult(tractorToCar);
      const tractorVelocityLocal = chassisBody.quaternion.conjugate().vmult(chassisBody.velocity);
      const carToTractorLocal = car.body.quaternion.conjugate().vmult(chassisBody.position.vsub(car.body.position));
      const tractorStruckCar = Math.abs(tractorVelocityLocal.x) > 0.35
        && Math.sign(tractorVelocityLocal.x) === Math.sign(tractorLocal.x)
        && Math.abs(tractorLocal.x) > Math.abs(tractorLocal.z) * 0.65;
      const carStruckTractor = Math.abs(impactCarSpeed) > 0.35
        && Math.sign(impactCarSpeed) === Math.sign(carToTractorLocal.z)
        && Math.abs(carToTractorLocal.z) > Math.abs(carToTractorLocal.x) * 0.65;
      if (!tractorStruckCar && !carStruckTractor) return;
      if (tractorStruckCar) {
        const previousDurability = car.durability;
        car.durability = Math.max(0, car.durability - car.tractorHitDamage);
        if (previousDurability > 0 && car.durability === 0) {
          dramaticallyFlipCar(car, chassisBody);
        }
      }
      if (carStruckTractor) trailerDurability.structural = Math.max(0, trailerDurability.structural - car.carHitDamage);
      car.lastDamageAt = world.time;
    });
  }

  function dropCarriedBox() {
    if (!carriedBox) return null;
    const { box, handBody, constraint, linearDamping, angularDamping, collisionFilterMask } = carriedBox;
    world.removeConstraint(constraint);
    world.removeBody(handBody);
    box.body.linearDamping = linearDamping;
    box.body.angularDamping = angularDamping;
    box.body.collisionFilterMask = collisionFilterMask;
    box.body.allowSleep = true;
    box.body.wakeUp();
    carriedBox = null;
    return box.id;
  }

  function recordStructuralImpact(obstacleBody) {
    if (!obstacleBody) return;
    const isTowable = [...dynamicObjects.carts, ...dynamicObjects.sleds]
      .some((towable) => towable.body === obstacleBody);
    if (obstacleBody === groundBody || isTowable) return;
    const lastImpact = lastObstacleImpacts.get(obstacleBody) ?? -Infinity;
    if (world.time - lastImpact < 0.6) return;
    const structuralDamage = obstacleBody.userData?.structuralDamage ?? 0;
    if (structuralDamage <= 0) return;
    const speedMph = Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z) * 2.23694;
    pendingStructuralDamage += structuralDamage * speedMph / 5;
    lastObstacleImpacts.set(obstacleBody, world.time);
  }

  chassisBody.addEventListener('collide', (event) => {
    recordStructuralImpact(event.body);
  });

  return {
    createWalkingPlayer(position) {
      const body = new CANNON.Body({
        mass: 75,
        position: new CANNON.Vec3(...position),
        collisionFilterGroup: 2,
        collisionFilterMask: 1,
        material: walkingPlayerMaterial,
        linearDamping: 0.18,
        angularDamping: 1,
        fixedRotation: true,
        allowSleep: false,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.3, 0.85, 0.3)));
      body.userData = { groundedUntil: -Infinity };
      body.addEventListener('collide', (event) => {
        const normal = event.contact.ni;
        if (Math.abs(normal.y) > 0.55) body.userData.groundedUntil = world.time + 0.12;
      });
      world.addBody(body);
      return body;
    },
    removeWalkingPlayer(body) {
      if (body) world.removeBody(body);
    },
    addProceduralCityTile(id, buildings, pedestrianTargets, carDefinitions = [], collisionProps = []) {
      if (proceduralCityBodies.has(id)) return;
      const staticBodies = [...buildings, ...collisionProps].map((building) => {
        const body = new CANNON.Body({ mass: 0, material: groundMaterial });
        body.position.set(...building.position);
        body.addShape(new CANNON.Box(new CANNON.Vec3(building.size[0] / 2, building.size[1] / 2, building.size[2] / 2)));
        world.addBody(body);
        return body;
      });
      const pedestrians = pedestrianTargets.map((target) => {
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: groundMaterial, fixedRotation: true, allowSleep: false });
        body.position.set(target.position[0], target.position[1] + 0.88, target.position[2]);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), target.yaw);
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.85, 0.2)));
        const pedestrian = { body, fallen: false };
        body.addEventListener('collide', (event) => {
          if (pedestrian.fallen || event.body.name !== 'tractor-chassis') return;
          pedestrian.fallen = true;
          body.type = CANNON.Body.DYNAMIC;
          body.mass = 70;
          body.fixedRotation = false;
          body.updateMassProperties();
          body.velocity.copy(event.body.velocity);
          body.velocity.y += 1;
          body.angularVelocity.set(1.4, 0.5, -1.2);
          body.wakeUp();
        });
        world.addBody(body);
        return pedestrian;
      });
      const cars = carDefinitions.map((definition) => {
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: groundMaterial, allowSleep: false });
        body.position.set(...definition.position);
        body.addShape(new CANNON.Box(new CANNON.Vec3(definition.size[0] / 2, definition.size[1] / 2, definition.size[2] / 2)));
        body.userData = { visualOffsetY: definition.size[1] / 2 };
        world.addBody(body);
        return body;
      });
      proceduralCityBodies.set(id, { staticBodies, buildingDefinitions: buildings, roomBodies: new Map(), pedestrians, cars });
    },
    updateProceduralCityPedestrians(id, targets) {
      const tile = proceduralCityBodies.get(id);
      if (!tile) return [];
      tile.pedestrians.forEach((pedestrian, index) => {
        if (pedestrian.fallen || !targets[index]) return;
        const target = targets[index];
        pedestrian.body.position.set(target.position[0], target.position[1] + 0.88, target.position[2]);
        pedestrian.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), target.yaw);
        pedestrian.body.velocity.set(0, 0, 0);
      });
      return tile.pedestrians.map((pedestrian) => {
        const centerOffset = pedestrian.body.quaternion.vmult(new CANNON.Vec3(0, 0.88, 0));
        return {
          position: [
            pedestrian.body.position.x - centerOffset.x,
            pedestrian.body.position.y - centerOffset.y,
            pedestrian.body.position.z - centerOffset.z,
          ],
          quaternion: [pedestrian.body.quaternion.x, pedestrian.body.quaternion.y, pedestrian.body.quaternion.z, pedestrian.body.quaternion.w],
          fallen: pedestrian.fallen,
        };
      });
    },
    updateProceduralCityCars(id, targets) {
      const tile = proceduralCityBodies.get(id);
      if (!tile) return [];
      tile.cars.forEach((body, index) => {
        if (!body) return;
        const target = targets[index];
        if (!target) return;
        body.position.set(...target.position);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), target.yaw);
        body.velocity.set(...target.velocity);
      });
      return tile.cars.map((body) => body ? ({
        position: [body.position.x, body.position.y - body.userData.visualOffsetY, body.position.z],
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
      }) : null);
    },
    removeProceduralCityCar(id, index) {
      const tile = proceduralCityBodies.get(id);
      const body = tile?.cars[index];
      if (!body) return;
      world.removeBody(body);
      tile.cars[index] = null;
    },
    openProceduralCityRoom(id, index, walls) {
      const tile = proceduralCityBodies.get(id);
      if (!tile || tile.roomBodies.has(index)) return;
      if (tile.staticBodies[index]) world.removeBody(tile.staticBodies[index]);
      const bodies = walls.map((wall) => {
        const body = new CANNON.Body({ mass: 0, material: groundMaterial });
        body.position.set(...wall.position);
        body.addShape(new CANNON.Box(new CANNON.Vec3(wall.size[0] / 2, wall.size[1] / 2, wall.size[2] / 2)));
        world.addBody(body);
        return body;
      });
      tile.roomBodies.set(index, bodies);
    },
    closeProceduralCityRoom(id, index) {
      const tile = proceduralCityBodies.get(id);
      if (!tile?.roomBodies.has(index)) return;
      for (const body of tile.roomBodies.get(index)) world.removeBody(body);
      tile.roomBodies.delete(index);
      if (tile.staticBodies[index]) world.addBody(tile.staticBodies[index]);
    },
    removeProceduralCityTile(id) {
      const tile = proceduralCityBodies.get(id);
      for (const body of tile?.staticBodies ?? []) world.removeBody(body);
      for (const pedestrian of tile?.pedestrians ?? []) world.removeBody(pedestrian.body);
      for (const body of tile?.cars ?? []) if (body) world.removeBody(body);
      for (const bodies of tile?.roomBodies?.values() ?? []) for (const body of bodies) world.removeBody(body);
      proceduralCityBodies.delete(id);
    },
    pickUpMovableObject(from, to) {
      if (carriedBox) return carriedBox.box.id;
      const result = new CANNON.RaycastResult();
      world.raycastClosest(
        new CANNON.Vec3(...from),
        new CANNON.Vec3(...to),
        { collisionFilterGroup: 1, collisionFilterMask: 1, skipBackfaces: true },
        result,
      );
      if (!result.hasHit) return null;
      const box = dynamicObjects.boxes.find((candidate) => candidate.body === result.body && candidate.physicsObject?.active !== false);
      if (!box) return null;
      const handBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterMask: 0 });
      handBody.position.copy(result.hitPointWorld);
      world.addBody(handBody);
      const constraint = new CANNON.PointToPointConstraint(
        box.body,
        box.body.pointToLocalFrame(result.hitPointWorld),
        handBody,
        new CANNON.Vec3(),
        Math.max(800, box.body.mass * 250),
      );
      world.addConstraint(constraint);
      carriedBox = {
        box,
        handBody,
        constraint,
        linearDamping: box.body.linearDamping,
        angularDamping: box.body.angularDamping,
        collisionFilterMask: box.body.collisionFilterMask,
      };
      box.body.linearDamping = 0.35;
      box.body.angularDamping = 0.55;
      box.body.collisionFilterMask &= ~2;
      box.body.allowSleep = false;
      box.body.wakeUp();
      return box.id;
    },
    updateCarriedObject(position) {
      if (!carriedBox) return;
      carriedBox.handBody.position.set(...position);
      carriedBox.handBody.velocity.set(0, 0, 0);
    },
    dropCarriedObject() {
      return dropCarriedBox();
    },
    getCarriedObjectId() {
      return carriedBox?.box.id ?? null;
    },
    isWalkingPlayerGrounded(body) {
      if (!body) return false;
      if (body.userData.groundedUntil >= world.time) return true;
      const result = new CANNON.RaycastResult();
      const from = new CANNON.Vec3(body.position.x, body.position.y - 0.78, body.position.z);
      const to = new CANNON.Vec3(body.position.x, body.position.y - 1.02, body.position.z);
      world.raycastClosest(from, to, { collisionFilterGroup: 2, collisionFilterMask: 1, skipBackfaces: true }, result);
      return result.hasHit && result.body !== body;
    },
    isTractorFlipped() {
      const up = chassisBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      return up.y < 0.45;
    },
    rightTractor() {
      const up = chassisBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      if (up.y >= 0.45) return false;
      const yaw = bodyYaw(chassisBody);
      chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
      chassisBody.position.y += 1.1;
      chassisBody.velocity.set(0, 0, 0);
      chassisBody.angularVelocity.set(0, 0, 0);
      chassisBody.wakeUp();
      return true;
    },
    step(deltaSeconds, input) {
      const frozen = freezeRemaining > 0;
      if (frozen) {
        freezeRemaining = Math.max(0, freezeRemaining - deltaSeconds);
        frozenPosition ??= chassisBody.position.clone();
        frozenQuaternion ??= chassisBody.quaternion.clone();
        chassisBody.position.copy(frozenPosition);
        chassisBody.quaternion.copy(frozenQuaternion);
        chassisBody.velocity.set(0, 0, 0);
        chassisBody.angularVelocity.set(0, 0, 0);
      } else {
        frozenPosition = null;
        frozenQuaternion = null;
      }
      const targetSteering = input.left
        ? MAX_STEER_ANGLE
        : input.right
          ? -MAX_STEER_ANGLE
          : 0;
      const steeringRate = input.left || input.right ? 2.6 : 3.8;
      steering = moveToward(steering, targetSteering, steeringRate * deltaSeconds);

      vehicle.setSteeringValue(steering, 0);
      vehicle.setSteeringValue(steering, 1);

      const forward = chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
      const forwardSpeed = chassisBody.velocity.dot(forward);
      const pullingSledAttached = dynamicObjects.sleds.some((sled) => sled.attached);
      const nitroMultiplier = dynamicObjects.nitros.some((nitro) => nitro.attached) ? 3 : 1;
      const engineForceAtTopPower = baseEngineForceAtTopPower * nitroMultiplier;
      const maxDriveSpeed = baseMaxDriveSpeed * nitroMultiplier;
      let engineForce = 0;
      let manualCreepEngaged = false;
      if (tractorConfig.transmission === 'manual') {
        const gear = input.gear ?? 'N';
        const direction = gear === 'R' ? -1 : 1;
        const topGearRatio = tractorConfig.gearRatios.at(-1);
        const selectedRatio = gear === 'R'
          ? tractorConfig.gearRatios[0]
          : tractorConfig.gearRatios[Number(gear) - 1];
        const gearSpeed = selectedRatio ? maxDriveSpeed * (topGearRatio / selectedRatio) : 0;
        const reverseLocked = pullingSledAttached && gear === 'R';
        const directedSpeed = forwardSpeed * direction;
        if (gear !== previousGear) {
          const previousRatio = manualGearRatio(previousGear, tractorConfig.gearRatios);
          const nextRatio = manualGearRatio(gear, tractorConfig.gearRatios);
          if (previousRatio && nextRatio) rpmTransient += nextRatio < previousRatio ? -320 : 320;
          else rpmTransient += gear === 'N' ? 180 : -180;
          previousGear = gear;
        }
        if (input.clutch && !previousClutch && drivetrainUnderLoad) {
          rpmTransient += 220;
          clutchLoadMemory = true;
        }
        if (!input.clutch && previousClutch && clutchLoadMemory) {
          rpmTransient -= 220;
          clutchLoadMemory = false;
        }
        previousClutch = input.clutch;
        if (engineRunning && gearSpeed && !reverseLocked && !frozen && !input.clutch && input.throttle && !input.reverse) {
          engineForce = direction * engineForceAtTopPower * Math.max(0, 1 - Math.max(directedSpeed, 0) / gearSpeed);
        } else if (engineRunning && gearSpeed && !reverseLocked && !frozen && !input.clutch && !input.reverse) {
          const creepSpeed = gearSpeed * (tractorConfig.idleRpm / tractorConfig.maxRpm);
          const speedError = creepSpeed - directedSpeed;
          const controlBand = Math.max(0.12, creepSpeed * 0.2);
          engineForce = direction * engineForceAtTopPower * Math.max(0, Math.min(1, speedError / controlBand));
          manualCreepEngaged = true;
        }
        const wheelRpm = gearSpeed ? Math.abs(directedSpeed / gearSpeed) * tractorConfig.maxRpm : 0;
        const brakingRpm = Math.min(
          wheelRpm,
          Math.max(0, engineRpm - tractorConfig.maxRpm * 1.4 * deltaSeconds),
        );
        const baseTargetRpm = input.reverse && gearSpeed && !input.clutch
            ? brakingRpm
            : input.throttle ? tractorConfig.maxRpm : tractorConfig.idleRpm;
        if (engineRunning) {
          const minimumRpm = input.reverse && gearSpeed && !input.clutch ? 0 : tractorConfig.idleRpm - 300;
          engineRpm = moveToward(
            engineRpm,
            Math.min(tractorConfig.maxRpm + 300, Math.max(minimumRpm, baseTargetRpm + rpmTransient)),
            tractorConfig.maxRpm * 1.2 * deltaSeconds,
          );
          if (input.reverse && gearSpeed && !input.clutch && engineRpm < 500) {
            engineRpm = 0;
            engineRunning = false;
          }
        } else engineRpm = 0;
        drivetrainUnderLoad = Boolean(gearSpeed && !input.clutch && (
          input.throttle
          || Math.abs(directedSpeed) > 0.15
          || (manualCreepEngaged && directedSpeed < gearSpeed * (tractorConfig.idleRpm / tractorConfig.maxRpm) * 0.92)
        ));
        rpmTransient = moveToward(rpmTransient, 0, 650 * deltaSeconds);
      } else {
        const forwardForce = !frozen && input.throttle && !input.reverse
          ? engineForceAtTopPower * Math.max(0, 1 - Math.max(forwardSpeed, 0) / maxDriveSpeed)
          : 0;
        const reverseForce = !pullingSledAttached && !frozen && input.reverse && !input.throttle
          ? -engineForceAtTopPower * Math.max(0, 1 - Math.max(-forwardSpeed, 0) / maxDriveSpeed)
          : 0;
        engineForce = forwardForce + reverseForce;
        engineRpm = moveToward(engineRpm, input.throttle || input.reverse ? tractorConfig.maxRpm : tractorConfig.idleRpm, tractorConfig.maxRpm * 0.75 * deltaSeconds);
      }
      vehicle.applyEngineForce(engineForce, 2);
      vehicle.applyEngineForce(engineForce, 3);

      // A small driveline drag prevents the tractor coasting indefinitely,
      // while remaining much weaker than an explicit brake.
      const manualBrake = tractorConfig.transmission === 'manual' && input.reverse;
      const sledReverseLock = pullingSledAttached && (input.reverse || (tractorConfig.transmission === 'manual' && input.gear === 'R'));
      const rollingBrake = sledReverseLock ? 350 : manualBrake ? 220 : input.throttle || input.reverse || manualCreepEngaged ? 0 : 7;
      vehicle.setBrake(rollingBrake, 0);
      vehicle.setBrake(rollingBrake, 1);
      vehicle.setBrake(rollingBrake, 2);
      vehicle.setBrake(rollingBrake, 3);

      updateAttachedPostBalls(dynamicObjects.posts);
      updatePostSprings(dynamicObjects.posts);
      updateHumans(dynamicObjects.humans, chassisBody, deltaSeconds);
      updateMapCars(dynamicObjects.cars, chassisBody, deltaSeconds);
      updateCartHitch(world, dynamicObjects.carts, dynamicObjects.sleds, chassisBody, centerOfMass);
      updateSledHitch(world, dynamicObjects.sleds, dynamicObjects.carts, chassisBody, centerOfMass);
      updateSledDraft(world, dynamicObjects.sleds, chassisBody, deltaSeconds);
      const attachedSled = dynamicObjects.sleds.find((sled) => sled.attached);
      if (!attachedSled) drivenTireTractionBroken = false;
      else if (attachedSled.draftForce >= TIRE_BREAKAWAY_DRAFT_NEWTONS) drivenTireTractionBroken = true;
      setDrivenWheelTraction(vehicle, drivenTireTractionBroken);
      world.step(PHYSICS_STEP_SECONDS, Math.min(deltaSeconds, 0.1), MAX_PHYSICS_SUBSTEPS);
      for (const nitro of dynamicObjects.nitros) {
        if (!nitro.attached && nitro.touchedTractor && carriedBox?.box !== nitro) attachNitro(world, nitro);
        nitro.touchedTractor = false;
      }
      for (const wheel of vehicle.wheelInfos) {
        if (wheel.isInContact) recordStructuralImpact(wheel.raycastResult.body);
      }
      const measuredTireSlip = drivenTireTractionBroken
        ? calculateDrivenTireSlip(vehicle, chassisBody)
        : 0;
      drivenTireSlipPercent = moveToward(
        drivenTireSlipPercent,
        measuredTireSlip,
        (measuredTireSlip > drivenTireSlipPercent ? 35 : 120) * deltaSeconds,
      );
      updateSledHitchForces(dynamicObjects.sleds);
      updateTrailerDurability(deltaSeconds, input, engineForce);
      if (pullingSledAttached) preventReverseMotion(chassisBody);
      stabilizeCarts(dynamicObjects.carts, chassisBody, steering, deltaSeconds);
      stabilizeCarts(dynamicObjects.sleds, chassisBody, steering, deltaSeconds);
      if (frozen) {
        chassisBody.position.copy(frozenPosition);
        chassisBody.quaternion.copy(frozenQuaternion);
        chassisBody.velocity.set(0, 0, 0);
        chassisBody.angularVelocity.set(0, 0, 0);
      }
      updateThresholds(dynamicObjects.thresholds, chassisBody);
      updatePostScoring(dynamicObjects.posts);
      const scoringActive = isScoringActive(dynamicObjects.thresholds);
      if (scoringActive && dynamicObjects.posts.some((post) => post.redContactPending)) {
        exemptNextDirectionChange = true;
        for (const post of dynamicObjects.posts) {
          if (!post.redContactPending) continue;
          post.redContactPending = false;
          post.contactExemptionGiven = true;
        }
      }
      const driveDirection = forwardSpeed > 0.15 ? 1 : forwardSpeed < -0.15 ? -1 : 0;
      if (scoringActive && driveDirection && lastDriveDirection && driveDirection !== lastDriveDirection) {
        if (exemptNextDirectionChange) exemptNextDirectionChange = false;
        else directionChanges += 1;
      }
      if (driveDirection) lastDriveDirection = driveDirection;
      distanceTravelled += Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z) * deltaSeconds;
      wheelRotation += chassisBody.velocity.length() * deltaSeconds / 0.41;
    },

    syncVisual(tractor, mapVisuals = null) {
      tractor.quaternion.copy(chassisBody.quaternion);
      const centerWorld = chassisBody.quaternion.vmult(centerOfMass);
      tractor.position.set(
        chassisBody.position.x - centerWorld.x,
        chassisBody.position.y - centerWorld.y,
        chassisBody.position.z - centerWorld.z,
      );

      for (const part of Object.values(tractor.userData.parts)) {
        if (part.userData.role === 'steering') part.rotation.y = part.userData.baseRotation[1] + steering;
        if (part.userData.role === 'drive-wheel') part.rotation.z = part.userData.baseRotation[2] - wheelRotation;
      }

      for (const post of dynamicObjects.posts) {
        const visual = mapVisuals?.userData.posts.get(post.id);
        if (!visual) continue;
        const centerOffset = post.body.quaternion.vmult(new CANNON.Vec3(0, POST_CENTER_OF_MASS_Y, 0));
        visual.body.position.set(
          post.body.position.x - centerOffset.x,
          post.body.position.y - centerOffset.y,
          post.body.position.z - centerOffset.z,
        );
        visual.body.quaternion.copy(post.body.quaternion);
        visual.ball.position.copy(post.ballBody.position);
        visual.ball.quaternion.copy(post.ballBody.quaternion);
      }
      for (const human of dynamicObjects.humans) {
        const visual = mapVisuals?.userData.humans.get(human.id);
        if (!visual) continue;
        const centerOffset = human.body.quaternion.vmult(new CANNON.Vec3(0, human.centerY, 0));
        visual.root.position.set(
          human.body.position.x - centerOffset.x,
          human.body.position.y - centerOffset.y,
          human.body.position.z - centerOffset.z,
        );
        visual.root.quaternion.copy(human.body.quaternion);
        visual.setState(human.animationMode, human.fallen, human.fleeing);
      }
      for (const car of dynamicObjects.cars) {
        const visual = mapVisuals?.userData.cars.get(car.id);
        if (!visual) continue;
        visual.position.set(car.body.position.x, car.body.position.y - CAR_CENTER_OF_MASS_HEIGHT, car.body.position.z);
        visual.quaternion.copy(car.body.quaternion);
        visual.userData.setDurability?.(car.durability);
      }
      for (const cart of dynamicObjects.carts) {
        const visual = mapVisuals?.userData.carts.get(cart.id);
        if (!visual) continue;
        const centerOffset = cart.body.quaternion.vmult(new CANNON.Vec3(0, 0.5, 0));
        visual.position.set(
          cart.body.position.x - centerOffset.x,
          cart.body.position.y - centerOffset.y,
          cart.body.position.z - centerOffset.z,
        );
        visual.quaternion.copy(cart.body.quaternion);
      }
      for (const nitro of dynamicObjects.nitros) {
        const visual = mapVisuals?.userData.nitros.get(nitro.id);
        if (!visual) continue;
        if (nitro.attached) {
          if (!nitro.visualAttached) {
            tractor.add(visual);
            visual.position.set(0.15, 1.05, 0.55);
            visual.rotation.set(0, 0, Math.PI / 2);
            nitro.visualAttached = true;
          }
          continue;
        }
        visual.position.set(nitro.body.position.x, nitro.body.position.y - 0.45, nitro.body.position.z);
        visual.quaternion.copy(nitro.body.quaternion);
      }
      for (const sled of dynamicObjects.sleds) {
        const visual = mapVisuals?.userData.sleds.get(sled.id);
        if (!visual) continue;
        const centerOffset = sled.body.quaternion.vmult(new CANNON.Vec3(0, 0.5, 0));
        visual.position.set(
          sled.body.position.x - centerOffset.x,
          sled.body.position.y - centerOffset.y,
          sled.body.position.z - centerOffset.z,
        );
        visual.quaternion.copy(sled.body.quaternion);
      }
      for (const box of dynamicObjects.boxes) {
        if ('attached' in box) continue;
        if (box.body.sleepState === CANNON.Body.SLEEPING) continue;
        const visual = mapVisuals?.userData.objects.get(box.id)?.[0];
        if (!visual) continue;
        visual.position.copy(box.body.position);
        visual.quaternion.copy(box.body.quaternion);
      }
    },
    getTelemetry() {
      const redPosts = dynamicObjects.posts.filter((post) => post.isRed);
      const yellowPosts = dynamicObjects.posts.filter((post) => post.isYellow);
      const attachedPullingSled = dynamicObjects.sleds.find((sled) => sled.attached);
      const yellowBallDemarcations = yellowPosts.filter((post) => !post.ballAttached).length;
      const yellowTippedDemarcations = yellowPosts.filter((post) => !post.anchored).length;
      return {
        speedMps: Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z),
        forwardSpeedMps: chassisBody.velocity.dot(chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0))),
        distanceMetres: distanceTravelled,
        engineRpm,
        engineRunning,
        attachedCarts: dynamicObjects.carts.filter((cart) => cart.attached).length,
        cartUpY: dynamicObjects.carts[0]?.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y ?? 1,
        cartArticulationDegrees: dynamicObjects.carts[0]
          ? Math.abs(relativeYaw(chassisBody, dynamicObjects.carts[0].body)) * 180 / Math.PI
          : 0,
        attachedPullingSleds: dynamicObjects.sleds.filter((sled) => sled.attached).length,
        pullingSledDistanceMetres: attachedPullingSled?.pullDistance ?? dynamicObjects.sleds[0]?.pullDistance ?? 0,
        pullingSledDraftNewtons: attachedPullingSled?.draftForce ?? 0,
        pullingSledHitchForceNewtons: attachedPullingSled?.hitchForceNewtons ?? 0,
        drivenTireSlipPercent,
        nitroInstalled: dynamicObjects.nitros.some((nitro) => nitro.attached),
        trailerStructuralDurability: trailerDurability.structural,
        trailerDrivelineDurability: trailerDurability.driveline,
        trailerTemperature: trailerDurability.temperature,
        redBallsTotal: redPosts.length,
        redPostsTotal: redPosts.length,
        redBallsKnocked: redPosts.filter((post) => !post.ballAttached).length,
        // A red post is complete whenever its ball has physically detached,
        // regardless of whether the tractor, player, or another post caused it.
        redPostsKnocked: redPosts.filter((post) => !post.ballAttached).length,
        yellowBallsKnocked: yellowBallDemarcations,
        yellowPostsKnocked: yellowTippedDemarcations,
        directionChanges,
        maneuverabilityDemarcations: yellowBallDemarcations + (yellowTippedDemarcations * 2)
          + Math.max(0, directionChanges - 3),
        thresholdActions: dynamicObjects.thresholds.items
          .filter((threshold) => threshold.active)
          .map((threshold) => threshold.action),
        thresholdTriggers: dynamicObjects.thresholds.items
          .filter((threshold) => threshold.active && threshold.crossed)
          .map(({ id, name, action, crossingCount, message, messageDuration, stopDuration, objectChanges, chunkChanges }) => ({
            id, name, action, crossingCount, message, messageDuration, stopDuration, objectChanges, chunkChanges,
          })),
      };
    },
    getTractorPose() {
      return {
        position: [chassisBody.position.x, chassisBody.position.y, chassisBody.position.z],
        quaternion: [chassisBody.quaternion.x, chassisBody.quaternion.y, chassisBody.quaternion.z, chassisBody.quaternion.w],
      };
    },
    setTractorPose(pose) {
      if (!pose?.position || !pose?.quaternion) return;
      chassisBody.position.set(...pose.position);
      chassisBody.quaternion.set(...pose.quaternion);
      chassisBody.velocity.set(0, 0, 0);
      chassisBody.angularVelocity.set(0, 0, 0);
      chassisBody.force.set(0, 0, 0);
      chassisBody.torque.set(0, 0, 0);
      dynamicObjects.thresholds.previousPosition = chassisBody.position.clone();
      chassisBody.wakeUp();
    },
    freezeFor(seconds) {
      freezeRemaining = Math.max(freezeRemaining, Math.min(30, Math.max(0.5, Number(seconds) || 2)));
    },
    resetDurability() {
      trailerDurability.structural = 100;
      trailerDurability.driveline = 100;
      pendingStructuralDamage = 0;
    },
    restartEngine() {
      if (tractorConfig.transmission !== 'manual' || engineRunning) return;
      engineRunning = true;
      engineRpm = tractorConfig.idleRpm;
      rpmTransient = 0;
    },
    releaseTowable() {
      const towable = [...dynamicObjects.carts, ...dynamicObjects.sleds].find((candidate) => candidate.attached);
      if (!releaseTowable(world, towable)) return null;
      return dynamicObjects.carts.includes(towable) ? 'cart' : 'sled';
    },
    releaseCart() {
      return releaseTowable(world, dynamicObjects.carts.find((cart) => cart.attached));
    },
    setObjectActive(id, active) {
      const threshold = dynamicObjects.thresholds.items.find((candidate) => candidate.id === id);
      if (threshold) {
        if (active && !threshold.active) threshold.crossed = false;
        threshold.active = active;
        return;
      }
      const object = dynamicObjects.objects.get(id);
      if (object?.state?.attached && dynamicObjects.nitros.includes(object.state)) return;
      if (!object || object.active === active) return;
      if (!active && carriedBox && object.bodies.includes(carriedBox.box.body)) dropCarriedBox();
      if (!active && object.state?.constraint) {
        world.removeConstraint(object.state.constraint);
        object.state.constraint = null;
        object.state.attached = false;
        if ('hitchForceNewtons' in object.state) object.state.hitchForceNewtons = 0;
      }
      for (const body of object.bodies) {
        if (!active) {
          object.collisionResponses.set(body, body.collisionResponse);
          object.collisionMasks.set(body, body.collisionFilterMask);
        }
        body.collisionResponse = active ? object.collisionResponses.get(body) : false;
        body.collisionFilterMask = active ? object.collisionMasks.get(body) : 0;
        if (!active && body.type === CANNON.Body.DYNAMIC) {
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.sleep();
        }
        if (active && body.type === CANNON.Body.DYNAMIC) body.wakeUp();
      }
      if (object.canUnloadBodies) {
        for (const body of object.bodies) {
          if (active && !world.bodies.includes(body)) world.addBody(body);
          if (!active && world.bodies.includes(body)) world.removeBody(body);
        }
      }
      object.active = active;
    },
    isObjectPhysicsActive(id) {
      const object = dynamicObjects.objects.get(id);
      return Boolean(object?.active && object.bodies.some((body) => world.bodies.includes(body)));
    },
  };

  function updateTrailerDurability(deltaSeconds, input, engineForce) {
    trailerDurability.structural = Math.max(
      0,
      trailerDurability.structural - pendingStructuralDamage * durabilityWearMultiplier,
    );
    pendingStructuralDamage = 0;
    const driveLoad = Math.min(1, Math.abs(engineForce) / baseEngineForceAtTopPower);
    const horizontalSpeed = Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z);
    const driveCommanded = input.throttle || input.reverse;
    const up = chassisBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const underExtremeLoad = driveCommanded && (
      (driveLoad >= 0.65 && horizontalSpeed < 0.35)
      || up.y < 0.72
      || drivenTireSlipPercent >= 40
    );
    const temperatureTarget = underExtremeLoad ? 100 : horizontalSpeed > 0.15 ? 70 : 30;
    const temperatureRate = underExtremeLoad
      ? 1
      : temperatureTarget > trailerDurability.temperature ? 0.45 : 0.6;
    trailerDurability.temperature = moveToward(
      trailerDurability.temperature,
      temperatureTarget,
      temperatureRate * deltaSeconds,
    );
    const temperatureWearMultiplier = 1 + trailerDurability.temperature / 50;
    trailerDurability.driveline = Math.max(
      0,
      trailerDurability.driveline
        - driveLoad * 0.3 * durabilityWearMultiplier * temperatureWearMultiplier * deltaSeconds,
    );
  }
}

function releaseTowable(world, towable) {
  if (!towable?.constraint) return false;
  world.removeConstraint(towable.constraint);
  towable.constraint = null;
  towable.attached = false;
  if ('hitchForceNewtons' in towable) towable.hitchForceNewtons = 0;
  towable.requiresSeparation = true;
  towable.reconnectCooldown = 0.25;
  towable.body.wakeUp();
  return true;
}

function addMapBodies(world, groundBody, material, blocks) {
  const posts = [];
  const humans = [];
  const cars = [];
  const carts = [];
  const sleds = [];
  const nitros = [];
  const boxes = [];
  const objects = new Map();
  for (const block of blocks) {
    if (block.type === 'nitro') {
      const body = new CANNON.Body({ mass: 7, material, linearDamping: 0.1, angularDamping: 0.18, allowSleep: true });
      body.position.set(block.position[0], block.position[1] + 0.45, block.position[2]);
      body.quaternion.setFromEuler(...block.rotation, 'XYZ');
      body.addShape(new CANNON.Cylinder(0.22, 0.22, 0.9, 16));
      world.addBody(body);
      const nitro = { id: block.id, body, attached: false, touchedTractor: false, visualAttached: false };
      body.addEventListener('collide', (event) => { if (event.body.name === 'tractor-chassis') nitro.touchedTractor = true; });
      nitros.push(nitro);
      boxes.push(nitro);
      objects.set(block.id, createPhysicsObject([body], nitro, true));
      nitro.physicsObject = objects.get(block.id);
      continue;
    }
    if (block.type === 'post') {
      const post = addPostBody(world, groundBody, material, block);
      posts.push(post);
      objects.set(block.id, createPhysicsObject([post.body, post.ballBody], post));
      continue;
    }
    if (block.type === 'human') {
      const human = addHumanBody(world, material, block);
      humans.push(human);
      objects.set(block.id, createPhysicsObject([human.body], human));
      continue;
    }
    if (block.type === 'car') {
      const car = addMapCarBody(world, material, block);
      cars.push(car);
      objects.set(block.id, createPhysicsObject([car.body], car));
      continue;
    }
    if (block.type === 'cart') {
      const cart = addCartBody(world, material, block);
      carts.push(cart);
      objects.set(block.id, createPhysicsObject([cart.body], cart));
      continue;
    }
    if (block.type === 'pulling-sled') {
      const sled = addPullingSledBody(world, material, block);
      sleds.push(sled);
      objects.set(block.id, createPhysicsObject([sled.body], sled));
      continue;
    }
    if (block.type === 'threshold' || block.type === 'line' || block.type === 'chunk' || block.type === 'asset' || block.type === 'waypoint') continue;
    const body = new CANNON.Body({
      mass: block.movable ? block.massKg : 0,
      material,
      linearDamping: block.movable ? 0.08 : 0.01,
      angularDamping: block.movable ? 0.12 : 0.01,
      allowSleep: block.movable,
      sleepSpeedLimit: block.movable ? 0.08 : 0.1,
      sleepTimeLimit: block.movable ? 0.75 : 1,
    });
    body.position.set(...block.position);
    body.userData = { structuralDamage: block.structuralDamage ?? 0 };
    body.quaternion.setFromEuler(...block.rotation, 'XYZ');
    body.addShape(new CANNON.Box(new CANNON.Vec3(
      block.size[0] / 2,
      block.size[1] / 2,
      block.size[2] / 2,
    )));
    world.addBody(body);
    const box = { id: block.id, body };
    if (block.movable) boxes.push(box);
    objects.set(block.id, createPhysicsObject([body], box, true));
    box.physicsObject = objects.get(block.id);
  }
  return { posts, humans, cars, carts, sleds, nitros, boxes, objects, thresholds: createThresholdState(blocks) };
}

function addMapCarBody(world, material, definition) {
  const carMaterial = new CANNON.Material(`car-${definition.id}`);
  // Propulsion is supplied by the AI controller. Keeping chassis/ground
  // friction modest avoids a flat collision box digging in and pitching the
  // nose upward as commanded velocity increases.
  world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, material, { friction: 0.16, restitution: 0.02 }));
  const body = new CANNON.Body({
    mass: 1100,
    material: carMaterial,
    linearDamping: 0.12,
    angularDamping: 0.32,
    fixedRotation: true,
    allowSleep: false,
  });
  body.position.set(definition.position[0], definition.position[1] + CAR_CENTER_OF_MASS_HEIGHT, definition.position[2]);
  body.quaternion.setFromEuler(...definition.rotation, 'XYZ');
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(CAR_SIZE[0] / 2, CAR_SIZE[1] / 2, CAR_SIZE[2] / 2)),
    new CANNON.Vec3(0, CAR_SIZE[1] / 2 - CAR_CENTER_OF_MASS_HEIGHT, 0),
  );
  world.addBody(body);
  return {
    id: definition.id,
    body,
    behavior: definition.carBehavior,
    destinations: definition.destinations,
    destinationIndex: 0,
    yaw: bodyYaw(body),
    speed: 0,
    reversing: false,
    durability: 100,
    tractorHitDamage: definition.tractorHitDamage,
    carHitDamage: definition.carHitDamage,
    maxSpeedMps: definition.maxSpeedMph * 0.44704,
    acceleration: definition.acceleration,
    lastDamageAt: -Infinity,
    collisionDisabledRemaining: 0,
    retreatDistanceRemaining: 0,
    lastTractorContactAt: -Infinity,
  };
}

function updateMapCars(cars, tractorBody, deltaSeconds) {
  const wheelbase = 3.4;
  const maxSteering = Math.PI / 6;
  for (const car of cars) {
    if (car.collisionDisabledRemaining > 0) {
      car.collisionDisabledRemaining = Math.max(0, car.collisionDisabledRemaining - deltaSeconds);
      if (car.collisionDisabledRemaining === 0 && car.physicsObject?.active !== false) car.body.collisionResponse = true;
    }
    if (car.physicsObject?.active === false) {
      car.body.velocity.set(0, 0, 0);
      car.body.angularVelocity.set(0, 0, 0);
      car.speed = 0;
      continue;
    }
    const up = car.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    if (up.y < 0.5 || car.durability <= 0) {
      car.speed = 0;
      continue;
    }
    if (car.retreatDistanceRemaining > 0) {
      const retreatSpeed = -Math.min(car.maxSpeedMps * 0.4, 2.8);
      car.speed = moveToward(car.speed, retreatSpeed, car.acceleration * 2 * deltaSeconds);
      const velocityX = Math.sin(car.yaw) * car.speed;
      const velocityZ = Math.cos(car.yaw) * car.speed;
      car.body.velocity.x = velocityX;
      car.body.velocity.z = velocityZ;
      car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), car.yaw);
      car.body.angularVelocity.set(0, 0, 0);
      car.retreatDistanceRemaining = Math.max(0, car.retreatDistanceRemaining - Math.abs(car.speed) * deltaSeconds);
      continue;
    }
    car.yaw = bodyYaw(car.body);
    const target = car.behavior === 'player'
      ? [tractorBody.position.x, tractorBody.position.z]
      : car.destinations[car.destinationIndex];
    if (!target) continue;
    const dx = target[0] - car.body.position.x;
    const dz = target[1] - car.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (car.behavior !== 'player' && distance < 2.2) {
      car.destinationIndex = (car.destinationIndex + 1) % car.destinations.length;
      continue;
    }
    const targetYaw = Math.atan2(dx, dz);
    const forwardDot = Math.cos(wrapAngle(targetYaw - car.yaw));
    if (!car.reversing && distance < 11 && forwardDot < -0.35) car.reversing = true;
    if (car.reversing && (forwardDot > 0.35 || distance > 13)) car.reversing = false;
    const direction = car.reversing ? -1 : 1;
    const orientationTarget = car.reversing ? wrapAngle(targetYaw + Math.PI) : targetYaw;
    const headingError = wrapAngle(orientationTarget - car.yaw);
    const steering = Math.max(-maxSteering, Math.min(maxSteering, headingError * direction));
    const forwardTargetSpeed = car.maxSpeedMps;
    const targetSpeed = direction * (direction > 0 ? forwardTargetSpeed : Math.min(car.maxSpeedMps * 0.45, 3.6));
    const acceleration = car.speed * targetSpeed < 0 ? car.acceleration * 1.8 : car.acceleration;
    car.speed = moveToward(car.speed, targetSpeed, acceleration * deltaSeconds);
    const actualForwardSpeed = car.body.velocity.x * Math.sin(car.yaw)
      + car.body.velocity.z * Math.cos(car.yaw);
    // Bicycle-model steering: yaw can only change as the car travels, so it
    // cannot rotate in place. At 30 degrees of steering and a 3.4 m wheelbase,
    // the tightest turn radius is about 5.9 metres.
    car.yaw = wrapAngle(car.yaw + (actualForwardSpeed / wheelbase) * Math.tan(steering) * deltaSeconds);
    const velocityX = Math.sin(car.yaw) * car.speed;
    const velocityZ = Math.cos(car.yaw) * car.speed;
    // Keep gravity, bouncing, roll, and pitch fully physical while giving the
    // AI enough authority to overcome static ground friction.
    car.body.velocity.x = velocityX;
    car.body.velocity.z = velocityZ;
    car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), car.yaw);
    car.body.angularVelocity.set(0, 0, 0);
  }
}

function dramaticallyFlipCar(car, tractorBody) {
  const impactDirection = car.body.position.vsub(tractorBody.position);
  impactDirection.y = 0;
  if (impactDirection.lengthSquared() < 0.001) impactDirection.set(1, 0, 0);
  impactDirection.normalize();
  car.speed = 0;
  car.body.fixedRotation = false;
  car.body.updateMassProperties();
  car.body.collisionResponse = false;
  car.collisionDisabledRemaining = 0.8;
  // Launch away from the player and rotate around the perpendicular horizontal
  // axis so the roof also falls away from the impact source.
  car.body.velocity.x = impactDirection.x * 5;
  car.body.velocity.y = Math.max(car.body.velocity.y, 7);
  car.body.velocity.z = impactDirection.z * 5;
  car.body.angularVelocity.x = impactDirection.z * 8;
  car.body.angularVelocity.z = -impactDirection.x * 8;
  car.body.angularVelocity.y = 1.5;
  car.body.wakeUp();
}

function attachNitro(world, nitro) {
  world.removeBody(nitro.body);
  nitro.attached = true;
  nitro.physicsObject.active = false;
}

function addPullingSledBody(world, material, sled) {
  const sledMaterial = new CANNON.Material(`pulling-sled-${sled.id}`);
  world.addContactMaterial(new CANNON.ContactMaterial(sledMaterial, material, { friction: 0.003, restitution: 0 }));
  const body = new CANNON.Body({ mass: 170, material: sledMaterial, linearDamping: 0.04, angularDamping: 0.55, allowSleep: false });
  body.userData = { structuralDamage: sled.structuralDamage ?? 0 };
  body.addShape(new CANNON.Box(new CANNON.Vec3(3, 0.08, 0.75)), new CANNON.Vec3(0, 0, 0));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.6)), new CANNON.Vec3(1.5, 0.57, 0));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.725, 0.06)), new CANNON.Vec3(2.65, 0.68, 0.62));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.725, 0.06)), new CANNON.Vec3(2.65, 0.68, -0.62));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.06, 0.68)), new CANNON.Vec3(2.65, 1.4, 0));
  for (const x of [-0.38, 0.38]) {
    body.addShape(new CANNON.Sphere(0.34), new CANNON.Vec3(x, -0.16, 0.87));
    body.addShape(new CANNON.Sphere(0.34), new CANNON.Vec3(x, -0.16, -0.87));
  }
  body.quaternion.setFromEuler(...sled.rotation, 'XYZ');
  const centerOffset = body.quaternion.vmult(new CANNON.Vec3(0, 0.5, 0));
  body.position.set(sled.position[0] + centerOffset.x, sled.position[1] + centerOffset.y, sled.position[2] + centerOffset.z);
  world.addBody(body);
  return {
    id: sled.id,
    body,
    attached: false,
    constraint: null,
    pullDistance: 0,
    draftForce: 0,
    hitchForceNewtons: 0,
    hasMoved: false,
    reconnectCooldown: 0,
    requiresSeparation: false,
    lastPosition: null,
  };
}

function addCartBody(world, material, cart) {
  const cartMaterial = new CANNON.Material(`cart-${cart.id}`);
  world.addContactMaterial(new CANNON.ContactMaterial(cartMaterial, material, { friction: 0.015, restitution: 0 }));
  const body = new CANNON.Body({ mass: 45, material: cartMaterial, linearDamping: 0.025, angularDamping: 0.5, allowSleep: false });
  body.userData = { structuralDamage: cart.structuralDamage ?? 0 };
  body.addShape(new CANNON.Box(new CANNON.Vec3(1.5, 0.29, 0.75)), new CANNON.Vec3(0, 0.21, 0));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.125, 0.09)), new CANNON.Vec3(1.38, 0.37, 0));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.06, 0.09)), new CANNON.Vec3(1.72, 0.44, 0));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.15, 0.09)), new CANNON.Vec3(2.5, 0.29, 0));
  body.addShape(new CANNON.Sphere(0.41), new CANNON.Vec3(-0.72, -0.09, 0.95));
  body.addShape(new CANNON.Sphere(0.41), new CANNON.Vec3(-0.72, -0.09, -0.95));
  body.quaternion.setFromEuler(...cart.rotation, 'XYZ');
  const centerOffset = body.quaternion.vmult(new CANNON.Vec3(0, 0.5, 0));
  body.position.set(cart.position[0] + centerOffset.x, cart.position[1] + centerOffset.y, cart.position[2] + centerOffset.z);
  world.addBody(body);
  return { id: cart.id, body, attached: false, constraint: null, reconnectCooldown: 0, requiresSeparation: false };
}

function updateCartHitch(world, carts, sleds, tractorBody, centerOfMass) {
  if (carts.some((cart) => cart.attached) || sleds.some((sled) => sled.attached)) return;
  const tractorHitchLocal = new CANNON.Vec3(-1.15 - centerOfMass.x, 0.65 - centerOfMass.y, -centerOfMass.z);
  const tractorHitchWorld = tractorBody.pointToWorldFrame(tractorHitchLocal);
  for (const cart of carts) {
    if (cart.physicsObject?.active === false) continue;
    const cartHitchLocal = new CANNON.Vec3(2.55, 0.15, 0);
    const cartHitchWorld = cart.body.pointToWorldFrame(cartHitchLocal);
    cart.reconnectCooldown = Math.max(0, cart.reconnectCooldown - 1 / 60);
    if (cart.requiresSeparation) {
      if (tractorHitchWorld.distanceTo(cartHitchWorld) > 1) cart.requiresSeparation = false;
      continue;
    }
    if (cart.reconnectCooldown > 0) continue;
    if (tractorHitchWorld.distanceTo(cartHitchWorld) > 1) continue;
    cart.constraint = new CANNON.PointToPointConstraint(
      tractorBody,
      tractorHitchLocal,
      cart.body,
      cartHitchLocal,
      120000,
    );
    cart.constraint.collideConnected = false;
    world.addConstraint(cart.constraint);
    cart.attached = true;
    break;
  }
}

function updateSledHitch(world, sleds, carts, tractorBody, centerOfMass) {
  if (sleds.some((sled) => sled.attached) || carts.some((cart) => cart.attached)) return;
  const tractorHitchLocal = new CANNON.Vec3(-1.15 - centerOfMass.x, 0.65 - centerOfMass.y, -centerOfMass.z);
  const tractorHitchWorld = tractorBody.pointToWorldFrame(tractorHitchLocal);
  for (const sled of sleds) {
    if (sled.physicsObject?.active === false) continue;
    const sledHitchLocal = new CANNON.Vec3(3.55, 0.13, 0);
    const sledHitchWorld = sled.body.pointToWorldFrame(sledHitchLocal);
    if (sled.requiresSeparation) {
      if (tractorHitchWorld.distanceTo(sledHitchWorld) > 1) sled.requiresSeparation = false;
      continue;
    }
    if (sled.reconnectCooldown > 0) continue;
    if (tractorHitchWorld.distanceTo(sledHitchWorld) > 1) continue;
    sled.constraint = new CANNON.PointToPointConstraint(tractorBody, tractorHitchLocal, sled.body, sledHitchLocal, 140000);
    sled.constraint.collideConnected = false;
    world.addConstraint(sled.constraint);
    sled.attached = true;
    sled.pullDistance = 0;
    sled.draftForce = SLED_INITIAL_DRAFT;
    sled.hasMoved = false;
    sled.lastPosition = sled.body.position.clone();
    break;
  }
}

function updateSledDraft(world, sleds, tractorBody, deltaSeconds) {
  const speed = Math.hypot(tractorBody.velocity.x, tractorBody.velocity.z);
  for (const sled of sleds) {
    sled.reconnectCooldown = Math.max(0, sled.reconnectCooldown - deltaSeconds);
    if (!sled.attached) continue;
    const sledForward = sled.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    sledForward.y = 0;
    sledForward.normalize();
    if (sled.lastPosition) {
      const movement = sled.body.position.vsub(sled.lastPosition);
      sled.pullDistance += Math.hypot(movement.x, movement.z);
    }
    sled.lastPosition = sled.body.position.clone();
    // Weight transfer on a pulling sled is strongly progressive: the first few
    // metres are nearly unloaded, then resistance rises rapidly late in a pull.
    // Applying this force at the rear pan, instead of at the center of mass,
    // lets the sled pivot behind the tractor like a trailer.
    sled.draftForce = Math.min(
      SLED_MAX_DRAFT,
      SLED_INITIAL_DRAFT + SLED_DRAFT_PER_METRE_SQUARED * sled.pullDistance ** 2,
    );
    const dragPoint = sled.body.quaternion.vmult(SLED_DRAG_POINT_LOCAL);
    sled.body.applyForce(
      new CANNON.Vec3(-sledForward.x * sled.draftForce, 0, -sledForward.z * sled.draftForce),
      dragPoint,
    );
    if (speed > 0.15) sled.hasMoved = true;
  }
}

function updateSledHitchForces(sleds) {
  for (const sled of sleds) {
    if (!sled.attached || !sled.constraint) {
      sled.hitchForceNewtons = 0;
      continue;
    }
    const { equationX, equationY, equationZ } = sled.constraint;
    const sledForward = sled.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    sledForward.y = 0;
    sledForward.normalize();
    // cannon-es exposes equation multipliers as forces in newtons after each
    // solver step. Project the reaction force onto the horizontal drawbar axis
    // so vertical tongue weight and side-load do not inflate the drag reading.
    sled.hitchForceNewtons = Math.abs(
      equationX.multiplier * sledForward.x
      + equationZ.multiplier * sledForward.z,
    );
  }
}

function calculateDrivenTireSlip(vehicle, tractorBody) {
  const forward = tractorBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
  const groundSpeed = Math.abs(tractorBody.velocity.dot(forward));
  let maximumSlip = 0;
  for (const wheel of vehicle.wheelInfos.slice(2)) {
    if (!wheel.isInContact || !wheel.sliding) continue;
    const tireSurfaceSpeed = Math.abs(wheel.deltaRotation) * wheel.radius / PHYSICS_STEP_SECONDS;
    const referenceSpeed = Math.max(tireSurfaceSpeed, groundSpeed, 0.1);
    maximumSlip = Math.max(maximumSlip, Math.abs(tireSurfaceSpeed - groundSpeed) / referenceSpeed);
  }
  return Math.min(100, maximumSlip * 100);
}

function setDrivenWheelTraction(vehicle, tractionBroken) {
  const frictionSlip = tractionBroken
    ? DRIVEN_WHEEL_KINETIC_FRICTION_SLIP
    : DRIVEN_WHEEL_STATIC_FRICTION_SLIP;
  for (const wheel of vehicle.wheelInfos.slice(2)) wheel.frictionSlip = frictionSlip;
}

function preventReverseMotion(tractorBody) {
  const forward = tractorBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
  const forwardSpeed = tractorBody.velocity.dot(forward);
  if (forwardSpeed >= 0) return;
  tractorBody.velocity.x -= forward.x * forwardSpeed;
  tractorBody.velocity.y -= forward.y * forwardSpeed;
  tractorBody.velocity.z -= forward.z * forwardSpeed;
}

function stabilizeCarts(carts, tractorBody, steering, deltaSeconds) {
  const tractorYaw = bodyYaw(tractorBody);
  const tractorSpeed = Math.hypot(tractorBody.velocity.x, tractorBody.velocity.z);
  for (const cart of carts) {
    if (cart.physicsObject?.active === false) continue;
    let cartYaw = bodyYaw(cart.body);
    if (cart.attached) {
      let articulation = wrapAngle(cartYaw - tractorYaw);

      // Prevent jackknifing while leaving the trailer free to pivot naturally
      // in ordinary turns. Unhitched towables retain their own independent yaw.
      articulation = Math.max(-MAX_CART_ARTICULATION, Math.min(MAX_CART_ARTICULATION, articulation));
      if (Math.abs(steering) < 0.045) {
        const alignmentRate = Math.min(1.15, 0.32 + tractorSpeed * 0.38);
        articulation = moveToward(articulation, 0, alignmentRate * Math.min(deltaSeconds, 0.1));
        cart.body.angularVelocity.y *= 0.72;
      }
      cartYaw = tractorYaw + articulation;
    }
    cart.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), cartYaw);
    cart.body.angularVelocity.x = 0;
    cart.body.angularVelocity.z = 0;
  }
}

function bodyYaw(body) {
  const forward = body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
  return Math.atan2(-forward.z, forward.x);
}

function relativeYaw(firstBody, secondBody) {
  return wrapAngle(bodyYaw(secondBody) - bodyYaw(firstBody));
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function createPhysicsObject(bodies, state = null, canUnloadBodies = false) {
  const object = {
    bodies,
    active: true,
    collisionMasks: new Map(bodies.map((body) => [body, body.collisionFilterMask])),
    collisionResponses: new Map(bodies.map((body) => [body, body.collisionResponse])),
    state,
    canUnloadBodies,
  };
  if (state) state.physicsObject = object;
  return object;
}

function createThresholdState(blocks) {
  return {
    items: blocks.filter((block) => block.type === 'threshold').map((block) => {
      const quaternion = new CANNON.Quaternion();
      quaternion.setFromEuler(...block.rotation, 'XYZ');
      return {
        id: block.id,
        name: block.name,
        action: block.thresholdAction,
        message: block.message,
        messageDuration: block.messageDuration,
        stopDuration: block.stopDuration,
        objectChanges: block.objectChanges,
        chunkChanges: block.chunkChanges,
        position: new CANNON.Vec3(...block.position),
        size: block.size,
        inverseQuaternion: quaternion.conjugate(),
        active: block.initiallyActive !== false,
        crossed: false,
        crossingCount: 0,
      };
    }),
    previousPosition: null,
  };
}

function updateThresholds(state, tractorBody) {
  const current = tractorBody.position.clone();
  if (!state.previousPosition) {
    state.previousPosition = current;
    return;
  }
  for (const threshold of state.items) {
    if (!threshold.active) continue;
    const repeatable = ['maneuver-start', 'objects', 'lap-pt1', 'lap-pt2', 'clear-breakdown-smoke'].includes(threshold.action);
    if (threshold.crossed && !repeatable) continue;
    const previousLocal = threshold.inverseQuaternion.vmult(state.previousPosition.vsub(threshold.position));
    const currentLocal = threshold.inverseQuaternion.vmult(current.vsub(threshold.position));
    const crossedPlane = previousLocal.z * currentLocal.z <= 0
      && Math.abs(previousLocal.z - currentLocal.z) > 0.001;
    const withinGate = Math.abs(currentLocal.x) <= threshold.size[0] / 2
      && Math.abs(currentLocal.y) <= threshold.size[1] / 2;
    if (!crossedPlane || !withinGate) continue;
    threshold.crossed = true;
    threshold.crossingCount += 1;
  }
  state.previousPosition.copy(current);
}

function isScoringActive(thresholds) {
  const starts = ['maneuver-start', 'all-start'];
  const stops = ['maneuver-stop', 'all-stop'];
  const activeThresholds = thresholds.items.filter((threshold) => threshold.active);
  const hasStart = activeThresholds.some((threshold) => starts.includes(threshold.action));
  const started = !hasStart || activeThresholds.some((threshold) => threshold.crossed && starts.includes(threshold.action));
  const stopped = activeThresholds.some((threshold) => threshold.crossed && stops.includes(threshold.action));
  return started && !stopped;
}

function addHumanBody(world, material, human) {
  const sitting = human.behavior === 'sit';
  const centerY = sitting ? 0.5 : 0.88;
  const halfHeight = sitting ? 0.48 : 0.85;
  const body = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.KINEMATIC,
    material,
    linearDamping: 0.2,
    angularDamping: 0.55,
    allowSleep: false,
  });
  body.userData = { structuralDamage: human.structuralDamage ?? 0 };
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, halfHeight, 0.2)));
  body.position.set(human.position[0], human.position[1] + centerY, human.position[2]);
  body.quaternion.setFromEuler(...human.rotation, 'XYZ');
  world.addBody(body);

  const state = {
    id: human.id,
    body,
    behavior: human.behavior,
    fleeFromTractor: human.fleeFromTractor,
    centerY,
    origin: new CANNON.Vec3(...human.position),
    waypoint: hashString(human.id) % 4,
    lastTargetDistance: Infinity,
    stuckSeconds: 0,
    fallen: false,
    fleeing: false,
    fleeBlend: 0,
    route: human.waypoints,
    routeLoop: human.waypointLoop,
    routeIndex: 0,
    routeWaiting: false,
    routeWaitRemaining: 0,
    routeComplete: false,
    animationMode: human.behavior === 'sit' ? 'sit' : 'stand',
  };
  body.addEventListener('collide', (event) => {
    if (state.fallen || event.body.name !== 'tractor-chassis') return;
    state.fallen = true;
    state.fleeing = false;
    body.type = CANNON.Body.DYNAMIC;
    body.mass = 70;
    body.updateMassProperties();
    body.velocity.copy(event.body.velocity);
    const awayX = body.position.x - event.body.position.x;
    const awayZ = body.position.z - event.body.position.z;
    const length = Math.hypot(awayX, awayZ) || 1;
    body.velocity.x += (awayX / length) * 1.8;
    body.velocity.y += 1.2;
    body.velocity.z += (awayZ / length) * 1.8;
    body.angularVelocity.set(1.6, 0.4, -1.3);
    body.wakeUp();
  });
  return state;
}

function updateHumans(humans, tractorBody, deltaSeconds) {
  const patrolPoints = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
  for (const human of humans) {
    if (human.fallen || human.physicsObject?.active === false) continue;
    const dx = human.body.position.x - tractorBody.position.x;
    const dz = human.body.position.z - tractorBody.position.z;
    const distance = Math.hypot(dx, dz);
    human.fleeing = human.behavior !== 'waypoints' && human.fleeFromTractor && distance < 4;
    human.fleeBlend = moveToward(human.fleeBlend, human.fleeing ? 1 : 0, deltaSeconds / 1.05);
    let moveX = 0;
    let moveZ = 0;
    let speed = 0;
    human.animationMode = human.behavior === 'sit' ? 'sit' : 'stand';

    if (human.fleeing) {
      const length = distance || 1;
      moveX = dx / length;
      moveZ = dz / length;
      speed = 2.35;
      human.animationMode = 'walk';
    } else if (human.behavior === 'walk') {
      const point = patrolPoints[human.waypoint];
      const targetX = human.origin.x + point[0];
      const targetZ = human.origin.z + point[1];
      const targetDx = targetX - human.body.position.x;
      const targetDz = targetZ - human.body.position.z;
      const targetDistance = Math.hypot(targetDx, targetDz);
      if (targetDistance < 0.2) advanceHumanWaypoint(human, patrolPoints.length);
      else {
        if (targetDistance < human.lastTargetDistance - 0.05) {
          human.lastTargetDistance = targetDistance;
          human.stuckSeconds = 0;
        } else {
          human.stuckSeconds += deltaSeconds;
        }
        if (human.stuckSeconds >= 3) {
          advanceHumanWaypoint(human, patrolPoints.length);
          human.body.velocity.set(0, 0, 0);
          continue;
        }
        moveX = targetDx / targetDistance;
        moveZ = targetDz / targetDistance;
        speed = 1.05;
        human.animationMode = 'walk';
      }
    } else if (human.behavior === 'waypoints' && !human.routeComplete) {
      const waypoint = human.route[human.routeIndex];
      if (human.routeWaiting) {
        human.routeWaitRemaining -= deltaSeconds;
        if (human.routeWaitRemaining <= 0) advanceHumanRoute(human);
      } else if (waypoint) {
        const targetX = human.origin.x + waypoint[0];
        const targetZ = human.origin.z + waypoint[1];
        const targetDx = targetX - human.body.position.x;
        const targetDz = targetZ - human.body.position.z;
        const targetDistance = Math.hypot(targetDx, targetDz);
        if (targetDistance < 0.2) {
          human.routeWaiting = true;
          human.routeWaitRemaining = waypoint[2];
          human.lastTargetDistance = Infinity;
          human.stuckSeconds = 0;
          if (human.routeWaitRemaining <= 0) advanceHumanRoute(human);
        } else {
          if (targetDistance < human.lastTargetDistance - 0.05) {
            human.lastTargetDistance = targetDistance;
            human.stuckSeconds = 0;
          } else human.stuckSeconds += deltaSeconds;
          if (human.stuckSeconds >= 3) advanceHumanRoute(human);
          else {
            moveX = targetDx / targetDistance;
            moveZ = targetDz / targetDistance;
            speed = 1.05;
            human.animationMode = 'walk';
          }
        }
      }
    }

    if (human.behavior !== 'waypoints') {
      const minX = human.origin.x - 2.5;
      const maxX = human.origin.x + 2.5;
      const minZ = human.origin.z - 2.5;
      const maxZ = human.origin.z + 2.5;
      if ((human.body.position.x <= minX && moveX < 0) || (human.body.position.x >= maxX && moveX > 0)) moveX = 0;
      if ((human.body.position.z <= minZ && moveZ < 0) || (human.body.position.z >= maxZ && moveZ > 0)) moveZ = 0;
      human.body.position.x = Math.min(maxX, Math.max(minX, human.body.position.x));
      human.body.position.z = Math.min(maxZ, Math.max(minZ, human.body.position.z));
    }
    const transitionScale = human.fleeing
      ? Math.max(0.15, human.fleeBlend)
      : human.behavior === 'walk' || human.behavior === 'waypoints'
        ? 1
        : human.fleeBlend;
    human.body.velocity.set(moveX * speed * transitionScale, 0, moveZ * speed * transitionScale);
    if (speed > 0 && (moveX || moveZ)) {
      human.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(moveX, moveZ));
    }
    // Kinematic bodies are advanced by Cannon during the fixed world step.
    if (deltaSeconds === 0) human.body.velocity.set(0, 0, 0);
  }
}

function advanceHumanRoute(human) {
  human.routeWaiting = false;
  human.routeWaitRemaining = 0;
  human.lastTargetDistance = Infinity;
  human.stuckSeconds = 0;
  if (human.routeIndex < human.route.length - 1) human.routeIndex += 1;
  else if (human.routeLoop) human.routeIndex = 0;
  else human.routeComplete = true;
}

function advanceHumanWaypoint(human, waypointCount) {
  human.waypoint = (human.waypoint + 1) % waypointCount;
  human.lastTargetDistance = Infinity;
  human.stuckSeconds = 0;
}

function hashString(value) {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}

function addPostBody(world, groundBody, material, post) {
  const body = new CANNON.Body({
    mass: 2.2,
    material,
    linearDamping: 0.08,
    angularDamping: 0.12,
    allowSleep: false,
  });
  body.userData = { structuralDamage: post.structuralDamage ?? 0 };
  body.quaternion.setFromEuler(...post.rotation, 'XYZ');
  const centerOffset = body.quaternion.vmult(new CANNON.Vec3(0, POST_CENTER_OF_MASS_Y, 0));
  body.position.set(
    post.position[0] + centerOffset.x,
    post.position[1] + centerOffset.y,
    post.position[2] + centerOffset.z,
  );
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(POST_BASE_SIZE[0] / 2, POST_BASE_SIZE[1] / 2, POST_BASE_SIZE[2] / 2)),
    new CANNON.Vec3(0, POST_BASE_SIZE[1] / 2 - POST_CENTER_OF_MASS_Y, 0),
  );
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(POST_POLE_RADIUS, POST_POLE_HEIGHT / 2, POST_POLE_RADIUS)),
    new CANNON.Vec3(0, POST_POLE_CENTER_Y - POST_CENTER_OF_MASS_Y, 0),
  );
  world.addBody(body);

  const anchorBody = new CANNON.Body({ mass: 0 });
  anchorBody.position.set(...post.position);
  world.addBody(anchorBody);
  const anchor = new CANNON.PointToPointConstraint(
    body,
    new CANNON.Vec3(0, -POST_CENTER_OF_MASS_Y, 0),
    anchorBody,
    new CANNON.Vec3(0, 0, 0),
    100000,
  );
  world.addConstraint(anchor);

  const ballBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.KINEMATIC,
    material,
    linearDamping: 0.06,
    // cannon-es has no rolling-friction coefficient. Angular damping models
    // the small deformation losses that make a loose ball settle in reality.
    angularDamping: POST_BALL_ROLLING_DAMPING,
    allowSleep: true,
    sleepSpeedLimit: 0.08,
    sleepTimeLimit: 1.5,
  });
  ballBody.addShape(new CANNON.Sphere(POST_BALL_RADIUS));
  ballBody.collisionResponse = false;
  const ballOffset = body.quaternion.vmult(
    new CANNON.Vec3(0, POST_BALL_CENTER_Y - POST_CENTER_OF_MASS_Y, 0),
  );
  ballBody.position.set(
    body.position.x + ballOffset.x,
    body.position.y + ballOffset.y,
    body.position.z + ballOffset.z,
  );
  ballBody.quaternion.copy(body.quaternion);
  world.addBody(ballBody);

  const state = {
    id: post.id,
    isRed: post.classification === 'red',
    isYellow: post.classification !== 'red',
    body,
    ballBody,
    anchor,
    anchorBody,
    anchored: true,
    ballAttached: true,
    movedCompletely: false,
    redContactPending: false,
    contactExemptionGiven: false,
    originalPosition: new CANNON.Vec3(...post.position),
  };

  body.addEventListener('collide', (event) => {
    if (event.body === groundBody) return;
    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (event.body.name === 'tractor-chassis' && state.isRed && !state.contactExemptionGiven) {
      state.redContactPending = true;
    }
    if (impact > 0.08) detachPostBall(state);
    if (impact > 1.05) knockPostDown(world, state);
  });

  return state;
}

function updatePostScoring(posts) {
  const displacementRequired = Math.hypot(POST_BASE_SIZE[0], POST_BASE_SIZE[2]);
  for (const post of posts) {
    if (post.movedCompletely) continue;
    const centerOffset = post.body.quaternion.vmult(new CANNON.Vec3(0, POST_CENTER_OF_MASS_Y, 0));
    const rootX = post.body.position.x - centerOffset.x;
    const rootZ = post.body.position.z - centerOffset.z;
    if (Math.hypot(rootX - post.originalPosition.x, rootZ - post.originalPosition.z) >= displacementRequired) {
      post.movedCompletely = true;
    }
  }
}

function detachPostBall(post) {
  if (!post.ballAttached) return;
  post.ballAttached = false;
  const releaseVelocity = new CANNON.Vec3();
  post.body.getVelocityAtWorldPoint(post.ballBody.position, releaseVelocity);
  post.ballBody.type = CANNON.Body.DYNAMIC;
  post.ballBody.mass = 0.08;
  post.ballBody.collisionResponse = true;
  post.ballBody.updateMassProperties();
  post.ballBody.velocity.copy(releaseVelocity);
  post.ballBody.angularVelocity.copy(post.body.angularVelocity);
  post.ballBody.wakeUp();
}

function knockPostDown(world, post) {
  if (!post.anchored) return;
  detachPostBall(post);
  world.removeConstraint(post.anchor);
  post.anchored = false;
  post.body.linearDamping = 0.24;
  post.body.angularDamping = 0.48;
}

function updateAttachedPostBalls(posts) {
  for (const post of posts) {
    if (!post.ballAttached) continue;
    const offset = post.body.quaternion.vmult(
      new CANNON.Vec3(0, POST_BALL_CENTER_Y - POST_CENTER_OF_MASS_Y, 0),
    );
    post.ballBody.position.set(
      post.body.position.x + offset.x,
      post.body.position.y + offset.y,
      post.body.position.z + offset.z,
    );
    post.ballBody.quaternion.copy(post.body.quaternion);
    post.body.getVelocityAtWorldPoint(post.ballBody.position, post.ballBody.velocity);
  }
}

function updatePostSprings(posts) {
  const worldUp = new CANNON.Vec3(0, 1, 0);
  for (const post of posts) {
    if (!post.anchored) continue;
    const postUp = post.body.quaternion.vmult(worldUp);
    const correction = postUp.cross(worldUp);
    post.body.torque.x += correction.x * 18 - post.body.angularVelocity.x * 1.4;
    post.body.torque.y += correction.y * 18 - post.body.angularVelocity.y * 0.25;
    post.body.torque.z += correction.z * 18 - post.body.angularVelocity.z * 1.4;
  }
}

function addObstacleBodies(world, material, startPose) {
  for (const obstacle of obstacles) {
    const body = new CANNON.Body({ mass: 0, material });
    const position = obstacleWorldPosition(obstacle, startPose);
    body.position.set(...position);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), startPose.yaw);

    if (obstacle.type === 'ramp') {
      const { vertices, indices } = rampGeometry(obstacle.size);
      body.addShape(new CANNON.Trimesh(vertices, indices));
    } else {
      const [width, height, depth] = obstacle.size;
      body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
    }

    world.addBody(body);
  }
}

function addWheel(vehicle, commonOptions, connection, radius, isFrontWheel) {
  vehicle.addWheel({
    ...commonOptions,
    chassisConnectionPointLocal: new CANNON.Vec3(...connection),
    radius,
    isFrontWheel,
  });
}

function moveToward(value, target, amount) {
  if (value < target) return Math.min(value + amount, target);
  if (value > target) return Math.max(value - amount, target);
  return target;
}

function manualGearRatio(gear, ratios) {
  if (gear === 'R') return ratios[0];
  return ratios[Number(gear) - 1] ?? 0;
}
