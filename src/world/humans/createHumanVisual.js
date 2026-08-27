import * as THREE from 'three';
import { publicUrl } from '../../config/publicUrl.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const HUMAN_MODEL_PATH = publicUrl('assets/models/human/person.glb');
let humanAssetPromise;

export function createHumanVisual(human) {
  const root = new THREE.Group();
  root.name = human.id;
  const flag = createGreenFlag();
  flag.visible = human.flagColor !== 'none';
  root.add(flag);
  const placeholder = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 1.25, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x4d78a8, roughness: 0.75 }),
  );
  placeholder.position.y = 0.9;
  placeholder.castShadow = true;
  root.add(placeholder);

  const controller = {
    root,
    mixer: null,
    actions: new Map(),
    activeAction: null,
    activeMovingFast: false,
    mode: human.behavior,
    fallen: false,
    flagColor: human.flagColor,
    flag,
    upperArm: null,
    lowerArm: null,
    hand: null,
    upperArmRest: null,
    lowerArmRest: null,
    setFlag(color) {
      this.flagColor = ['green', 'red'].includes(color) ? color : 'none';
      this.flag.visible = this.flagColor !== 'none';
      this.flag.userData.clothMaterial.color.set(this.flagColor === 'red' ? 0xd83b35 : 0x25a94f);
    },
    setState(mode, fallen = false, movingFast = false) {
      this.mode = mode;
      this.fallen = fallen;
      if (!this.mixer) return;
      const clipName = fallen
        ? null
        : movingFast
          ? 'Rig|run'
          : mode === 'sit'
            ? 'Rig|sitting_idle'
            : mode === 'walk'
              ? 'Rig|walk'
              : 'Rig|idle';
      const nextAction = clipName ? this.actions.get(clipName) ?? this.actions.get('Rig|idle') : null;
      if (nextAction === this.activeAction) return;
      const transitionTime = movingFast || this.activeMovingFast ? 1.05 : 0.18;
      this.activeAction?.fadeOut(transitionTime);
      nextAction?.reset().fadeIn(transitionTime).play();
      this.activeAction = nextAction;
      this.activeMovingFast = movingFast;
    },
    update(deltaSeconds) {
      this.mixer?.update(deltaSeconds);
      if (this.flagColor === 'none' || this.fallen || !this.hand) return;
      this.upperArm.quaternion.copy(this.upperArmRest).multiply(FLAG_ARM_ROTATION);
      this.lowerArm.quaternion.copy(this.lowerArmRest);
      root.updateMatrixWorld(true);
      const palmWorld = this.hand.localToWorld(new THREE.Vector3(0.02, 0.09, -0.01));
      this.flag.position.copy(root.worldToLocal(palmWorld));
    },
  };
  controller.setFlag(human.flagColor);

  loadHumanAsset().then(({ scene, animations }) => {
    if (!root.parent) return;
    root.remove(placeholder);
    placeholder.geometry.dispose();
    placeholder.material.dispose();
    const model = clone(scene);
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.blockId = human.id;
    });
    root.add(model);
    controller.upperArm = model.getObjectByName('Upper_Arm_L_027');
    controller.lowerArm = model.getObjectByName('Lower_Arm_L_028');
    controller.hand = model.getObjectByName('Hand_L_029');
    controller.upperArmRest = controller.upperArm?.quaternion.clone();
    controller.lowerArmRest = controller.lowerArm?.quaternion.clone();
    controller.mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) controller.actions.set(clip.name, controller.mixer.clipAction(clip));
    controller.setState(controller.mode, controller.fallen);
  }).catch((error) => console.error('Unable to load the human model.', error));

  return controller;
}

// The rig's left side is +X. These joint-local angles place the hand beside
// the shoulder instead of rotating it toward the model's rear (-Z).
const FLAG_ARM_ROTATION = new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(20),
  THREE.MathUtils.degToRad(-60),
  THREE.MathUtils.degToRad(-10),
));

function createGreenFlag() {
  const group = new THREE.Group();
  group.name = 'green-flag';
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.85, 10),
    new THREE.MeshStandardMaterial({ color: 0xd7d2bf, roughness: 0.6, metalness: 0.2 }),
  );
  pole.position.y = 0.28;
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x25a94f, side: THREE.DoubleSide, roughness: 0.75 }),
  );
  cloth.position.set(0.24, 0.55, 0);
  for (const mesh of [pole, cloth]) mesh.castShadow = true;
  group.add(pole, cloth);
  group.userData.clothMaterial = cloth.material;
  return group;
}

function loadHumanAsset() {
  humanAssetPromise ??= new GLTFLoader().loadAsync(HUMAN_MODEL_PATH);
  return humanAssetPromise;
}
