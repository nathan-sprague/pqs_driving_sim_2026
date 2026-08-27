import * as THREE from 'three';
import { formatHighScore, saveHighScore } from '../config/highScores.js';
import { loadOpenWorldSave, saveOpenWorld } from '../config/openWorldSave.js';
import { loadTractor } from './tractor/loadTractor.js';
import { createTractorPhysics } from './physics/createTractorPhysics.js';
import { createMapBlockVisuals, createObstacleVisuals } from './obstacles/createObstacleVisuals.js';
import { createTextDisplay } from './createTextDisplay.js';
import { createInfiniteGround } from './ground/createInfiniteGround.js';
import { createProceduralCity } from './city/createProceduralCity.js';
import { loadTractorConfig } from '../config/tractor.js';

const startPoses = {
  pull: { position: [0, -0.1, -3], yaw: 0 },
  maneuver: { position: [4, -0.1, -3], yaw: Math.PI },
  durability: { position: [-10, -0.1, -3], yaw: Math.PI / 2 },
};
const DURABILITY_DURATION_SECONDS = 6 * 60;
const CHUNK_LOAD_MARGIN_METRES = 8;
const CHUNK_UNLOAD_MARGIN_METRES = 12;
const CHUNK_STREAM_INTERVAL_MS = 250;
const RECENT_THRESHOLD_DURATION_MS = 10_000;

export function createWorld(container, { eventId, map = null, onReady, showFps = false } = {}) {
  const openWorldSaving = eventId === 'open_world';
  const tractorConfig = loadTractorConfig();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaec4ce);
  scene.fog = new THREE.Fog(0xaec4ce, 18, 50);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
  const speedDisplay = createSpeedDisplay();
  const hitchForceHud = createHitchForceHud();
  const durabilityHud = createDurabilityHud();
  const maneuverabilityHud = createManeuverabilityHud();
  const nitroHud = createNitroHud();
  const scoreSummary = createScoreSummary(openWorldSaving);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  container.append(hitchForceHud.root);
  container.append(durabilityHud.root);
  container.append(maneuverabilityHud.root);
  container.append(nitroHud.root);
  container.append(scoreSummary.root);
  const fpsDisplay = showFps ? document.createElement('div') : null;
  if (fpsDisplay) {
    fpsDisplay.className = 'fps-display';
    fpsDisplay.textContent = '-- FPS\nLoaded chunks: --\nPhysics chunks: --\nThresholds (last 10s):\n  None';
    container.append(fpsDisplay);
  }
  const thresholdMessage = document.createElement('div');
  thresholdMessage.className = 'threshold-message';
  thresholdMessage.setAttribute('role', 'status');
  thresholdMessage.setAttribute('aria-live', 'polite');
  container.append(thresholdMessage);
  const highScorePopup = createHighScorePopup();
  container.append(highScorePopup.root);

  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x76563b, 2.2));
  const sun = new THREE.DirectionalLight(0xfff3db, 4.5);
  sun.position.set(-4, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  scene.add(sun);

  const textureLoader = new THREE.TextureLoader();
  const groundTexture = textureLoader.load('/assets/textures/dirt.webp');
  const infiniteGround = createInfiniteGround(groundTexture);
  const groundTrackingPosition = new THREE.Vector3();
  infiniteGround.update(groundTrackingPosition);
  scene.add(infiniteGround.root);

  textureLoader.load('/assets/textures/skycube.webp', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
  });

  let tractor;
  let tractorPhysics;
  let breakdownSmoke = null;
  let proceduralCity = null;
  let playerBody = null;
  let driving = true;
  let carriedObjectId = null;
  let cabEyePosition = [-0.3, 1.7, 0];
  let cabEyeBaseYaw = -Math.PI / 2;
  const pose = map?.vehicleStart ?? startPoses[eventId] ?? startPoses.pull;
  const poseRotation = pose.rotation ?? [0, pose.yaw ?? 0, 0];
  const mapVisuals = map ? createMapBlockVisuals(map.blocks) : null;
  const waypointHud = createWaypointHud(container, map?.blocks.filter((block) => block.type === 'waypoint') ?? []);
  const chunkRegions = map?.blocks.filter((block) => block.type === 'chunk') ?? [];
  const chunkActiveStates = new Map();
  const chunkProximityStates = new Map();
  const chunkPlayerPosition = new THREE.Vector3();
  const chunkLocalPosition = new THREE.Vector3();
  const chunkQuaternion = new THREE.Quaternion();
  const chunkEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  let nextChunkStreamUpdate = 0;
  scene.add(mapVisuals ?? createObstacleVisuals(pose));

  loadTractor(tractorConfig.modelId).then((loadedTractor) => {
    tractor = loadedTractor;
    tractor.position.set(...pose.position);
    tractor.rotation.set(...poseRotation, 'XYZ');

    const eyeLevel = tractor.userData.placement.eyeLevel;
    cabEyePosition = eyeLevel?.position ?? [-0.3, 1.7, 0];
    camera.position.fromArray(cabEyePosition);
    const personYaw = eyeLevel?.rotation?.[1] ?? Math.PI / 2;
    cabEyeBaseYaw = personYaw - Math.PI;
    eyeBaseYaw = cabEyeBaseYaw;
    updateLook();
    tractor.userData.assembly.add(camera);
    const displayPlacement = tractor.userData.placement.display;
    speedDisplay.group.position.fromArray(displayPlacement?.position ?? [0.6, 1.2, 0.1]);
    speedDisplay.group.rotation.fromArray(displayPlacement?.rotation ?? [0, -Math.PI / 2, 0]);
    speedDisplay.group.scale.fromArray(displayPlacement?.scale ?? [1, 1, 1]);
    tractor.userData.assembly.add(speedDisplay.group);
    breakdownSmoke = createBreakdownSmoke();
    tractor.add(breakdownSmoke.group);
    scene.add(tractor);
    tractorPhysics = createTractorPhysics(pose, map?.blocks ?? null, { ...tractorConfig, bounds: tractor.userData.placement.bounds });
    if (map) {
      proceduralCity = createProceduralCity(map.blocks, tractorPhysics);
      scene.add(proceduralCity.root);
    }
    for (const chunk of chunkRegions) setChunkActive(chunk.id, chunk.initiallyLoaded !== false);
    for (const block of map?.blocks.filter((candidate) => ['box', 'waypoint', 'threshold'].includes(candidate.type) && candidate.initiallyActive === false) ?? []) {
      setObjectActive(block.id, false);
    }
    tractorPhysics.syncVisual(tractor, mapVisuals);
    onReady?.();
  }).catch((error) => {
    console.error('Unable to load the tractor model.', error);
    onReady?.();
  });

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  let lookYaw = 0;
  let lookPitch = 0;
  let eyeBaseYaw = -Math.PI / 2;
  const updateLook = () => {
    camera.rotation.set(lookPitch, eyeBaseYaw + lookYaw, 0, 'YXZ');
  };
  updateLook();

  let paused = false;
  let pausedAt = 0;
  const lockPointer = () => { if (!paused) renderer.domElement.requestPointerLock(); };
  const handleMouseLook = (event) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    lookYaw -= event.movementX * 0.0025;
    lookPitch -= event.movementY * 0.0025;
    lookPitch = THREE.MathUtils.clamp(lookPitch, -Math.PI / 2 + 0.15, Math.PI / 2 - 0.15);
    updateLook();
  };
  renderer.domElement.addEventListener('click', lockPointer);
  document.addEventListener('mousemove', handleMouseLook);

  const input = {
    left: false, right: false, throttle: false, reverse: false, clutch: false,
    gear: tractorConfig.transmission === 'manual' ? 'N' : 1,
  };
  const controlKeys = {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'throttle',
    KeyS: 'reverse',
    KeyC: 'clutch',
  };
  const walkingKeys = new Set();
  const handleKey = (event, pressed) => {
    const control = controlKeys[event.code];
    if (!control) return;
    if (!driving) {
      if (pressed) walkingKeys.add(event.code);
      else walkingKeys.delete(event.code);
      event.preventDefault();
      return;
    }
    input[control] = pressed;
    event.preventDefault();
  };
  const manualGears = Object.fromEntries(Array.from({ length: tractorConfig.gearCount }, (_, index) => [`Digit${index + 1}`, index + 1]));
  manualGears.KeyR = 'R';
  manualGears.KeyN = 'N';
  manualGears.Digit0 = 'N';
  const handleKeyDown = (event) => {
    if (event.code === 'Escape' && !event.repeat) {
      setPaused(!paused);
      event.preventDefault();
      return;
    }
    if (paused) {
      event.preventDefault();
      return;
    }
    if (event.code === 'Tab') {
      scoreSummary.setVisible(true);
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyE' && !event.repeat) {
      if (driving) exitTractor();
      else if (carriedObjectId) {
        tractorPhysics?.dropCarriedObject();
        carriedObjectId = null;
        updateManualHelp();
      } else if (!tryRightTractor() && !tryPickUpMovableObject() && !tryOpenCityDoor()) tryEnterTractor();
      event.preventDefault();
      return;
    }
    if (!driving && event.code === 'Space' && !event.repeat) {
      if (tractorPhysics?.isWalkingPlayerGrounded(playerBody)) {
        playerBody.velocity.y = 3.2;
        playerBody.wakeUp();
      }
      event.preventDefault();
      return;
    }
    if (!driving && (event.code === 'ShiftLeft' || event.code === 'ShiftRight')) walkingKeys.add(event.code);
    if (event.code === 'KeyP' && !event.repeat) {
      if (tractorPhysics?.releaseTowable() === 'cart') finishDurability('disqualified');
      event.preventDefault();
    }
    if (tractorConfig.transmission === 'manual' && event.code === 'Enter') {
      tractorPhysics?.restartEngine();
      event.preventDefault();
    }
    if (tractorConfig.transmission === 'manual' && input.clutch && manualGears[event.code]) {
      input.gear = manualGears[event.code];
      updateManualHelp();
      event.preventDefault();
    }
    handleKey(event, true);
  };
  const handleKeyUp = (event) => {
    if (event.code === 'Tab') {
      scoreSummary.setVisible(false);
      event.preventDefault();
      return;
    }
    walkingKeys.delete(event.code);
    handleKey(event, false);
  };
  const clearInput = () => {
    scoreSummary.setVisible(false);
    walkingKeys.clear();
    Object.keys(input).forEach((key) => { if (key !== 'gear') input[key] = false; });
  };
  const setPaused = (nextPaused) => {
    if (paused === nextPaused) return;
    paused = nextPaused;
    if (paused) {
      pausedAt = performance.now();
      clearInput();
      scoreSummary.setPaused(true);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      return;
    }
    const pauseDuration = performance.now() - pausedAt;
    scoringStartTime = shiftTime(scoringStartTime, pauseDuration);
    durabilityStartTime = shiftTime(durabilityStartTime, pauseDuration);
    scoringHudHideAt = shiftTime(scoringHudHideAt, pauseDuration);
    scoringIncompleteUntil = shiftTime(scoringIncompleteUntil, pauseDuration);
    messageVisibleUntil = shiftTime(messageVisibleUntil, pauseDuration);
    scoreSummary.setPaused(false);
  };
  let hadPointerLock = document.pointerLockElement === renderer.domElement;
  const handlePointerLockChange = () => {
    const lockedToGame = document.pointerLockElement === renderer.domElement;
    if (lockedToGame) {
      hadPointerLock = true;
      return;
    }
    if (!hadPointerLock) return;
    hadPointerLock = false;
    if (!paused) setPaused(true);
  };
  scoreSummary.root.querySelector('[data-score-back]').addEventListener('click', () => setPaused(false));
  scoreSummary.root.querySelector('[data-score-save]')?.addEventListener('click', () => {
    if (!tractorPhysics) return scoreSummary.setSaveStatus('Tractor is still loading.');
    const saved = saveOpenWorld(tractorPhysics.getTractorPose(), completedScores());
    scoreSummary.setSaveStatus(saved ? 'Open world saved.' : 'Unable to save.');
  });
  scoreSummary.root.querySelector('[data-score-load]')?.addEventListener('click', () => {
    if (!tractorPhysics) return scoreSummary.setSaveStatus('Tractor is still loading.');
    const save = loadOpenWorldSave();
    if (!save) return scoreSummary.setSaveStatus('No open-world save found.');
    tractorPhysics.releaseTowable();
    tractorPhysics.setTractorPose(save.pose);
    loadedEventScores = save.scores;
    scoringStartTime = null;
    scoringStartStats = null;
    scoringFinishSeconds = null;
    scoringFinishStats = null;
    scoringDisqualified = false;
    scoringHudHideAt = null;
    scoringIncompleteUntil = null;
    durabilityStartTime = null;
    durabilityFinished = false;
    durabilityResult = '';
    durabilityLaps = 0;
    durabilityLapPt1Crossed = false;
    durabilityLapPt2Crossed = false;
    pullingStarted = false;
    pullingWasAttached = false;
    pullingStartDistanceMetres = null;
    pullingFinishDistanceMetres = null;
    scoreSummary.setSaveStatus('Open-world save loaded.');
  });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', clearInput);
  document.addEventListener('pointerlockchange', handlePointerLockChange);
  const sceneNote = container.parentElement?.querySelector('.scene-note');
  updateManualHelp();
  function updateManualHelp() {
    if (sceneNote && !driving) {
      sceneNote.textContent = carriedObjectId
        ? 'On foot · Carrying object · E drop · W/A/S/D move · Space jump · Shift run'
        : 'On foot · E carry / open door / enter tractor / right overturned tractor · W/A/S/D move';
    } else if (sceneNote && tractorConfig.transmission === 'manual') {
      sceneNote.textContent = `W throttle · S brake · P release hitch · Enter restart · Hold C + 1–${tractorConfig.gearCount} / R / N to shift · Gear ${input.gear}`;
    } else if (sceneNote) {
      sceneNote.textContent = 'W forward · S reverse · A / D steer · E exit tractor · Click to look';
    }
  }

  function exitTractor() {
    if (!tractor || !tractorPhysics || !driving) return;
    clearInput();
    scene.attach(camera);
    const worldRotation = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    eyeBaseYaw = 0;
    lookYaw = worldRotation.y;
    lookPitch = worldRotation.x;
    const exitPosition = tractorPhysics.isTractorFlipped()
      ? tractor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 1.5))
      : tractor.localToWorld(new THREE.Vector3(0, 0.9, 1.25));
    playerBody = tractorPhysics.createWalkingPlayer(exitPosition.toArray());
    camera.position.set(exitPosition.x, exitPosition.y + 0.7, exitPosition.z);
    driving = false;
    updateLook();
    updateManualHelp();
  }

  function tryEnterTractor() {
    if (!tractor || !playerBody || driving) return;
    const tractorTarget = tractor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0));
    const playerPosition = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z);
    const distance = playerPosition.distanceTo(tractorTarget);
    const toTractor = tractorTarget.sub(camera.position).normalize();
    const lookDirection = camera.getWorldDirection(new THREE.Vector3());
    if (distance > 2 || lookDirection.dot(toTractor) < 0.72) return;
    tractorPhysics.removeWalkingPlayer(playerBody);
    playerBody = null;
    tractor.userData.assembly.add(camera);
    camera.position.fromArray(cabEyePosition);
    eyeBaseYaw = cabEyeBaseYaw;
    lookYaw = 0;
    lookPitch = 0;
    driving = true;
    updateLook();
    updateManualHelp();
  }

  function tryRightTractor() {
    if (!tractor || !tractorPhysics?.isTractorFlipped() || !playerBody) return false;
    const tractorPosition = tractor.getWorldPosition(new THREE.Vector3());
    const horizontalDistance = Math.hypot(
      playerBody.position.x - tractorPosition.x,
      playerBody.position.z - tractorPosition.z,
    );
    if (horizontalDistance > 4) return false;
    return tractorPhysics.rightTractor();
  }

  function tryPickUpMovableObject() {
    if (!tractorPhysics || !playerBody) return false;
    const from = new THREE.Vector3(playerBody.position.x, playerBody.position.y + 0.7, playerBody.position.z);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const to = from.clone().addScaledVector(direction, 3);
    carriedObjectId = tractorPhysics.pickUpMovableObject(from.toArray(), to.toArray());
    if (!carriedObjectId) return false;
    updateManualHelp();
    return true;
  }

  function tryOpenCityDoor() {
    if (!proceduralCity || !playerBody) return false;
    return proceduralCity.tryOpenDoor(new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z));
  }

  let frameId;
  let previousTime = performance.now();
  let simulationStartTime = null;
  let scoringStartTime = null;
  let scoringFinishSeconds = null;
  let scoringStartStats = null;
  let scoringFinishStats = null;
  let scoringDisqualified = false;
  let scoringHudHideAt = null;
  let scoringIncompleteUntil = null;
  let durabilityStartTime = null;
  let durabilityLaps = 0;
  let durabilityLapPt1Crossed = false;
  let durabilityLapPt2Crossed = false;
  let durabilityFinished = false;
  let durabilityResult = '';
  let pullingStartDistanceMetres = null;
  let pullingFinishDistanceMetres = null;
  let loadedEventScores = {};
  let pullingStarted = false;
  let pullingWasAttached = false;
  let messageVisibleUntil = 0;
  let fpsFrameCount = 0;
  let fpsSampleStartedAt = performance.now();
  const recentThresholds = [];
  const handledThresholds = new Set();
  const animate = (time) => {
    const deltaSeconds = Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;
    if (!paused && tractorPhysics && tractor) {
      if (simulationStartTime === null) simulationStartTime = time;
      breakdownSmoke?.update(deltaSeconds);
      if (!driving && playerBody) updateWalkingPlayer(deltaSeconds);
      if (!driving && carriedObjectId) {
        const carryPosition = new THREE.Vector3(playerBody.position.x, playerBody.position.y + 0.65, playerBody.position.z)
          .addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 1.8);
        tractorPhysics.updateCarriedObject(carryPosition.toArray());
      }
      tractorPhysics.step(deltaSeconds, input);
      if (carriedObjectId && !tractorPhysics.getCarriedObjectId()) {
        carriedObjectId = null;
        updateManualHelp();
      }
      tractorPhysics.syncVisual(tractor, mapVisuals);
      if (!driving && playerBody) camera.position.set(
        playerBody.position.x,
        playerBody.position.y + 0.7,
        playerBody.position.z,
      );
      if (time >= nextChunkStreamUpdate) {
        updateProximityChunks();
        nextChunkStreamUpdate = time + CHUNK_STREAM_INTERVAL_MS;
      }
      camera.getWorldPosition(groundTrackingPosition);
      infiniteGround.update(groundTrackingPosition);
      proceduralCity?.update(groundTrackingPosition, time / 1000, deltaSeconds);
      mapVisuals?.userData.updateHumanAnimations?.(deltaSeconds);
      waypointHud.update(camera);
      const telemetry = tractorPhysics.getTelemetry();
      hitchForceHud.update(telemetry, deltaSeconds);
      nitroHud.update(telemetry.nitroInstalled);
      const actions = telemetry.thresholdActions;
      const autoStartManeuverability = eventId === 'maneuver' || eventId === 'manueverability';
      if (scoringStartTime === null && autoStartManeuverability && !hasStartAction(actions, 'maneuver')) {
        startManeuverability(time, telemetry);
      }
      if (durabilityStartTime === null && telemetry.attachedCarts > 0) durabilityStartTime = time;
      if (!durabilityFinished && (
        telemetry.trailerStructuralDurability <= 0
        || telemetry.trailerDrivelineDurability <= 0
      )) finishDurability('broken');
      if (durabilityFinished && telemetry.attachedCarts > 0) tractorPhysics.releaseCart();
      const pullingAttached = telemetry.attachedPullingSleds > 0;
      if (pullingAttached && !pullingWasAttached) {
        pullingStarted = true;
        if (pullingFinishDistanceMetres !== null) {
          pullingFinishDistanceMetres = null;
          pullingStartDistanceMetres = telemetry.distanceMetres;
        }
        pullingStartDistanceMetres ??= telemetry.distanceMetres;
      }
      if (!pullingAttached && pullingWasAttached && pullingStarted && pullingFinishDistanceMetres === null) {
        pullingFinishDistanceMetres = Math.max(0, telemetry.pullingSledDistanceMetres);
        recordHighScore('pulling', pullingFinishDistanceMetres * 3.28084 * 2, 'Tractor Pull');
      }
      pullingWasAttached = pullingAttached;

      for (const trigger of telemetry.thresholdTriggers) {
        const triggerKey = `${trigger.id}:${trigger.crossingCount}`;
        if (handledThresholds.has(triggerKey)) continue;
        handledThresholds.add(triggerKey);
        if (fpsDisplay) recentThresholds.push({ name: trigger.name || trigger.id, crossedAt: time });
        if (trigger.action === 'maneuver-start') {
          if (scoringStartTime === null) startManeuverability(time, telemetry);
          else if (scoringFinishSeconds === null && time - scoringStartTime > 5000) {
            if (telemetry.redPostsKnocked >= telemetry.redPostsTotal) finishManeuverability(time, telemetry);
            else scoringIncompleteUntil = time + 3000;
          }
        }
        if (trigger.action === 'all-start') startManeuverability(time, telemetry);
        if (trigger.action === 'pulling-start' || trigger.action === 'all-start') pullingStartDistanceMetres ??= telemetry.distanceMetres;
        if (trigger.action === 'maneuver-stop') finishManeuverability(time, telemetry, true);
        if (trigger.action === 'all-stop') finishManeuverability(time, telemetry);
        if (trigger.action === 'lap-pt1') durabilityLapPt1Crossed = true;
        if (trigger.action === 'lap-pt2') durabilityLapPt2Crossed = true;
        if (trigger.action === 'durability-disqualify') finishDurability('disqualified', time);
        if (trigger.action === 'clear-breakdown-smoke') {
          breakdownSmoke?.stop();
          tractorPhysics.resetDurability();
          if (durabilityResult === 'broken') {
            durabilityFinished = false;
            durabilityResult = '';
          }
          if (thresholdMessage.textContent === 'RETURN TO THE PIT') {
            thresholdMessage.classList.remove('is-visible');
            messageVisibleUntil = 0;
          }
        }
        if ((trigger.action === 'pulling-stop' || trigger.action === 'all-stop') && pullingStartDistanceMetres !== null) {
          pullingFinishDistanceMetres ??= Math.max(0, telemetry.distanceMetres - pullingStartDistanceMetres);
        }
        if (trigger.action === 'message') {
          thresholdMessage.textContent = trigger.message || 'Checkpoint reached';
          thresholdMessage.classList.add('is-visible');
          messageVisibleUntil = time + trigger.messageDuration * 1000;
        }
        if (trigger.action === 'stop-tractor') tractorPhysics.freezeFor(trigger.stopDuration);
        if (trigger.action === 'objects') {
          for (const change of trigger.objectChanges) setObjectActive(change.id, change.action === 'add');
        }
        if (trigger.action === 'chunks') {
          for (const change of trigger.chunkChanges) setChunkActive(change.id, change.action === 'load');
        }
      }
      if (!durabilityFinished && durabilityLapPt1Crossed && durabilityLapPt2Crossed
        && durabilityStartTime !== null && (time - durabilityStartTime) / 1000 < DURABILITY_DURATION_SECONDS) {
        durabilityLaps += 1;
        durabilityLapPt1Crossed = false;
        durabilityLapPt2Crossed = false;
      }
      if (time >= messageVisibleUntil) thresholdMessage.classList.remove('is-visible');

      const liveScoringSeconds = scoringStartTime === null ? 0 : (time - scoringStartTime) / 1000;
      const scoringTime = scoringFinishSeconds ?? liveScoringSeconds;
      if (scoringStartTime !== null && scoringFinishSeconds === null && liveScoringSeconds >= 300) {
        finishManeuverability(time, telemetry);
      }
      const liveScoringStats = maneuverabilityStatsSince(telemetry, scoringStartStats);
      const scoringStats = scoringFinishStats ?? liveScoringStats;
      maneuverabilityHud.update({
        active: scoringStartTime !== null && (scoringHudHideAt === null || time < scoringHudHideAt),
        finished: scoringFinishSeconds !== null,
        disqualified: scoringDisqualified,
        result: scoringDisqualified
          ? 'disqualified'
          : scoringFinishSeconds !== null
            ? 'complete'
            : scoringIncompleteUntil !== null && time < scoringIncompleteUntil ? 'incomplete' : '',
        elapsedSeconds: scoringTime,
        ...scoringStats,
      }, deltaSeconds);
      const liveDistanceMetres = pullingStartDistanceMetres === null
        ? 0
        : Math.max(0, telemetry.distanceMetres - pullingStartDistanceMetres);
      const scoringDistanceFeet = (pullingFinishDistanceMetres ?? liveDistanceMetres) * 3.28084;
      const durabilityTime = durabilityStartTime === null ? 0 : (time - durabilityStartTime) / 1000;
      const durabilityRemainingSeconds = Math.max(0, DURABILITY_DURATION_SECONDS - durabilityTime);
      if (!durabilityFinished && durabilityStartTime !== null && durabilityRemainingSeconds <= 0) finishDurability('complete');
      durabilityHud.update(
        telemetry,
        durabilityRemainingSeconds,
        durabilityLaps,
        telemetry.attachedCarts > 0,
        durabilityResult,
      );
      scoreSummary.update({
        maneuverability: scoringStartTime === null
          ? savedScoreState('maneuverability')
          : scoringFinishSeconds === null
            ? { state: 'active' }
            : { state: 'complete', score: maneuverabilityScore(scoringFinishSeconds, scoringFinishStats) },
        durability: durabilityStartTime === null
          ? savedScoreState('durability')
          : !durabilityFinished
            ? { state: 'active' }
            : { state: 'complete', score: durabilityLaps * 10 },
        pulling: !pullingStarted
          ? savedScoreState('pulling')
          : pullingFinishDistanceMetres === null
            ? { state: 'active' }
            : { state: 'complete', score: pullingFinishDistanceMetres * 3.28084 * 2 },
      });
      if (tractorConfig.transmission === 'manual') {
        speedDisplay.display.setText(Math.round(telemetry.engineRpm), 'RPM');
      } else {
        speedDisplay.display.setText((telemetry.speedMps * 2.23694).toFixed(1), 'MPH');
      }
      mapVisuals?.userData.updateSigns?.({
        elapsedSeconds: durabilityTime,
        distanceFeet: scoringDistanceFeet,
      });
    }
    renderer.render(scene, camera);
    if (fpsDisplay) {
      fpsFrameCount += 1;
      const fpsElapsed = time - fpsSampleStartedAt;
      if (fpsElapsed >= 500) {
        const loadedChunks = chunkRegions
          .filter((chunk) => chunkActiveStates.get(chunk.id))
          .map((chunk) => chunk.name);
        const physicsChunks = chunkRegions
          .filter((chunk) => chunk.objectIds.some((id) => tractorPhysics?.isObjectPhysicsActive(id)))
          .map((chunk) => chunk.name);
        const formatChunkList = (chunks) => chunks.length ? chunks.map((name) => `  • ${name}`).join('\n') : '  None';
        while (recentThresholds.length && time - recentThresholds[0].crossedAt >= RECENT_THRESHOLD_DURATION_MS) {
          recentThresholds.shift();
        }
        fpsDisplay.textContent = `${Math.round(fpsFrameCount * 1000 / fpsElapsed)} FPS\n`
          + `Loaded chunks:\n${formatChunkList(loadedChunks)}\n`
          + `Physics chunks:\n${formatChunkList(physicsChunks)}\n`
          + `Thresholds (last 10s):\n${formatChunkList(recentThresholds.map((threshold) => threshold.name))}`;
        fpsFrameCount = 0;
        fpsSampleStartedAt = time;
      }
    }
    frameId = requestAnimationFrame(animate);
  };
  animate(performance.now());

  function updateWalkingPlayer(deltaSeconds) {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    direction.y = 0;
    direction.normalize();
    const right = new THREE.Vector3(-direction.z, 0, direction.x);
    const movement = new THREE.Vector3();
    if (walkingKeys.has('KeyW')) movement.add(direction);
    if (walkingKeys.has('KeyS')) movement.sub(direction);
    if (walkingKeys.has('KeyD')) movement.add(right);
    if (walkingKeys.has('KeyA')) movement.sub(right);
    if (movement.lengthSq()) movement.normalize();
    const running = walkingKeys.has('ShiftLeft') || walkingKeys.has('ShiftRight');
    movement.multiplyScalar(running ? 5.1 : 3.3);
    if (tractorPhysics.isWalkingPlayerGrounded(playerBody)) {
      playerBody.velocity.x = movement.x;
      playerBody.velocity.z = movement.z;
      return;
    }
    const horizontalVelocity = new THREE.Vector3(playerBody.velocity.x, 0, playerBody.velocity.z);
    const velocityChange = movement.sub(horizontalVelocity).clampLength(0, 2.5 * deltaSeconds);
    playerBody.velocity.x += velocityChange.x;
    playerBody.velocity.z += velocityChange.z;
  }

  return {
    dispose() {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', lockPointer);
      document.removeEventListener('mousemove', handleMouseLook);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearInput);
      tractorPhysics?.removeWalkingPlayer(playerBody);
      tractorPhysics?.dropCarriedObject();
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      breakdownSmoke?.dispose();
      infiniteGround.dispose();
      proceduralCity?.dispose();
      thresholdMessage.remove();
      highScorePopup.dispose();
      hitchForceHud.root.remove();
      durabilityHud.root.remove();
      maneuverabilityHud.root.remove();
      nitroHud.root.remove();
      scoreSummary.root.remove();
      waypointHud.dispose();
      fpsDisplay?.remove();
    },
  };

  function startManeuverability(time, telemetry) {
    if (scoringStartTime !== null) return;
    scoringStartTime = time;
    scoringStartStats = maneuverabilityTelemetrySnapshot(telemetry);
  }

  function finishManeuverability(time, telemetry, disqualified = false) {
    if (scoringStartTime === null || scoringFinishSeconds !== null) return;
    scoringFinishSeconds = (time - scoringStartTime) / 1000;
    scoringFinishStats = maneuverabilityStatsSince(telemetry, scoringStartStats);
    scoringDisqualified = disqualified;
    scoringHudHideAt = time + 10000;
    if (!disqualified) recordHighScore(
      'maneuverability',
      maneuverabilityScore(scoringFinishSeconds, scoringFinishStats),
      'Maneuverability',
    );
  }

  function finishDurability(result, time = performance.now()) {
    if (durabilityFinished) return;
    durabilityStartTime ??= time;
    durabilityFinished = true;
    durabilityResult = result;
    durabilityLapPt1Crossed = false;
    durabilityLapPt2Crossed = false;
    if (result === 'complete') recordHighScore('durability', durabilityLaps * 10, 'Durability');
    if (result === 'broken') {
      tractorPhysics?.freezeFor(5);
      breakdownSmoke?.start();
      thresholdMessage.textContent = 'RETURN TO THE PIT';
      thresholdMessage.classList.add('is-visible');
      messageVisibleUntil = Infinity;
    }
    tractorPhysics?.releaseCart();
  }

  function savedScoreState(id) {
    return Number.isFinite(loadedEventScores[id])
      ? { state: 'complete', score: loadedEventScores[id] }
      : { state: 'not-started' };
  }

  function completedScores() {
    return {
      ...loadedEventScores,
      ...(scoringFinishSeconds !== null && !scoringDisqualified
        ? { maneuverability: maneuverabilityScore(scoringFinishSeconds, scoringFinishStats) } : {}),
      ...(durabilityFinished && durabilityResult === 'complete' ? { durability: durabilityLaps * 10 } : {}),
      ...(pullingFinishDistanceMetres !== null ? { pulling: pullingFinishDistanceMetres * 3.28084 * 2 } : {}),
    };
  }

  function recordHighScore(scoreEventId, score, eventName) {
    if (saveHighScore(scoreEventId, score)) highScorePopup.show(eventName, score);
  }

  function setObjectActive(id, active) {
    mapVisuals?.userData.setObjectActive?.(id, active);
    waypointHud.setActive(id, active);
    tractorPhysics?.setObjectActive(id, active);
  }

  function setChunkActive(id, active) {
    const chunk = chunkRegions.find((candidate) => candidate.id === id);
    if (!chunk) return;
    if (chunkActiveStates.get(id) === active) return;
    chunkActiveStates.set(id, active);
    for (const objectId of chunk.objectIds) setObjectActive(objectId, active);
  }

  function updateProximityChunks() {
    if (!chunkRegions.length) return;
    const playerPosition = driving
      ? tractor.getWorldPosition(chunkPlayerPosition)
      : chunkPlayerPosition.set(playerBody.position.x, playerBody.position.y, playerBody.position.z);
    for (const chunk of chunkRegions) {
      // Initially-unloaded chunks are explicitly threshold-controlled. Player
      // proximity must never make them appear before a load threshold fires.
      if (chunk.initiallyLoaded === false) continue;
      const active = chunkActiveStates.get(chunk.id) ?? false;
      const margin = active ? CHUNK_UNLOAD_MARGIN_METRES : CHUNK_LOAD_MARGIN_METRES;
      chunkLocalPosition.set(
        playerPosition.x - chunk.position[0],
        0,
        playerPosition.z - chunk.position[2],
      );
      chunkQuaternion.setFromEuler(chunkEuler.set(...chunk.rotation, 'XYZ')).invert();
      chunkLocalPosition.applyQuaternion(chunkQuaternion);
      const nearby = Math.abs(chunkLocalPosition.x) <= chunk.size[0] / 2 + margin
        && Math.abs(chunkLocalPosition.z) <= chunk.size[2] / 2 + margin;
      if (chunkProximityStates.get(chunk.id) === nearby) continue;
      chunkProximityStates.set(chunk.id, nearby);
      setChunkActive(chunk.id, nearby);
    }
  }
}

function createWaypointHud(container, waypoints) {
  const markers = waypoints.map((waypoint) => {
    const root = document.createElement('div');
    root.className = 'waypoint-marker';
    const arrow = document.createElement('span');
    arrow.className = 'waypoint-marker__arrow';
    arrow.textContent = '▲';
    const label = document.createElement('span');
    label.textContent = waypoint.name;
    root.append(arrow, label);
    container.append(root);
    const active = waypoint.initiallyActive !== false;
    root.hidden = !active;
    return { id: waypoint.id, root, arrow, position: new THREE.Vector3(...waypoint.position), active };
  });
  const projected = new THREE.Vector3();
  const cameraLocal = new THREE.Vector3();

  return {
    update(camera) {
      if (!markers.length) return;
      camera.updateMatrixWorld();
      const width = container.clientWidth;
      const height = container.clientHeight;
      const edge = 70;
      for (const marker of markers) {
        if (!marker.active) continue;
        projected.copy(marker.position).project(camera);
        cameraLocal.copy(marker.position).applyMatrix4(camera.matrixWorldInverse);
        const onScreen = cameraLocal.z < 0
          && projected.x >= -0.92 && projected.x <= 0.92
          && projected.y >= -0.88 && projected.y <= 0.88;
        marker.root.classList.toggle('is-offscreen', !onScreen);
        if (onScreen) {
          marker.root.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
          marker.root.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
          continue;
        }
        let dx = projected.x;
        let dy = -projected.y;
        if (cameraLocal.z >= 0) {
          dx = -dx;
          dy = -dy;
        }
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.001) {
          dx = cameraLocal.x >= 0 ? 1 : -1;
          dy = 0;
        }
        const scale = Math.min((width / 2 - edge) / Math.max(Math.abs(dx), 0.001), (height / 2 - edge) / Math.max(Math.abs(dy), 0.001));
        marker.root.style.left = `${width / 2 + dx * scale}px`;
        marker.root.style.top = `${height / 2 + dy * scale}px`;
        marker.arrow.style.transform = `translateX(-50%) rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
      }
    },
    setActive(id, active) {
      const marker = markers.find((candidate) => candidate.id === id);
      if (!marker) return;
      marker.active = active;
      marker.root.hidden = !active;
    },
    dispose() {
      for (const marker of markers) marker.root.remove();
    },
  };
}

function createNitroHud() {
  const root = document.createElement('div');
  root.className = 'nitro-hud';
  root.innerHTML = '<span>NITRO INSTALLED</span>';
  return {
    root,
    update(installed) { root.classList.toggle('is-visible', installed); },
  };
}

function hasStartAction(actions, eventName) {
  return actions.includes(`${eventName}-start`) || actions.includes('all-start');
}

function createSpeedDisplay() {
  const group = new THREE.Group();
  group.name = 'tractor-speed-display';
  // Match the tractor-local dashboard mount used by the original simulator.
  // The tractor faces +X, so turn the panel's front toward the driver at -X.
  group.position.set(0.6, 1.2, 0.1);
  group.rotation.y = -Math.PI / 2;
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.29, 0.15, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x171811, roughness: 0.65 }),
  );
  const display = createTextDisplay({ width: 384, height: 192, background: '#182219', color: '#8ff09b' });
  display.setText('0.0', 'MPH');
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.255, 0.12),
    new THREE.MeshBasicMaterial({ map: display.texture }),
  );
  screen.position.z = 0.014;
  group.add(housing, screen);
  return { group, display };
}

function createHitchForceHud() {
  const root = document.createElement('div');
  root.className = 'hitch-force-hud';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'Pulling sled hitch force and distance');
  root.innerHTML = `
    <div class="hitch-force-hud__metric">
      <span>Hitch force</span>
      <strong data-hitch-force>0 lbf</strong>
    </div>
    <div class="hitch-force-hud__metric">
      <span>Distance traveled</span>
      <strong data-pulling-distance>0.0 ft</strong>
    </div>
    <div class="hitch-force-hud__metric">
      <span>Tire / ground slip</span>
      <strong data-tire-slip>0%</strong>
    </div>
  `;
  const force = root.querySelector('[data-hitch-force]');
  const distance = root.querySelector('[data-pulling-distance]');
  const tireSlip = root.querySelector('[data-tire-slip]');
  let wasAttached = false;
  let updateElapsed = 0;
  let accumulatedForce = 0;
  let accumulatedTime = 0;

  return {
    root,
    update(telemetry, deltaSeconds) {
      const attached = telemetry.attachedPullingSleds > 0;
      root.classList.toggle('is-visible', attached);
      root.setAttribute('aria-hidden', String(!attached));
      if (!attached) {
        wasAttached = false;
        updateElapsed = 0;
        accumulatedForce = 0;
        accumulatedTime = 0;
        return;
      }
      const measuredForceLbf = Math.max(0, telemetry.pullingSledHitchForceNewtons) * 0.224809;
      const distanceFeet = Math.max(0, telemetry.pullingSledDistanceMetres) * 3.28084;
      distance.textContent = `${distanceFeet.toFixed(1)} ft`;
      const slipPercent = Math.max(0, Math.min(100, telemetry.drivenTireSlipPercent));
      tireSlip.textContent = `${Math.round(slipPercent)}%`;
      tireSlip.classList.toggle('is-slipping', slipPercent >= 1);
      if (!wasAttached) force.textContent = `${Math.round(measuredForceLbf).toLocaleString()} lbf`;
      updateElapsed += deltaSeconds;
      accumulatedForce += measuredForceLbf * deltaSeconds;
      accumulatedTime += deltaSeconds;
      if (updateElapsed >= 0.4) {
        const averageForceLbf = accumulatedForce / accumulatedTime;
        force.textContent = `${Math.round(averageForceLbf).toLocaleString()} lbf`;
        updateElapsed %= 0.4;
        accumulatedForce = 0;
        accumulatedTime = 0;
      }
      wasAttached = true;
    },
  };
}

function createDurabilityHud() {
  const root = document.createElement('div');
  root.className = 'durability-hud is-visible';
  root.setAttribute('aria-label', 'Tractor durability');
  root.innerHTML = `
    <strong>Durability</strong>
    <div class="durability-score">
      <div><span>Time remaining</span><strong data-durability-time>6:00</strong></div>
      <div><span>Laps</span><strong data-durability-laps>0</strong></div>
    </div>
    ${createDurabilityBar('Structural durability', 'structural')}
    ${createDurabilityBar('Driveline', 'driveline')}
    ${createDurabilityBar('Temperature', 'temperature', true)}
  `;

  return {
    root,
    update(telemetry, remainingSeconds, laps, cartAttached, result) {
      root.classList.toggle('has-result', Boolean(result));
      root.classList.toggle('is-complete', result === 'complete');
      root.setAttribute('aria-hidden', 'false');
      root.querySelector('.durability-score').hidden = !cartAttached;
      const resultLabels = {
        disqualified: 'DISQUALIFIED',
        broken: 'BROKEN TRACTOR',
        complete: 'COURSE COMPLETE',
      };
      root.querySelector('[data-durability-time]').textContent = resultLabels[result] ?? formatCountdown(remainingSeconds);
      root.querySelector('[data-durability-laps]').textContent = laps;
      updateBar('structural', telemetry.trailerStructuralDurability);
      updateBar('driveline', telemetry.trailerDrivelineDurability);
      updateBar('temperature', telemetry.trailerTemperature);
    },
  };

  function updateBar(name, value) {
    const percentage = Math.min(100, Math.max(0, value));
    const fill = root.querySelector(`[data-durability-fill="${name}"]`);
    const row = fill.closest('.durability-row');
    const danger = name === 'temperature'
      ? percentage >= 85 ? 'red' : percentage >= 60 ? 'yellow' : 'green'
      : percentage <= 30 ? 'red' : percentage <= 60 ? 'yellow' : 'green';
    row.classList.toggle('is-green', danger === 'green');
    row.classList.toggle('is-yellow', danger === 'yellow');
    row.classList.toggle('is-red', danger === 'red');
    fill.style.width = `${percentage}%`;
    root.querySelector(`[data-durability-value="${name}"]`).textContent = `${Math.round(percentage)}%`;
  }
}

function createDurabilityBar(label, name, isTemperature = false) {
  return `
    <div class="durability-row is-green${isTemperature ? ' is-temperature' : ''}">
      <span>${label}</span>
      <small data-durability-value="${name}">${isTemperature ? 0 : 100}%</small>
      <div><i data-durability-fill="${name}" style="width: ${isTemperature ? 0 : 100}%"></i></div>
    </div>
  `;
}

function createBreakdownSmoke() {
  const group = new THREE.Group();
  group.name = 'tractor-breakdown-smoke';
  group.position.set(0.9, 0.95, 0);
  group.visible = false;
  const geometry = new THREE.SphereGeometry(0.12, 8, 6);
  const particles = Array.from({ length: 14 }, (_, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0x484c47,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    return { mesh, age: -(index / 14) * 2.4, lifetime: 2.4 };
  });
  let active = false;

  function reset(particle) {
    particle.age = 0;
    particle.lifetime = 2.1 + Math.random() * 0.8;
    particle.mesh.position.set(
      (Math.random() - 0.5) * 0.18,
      0,
      (Math.random() - 0.5) * 0.18,
    );
    particle.mesh.scale.setScalar(0.65 + Math.random() * 0.35);
  }

  return {
    group,
    start() {
      active = true;
      group.visible = true;
    },
    stop() {
      active = false;
      group.visible = false;
      for (const particle of particles) particle.mesh.material.opacity = 0;
    },
    update(deltaSeconds) {
      if (!active) return;
      for (const particle of particles) {
        particle.age += deltaSeconds;
        if (particle.age < 0) continue;
        if (particle.age >= particle.lifetime) reset(particle);
        const progress = particle.age / particle.lifetime;
        particle.mesh.position.y += deltaSeconds * (0.42 + progress * 0.28);
        particle.mesh.position.x += deltaSeconds * 0.07;
        particle.mesh.scale.multiplyScalar(1 + deltaSeconds * 0.42);
        particle.mesh.material.opacity = Math.sin(progress * Math.PI) * 0.42;
      }
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      for (const particle of particles) particle.mesh.material.dispose();
    },
  };
}

function maneuverabilityTelemetrySnapshot(telemetry) {
  return {
    yellowBallsKnocked: telemetry.yellowBallsKnocked,
    yellowPostsKnocked: telemetry.yellowPostsKnocked,
    redPostsKnocked: telemetry.redPostsKnocked,
    directionChanges: telemetry.directionChanges,
  };
}

function maneuverabilityStatsSince(telemetry, start) {
  if (!start) return { yellowBallsKnocked: 0, yellowPostsKnocked: 0, redPostsKnocked: 0, directionChanges: 0 };
  const current = maneuverabilityTelemetrySnapshot(telemetry);
  return Object.fromEntries(Object.keys(current).map((key) => [key, Math.max(0, current[key] - start[key])]));
}

function maneuverabilityScore(elapsedSeconds, stats) {
  const timeBonus = Math.max(0, Math.floor((120 - elapsedSeconds) / 15));
  return timeBonus
    - stats.yellowBallsKnocked
    - stats.yellowPostsKnocked * 2
    - Math.max(0, stats.directionChanges - 3);
}

function createScoreSummary(openWorldSaving = false) {
  const root = document.createElement('section');
  root.className = 'score-summary';
  root.setAttribute('aria-label', 'Event scores');
  root.innerHTML = `
    <p data-score-kicker>Hold Tab · Event scores</p>
    <h2>Scorecard</h2>
    <div><span>Maneuverability</span><strong data-score-event="maneuverability">Event not attempted</strong></div>
    <div><span>Durability</span><strong data-score-event="durability">Event not attempted</strong></div>
    <div><span>Pulling</span><strong data-score-event="pulling">Event not attempted</strong></div>
    <nav class="score-summary-actions">
      <button type="button" data-score-back>Back to game</button>
      ${openWorldSaving ? '<button type="button" data-score-save>Save open world</button><button type="button" data-score-load>Load save</button>' : ''}
      <a href="/">Main menu</a>
    </nav>
    ${openWorldSaving ? '<p class="score-save-status" data-score-save-status role="status" aria-live="polite"></p>' : ''}
  `;
  const fields = Object.fromEntries(
    [...root.querySelectorAll('[data-score-event]')].map((field) => [field.dataset.scoreEvent, field]),
  );

  let tabVisible = false;
  let paused = false;
  const renderVisibility = () => {
    root.classList.toggle('is-visible', tabVisible || paused);
    root.classList.toggle('is-paused', paused);
    root.setAttribute('aria-hidden', String(!tabVisible && !paused));
    root.querySelector('[data-score-kicker]').textContent = paused ? 'Game paused · Event scores' : 'Hold Tab · Event scores';
  };

  return {
    root,
    setVisible(visible) {
      tabVisible = visible;
      renderVisibility();
    },
    setPaused(value) {
      paused = value;
      renderVisibility();
    },
    setSaveStatus(message) {
      const status = root.querySelector('[data-score-save-status]');
      if (status) status.textContent = message;
    },
    update(events) {
      for (const [name, event] of Object.entries(events)) {
        fields[name].textContent = event.state === 'not-started'
          ? 'Event not attempted'
          : event.state === 'active'
            ? 'Event in progress'
            : `${formatScore(event.score)} pts`;
      }
    },
  };
}

function shiftTime(value, duration) {
  return value === null || !Number.isFinite(value) ? value : value + duration;
}

function formatScore(score) {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function createHighScorePopup() {
  const root = document.createElement('section');
  root.className = 'high-score-popup';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = '<span>New high score</span><strong data-high-score-event></strong><b data-high-score-value></b>';
  let hideTimer = null;
  return {
    root,
    show(eventName, score) {
      root.querySelector('[data-high-score-event]').textContent = eventName;
      root.querySelector('[data-high-score-value]').textContent = `${formatHighScore(score)} pts`;
      root.classList.remove('is-visible');
      requestAnimationFrame(() => root.classList.add('is-visible'));
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => root.classList.remove('is-visible'), 5000);
    },
    dispose() {
      clearTimeout(hideTimer);
      root.remove();
    },
  };
}

function createManeuverabilityHud() {
  const root = document.createElement('div');
  root.className = 'maneuverability-hud';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'Maneuverability score');
  root.innerHTML = `
    <div class="maneuverability-result" data-maneuver-result></div>
    <div class="maneuverability-hud-heading"><span>Maneuverability</span><strong data-maneuver-total>0 pts</strong></div>
    <div class="maneuver-timer"><span>Time remaining</span><strong data-maneuver-timer>5:00</strong></div>
    <div class="maneuver-score-row"><span>Potential time bonus</span><b data-maneuver-potential>+8</b></div>
    <div class="maneuver-score-row"><span>Bonus obtained</span><b data-maneuver-bonus>Pending</b></div>
    <div class="maneuver-score-row"><span>Yellow balls knocked (−1)</span><b data-maneuver-yellow-balls>0 / −0</b></div>
    <div class="maneuver-score-row"><span>Yellow posts knocked (−2)</span><b data-maneuver-yellow-posts>0 / −0</b></div>
    <div class="maneuver-score-row"><span>Direction changes</span><b data-maneuver-directions>0</b></div>
    <div class="maneuver-score-row"><span>Changes beyond 3 (−1)</span><b data-maneuver-direction-penalty>0 / −0</b></div>
    <div class="maneuver-score-row"><span>Red posts knocked</span><b data-maneuver-red-posts>0</b></div>
  `;
  let updateElapsed = Infinity;
  let wasFinished = false;

  return {
    root,
    update(stats, deltaSeconds) {
      root.classList.toggle('is-visible', stats.active);
      root.classList.toggle('has-result', Boolean(stats.result));
      root.classList.toggle('is-disqualified', stats.result === 'disqualified');
      root.classList.toggle('is-complete', stats.result === 'complete');
      root.classList.toggle('is-incomplete', stats.result === 'incomplete');
      root.setAttribute('aria-hidden', String(!stats.active));
      if (!stats.active) return;
      updateElapsed += deltaSeconds;
      if (updateElapsed < 0.1 && stats.finished === wasFinished) return;
      updateElapsed = 0;
      wasFinished = stats.finished;
      const elapsed = Math.max(0, stats.elapsedSeconds);
      const remaining = Math.max(0, 300 - elapsed);
      const potentialBonus = Math.max(0, Math.floor((120 - elapsed) / 15));
      const bonusObtained = stats.finished ? potentialBonus : 0;
      const yellowBallPenalty = stats.yellowBallsKnocked;
      const yellowPostPenalty = stats.yellowPostsKnocked * 2;
      const directionPenalty = Math.max(0, stats.directionChanges - 3);
      const total = maneuverabilityScore(elapsed, stats);
      root.querySelector('[data-maneuver-result]').textContent = stats.result ? stats.result.toUpperCase() : '';
      set('timer', formatCountdown(remaining));
      set('potential', `+${potentialBonus}`);
      set('bonus', stats.finished ? `+${bonusObtained}` : 'Pending');
      set('yellow-balls', `${stats.yellowBallsKnocked} / −${yellowBallPenalty}`);
      set('yellow-posts', `${stats.yellowPostsKnocked} / −${yellowPostPenalty}`);
      set('directions', stats.directionChanges);
      set('direction-penalty', `${directionPenalty} / −${directionPenalty}`);
      set('red-posts', stats.redPostsKnocked);
      root.querySelector('[data-maneuver-total]').textContent = `${total} ${Math.abs(total) === 1 ? 'pt' : 'pts'}`;
    },
  };

  function set(name, value) {
    root.querySelector(`[data-maneuver-${name}]`).textContent = value;
  }
}

function formatCountdown(seconds) {
  const wholeSeconds = Math.ceil(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
