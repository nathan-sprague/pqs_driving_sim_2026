import * as THREE from 'three';
import { loadTractor } from './loadTractor.js';

export function createTractorViewer(container, modelId, callbacks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b211c);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x40382c, 2.5));
  const light = new THREE.DirectionalLight(0xfff1d5, 4);
  light.position.set(-4, 7, 5);
  scene.add(light);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x353a31, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const pivot = new THREE.Group();
  scene.add(pivot);
  const centerOfMassMarker = new THREE.Group();
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xe7a329, depthTest: false });
  centerOfMassMarker.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), markerMaterial));
  for (const rotation of [[0, 0, 0], [0, 0, Math.PI / 2], [Math.PI / 2, 0, 0]]) {
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), markerMaterial);
    axis.rotation.set(...rotation);
    centerOfMassMarker.add(axis);
  }
  centerOfMassMarker.renderOrder = 10;
  pivot.add(centerOfMassMarker);
  loadTractor(modelId).then((tractor) => {
    pivot.add(tractor);
    tractor.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(tractor).getSize(new THREE.Vector3());
    callbacks.onLoad?.({ length: size.x, width: size.z, height: size.y });
  });
  let yaw = -0.7;
  let pitch = -0.18;
  let distance = 4.6;
  let dragging = false;
  const down = () => { dragging = true; };
  const up = () => { dragging = false; };
  const move = (event) => {
    if (!dragging) return;
    yaw += event.movementX * 0.008;
    pitch = THREE.MathUtils.clamp(pitch + event.movementY * 0.006, -1.1, 0.55);
  };
  const wheel = (event) => {
    event.preventDefault();
    distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.004, 2.4, 9);
  };
  renderer.domElement.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  const resize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  let frame;
  const animate = () => {
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * distance, 1.05 + Math.sin(-pitch) * distance, Math.sin(yaw) * Math.cos(pitch) * distance);
    camera.lookAt(0.55, 0.8, 0);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  };
  animate();
  return {
    setCenterOfMass(inches) { centerOfMassMarker.position.fromArray(inches).multiplyScalar(0.0254); },
    dispose() { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move); renderer.dispose(); renderer.domElement.remove(); },
  };
}
