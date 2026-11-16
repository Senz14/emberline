// The first-person gun: a small model built from boxes, one shape per weapon
// kind, with a muzzle flash and a light that fires with the shot. Bob, kick
// and the reload dip are driven from the player's movement and the weapon
// state each frame; nothing here allocates during play.

import * as THREE from 'three';

const GUN_BODY = 0x2a2a30;
const GUN_DARK = 0x1a1a1e;
const GUN_ACCENT = 0x8a6a3a;

export function createViewmodel(scene, camera) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: GUN_BODY, roughness: 0.5, metalness: 0.7 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: GUN_DARK, roughness: 0.6, metalness: 0.6 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: GUN_ACCENT, roughness: 0.4, metalness: 0.8 });
  const parts = [];
  let muzzle = null;

  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    parts.push(mesh);
    return mesh;
  }

  function build(kind) {
    for (const part of parts) group.remove(part);
    parts.length = 0;
    muzzle = new THREE.Group();
    if (kind === 'pistol') {
      box(0.05, 0.09, 0.22, bodyMaterial, 0, -0.02, -0.1);
      box(0.04, 0.07, 0.05, darkMaterial, 0, -0.09, -0.02);
      box(0.05, 0.02, 0.06, accentMaterial, 0, 0.03, -0.16);
      muzzle.position.set(0, -0.01, -0.24);
    } else if (kind === 'shotgun') {
      box(0.07, 0.09, 0.55, bodyMaterial, 0, -0.02, -0.2);
      box(0.06, 0.06, 0.5, darkMaterial, 0, -0.03, -0.22);
      box(0.05, 0.12, 0.06, darkMaterial, 0, -0.1, -0.05);
      box(0.07, 0.03, 0.1, accentMaterial, 0, 0.03, -0.4);
      muzzle.position.set(0, -0.02, -0.52);
    } else if (kind === 'smg') {
      box(0.06, 0.09, 0.32, bodyMaterial, 0, -0.02, -0.12);
      box(0.04, 0.1, 0.05, darkMaterial, 0, -0.1, -0.08);
      box(0.05, 0.05, 0.12, darkMaterial, 0, -0.02, -0.32);
      box(0.06, 0.02, 0.08, accentMaterial, 0, 0.03, -0.2);
      muzzle.position.set(0, -0.02, -0.4);
    } else if (kind === 'sniper') {
      box(0.06, 0.08, 0.62, bodyMaterial, 0, -0.02, -0.24);
      box(0.05, 0.05, 0.06, darkMaterial, 0, -0.02, -0.58);
      box(0.03, 0.09, 0.03, darkMaterial, 0, 0.045, -0.2);
      box(0.05, 0.03, 0.14, accentMaterial, 0, 0.035, -0.35);
      muzzle.position.set(0, -0.02, -0.58);
    } else if (kind === 'lmg') {
      box(0.08, 0.1, 0.58, bodyMaterial, 0, -0.02, -0.22);
      box(0.06, 0.06, 0.52, darkMaterial, 0, -0.03, -0.24);
      box(0.06, 0.14, 0.08, darkMaterial, 0, -0.1, -0.1);
      box(0.07, 0.03, 0.12, accentMaterial, 0, 0.03, -0.42);
      muzzle.position.set(0, -0.02, -0.54);
    } else {
      box(0.06, 0.09, 0.5, bodyMaterial, 0, -0.02, -0.2);
      box(0.05, 0.05, 0.06, darkMaterial, 0, -0.02, -0.48);
      box(0.05, 0.11, 0.06, darkMaterial, 0, -0.1, -0.06);
      box(0.06, 0.02, 0.1, accentMaterial, 0, 0.03, -0.34);
      muzzle.position.set(0, -0.02, -0.5);
    }
    group.add(muzzle);
  }

  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMaterial);
  flash.position.set(0, 0, -0.02);
  const flashLight = new THREE.PointLight(0xffc27a, 0, 7, 1.8);
  flashLight.position.set(0, 0, -0.05);
  muzzle = new THREE.Group();
  muzzle.add(flash);
  muzzle.add(flashLight);
  group.add(muzzle);

  group.position.set(0.22, -0.22, -0.42);
  camera.add(group);
  scene.add(camera);

  let kind = '';
  let kick = 0;
  let flashUntil = 0;
  let bobPhase = 0;
  let reloadDip = 0;

  return {
    setWeapon(nextKind) {
      if (nextKind === kind) return;
      kind = nextKind;
      build(nextKind);
      muzzle.add(flash);
      muzzle.add(flashLight);
    },
    fire() {
      kick = 1;
      flashUntil = 0.05;
    },
    startReload() { reloadDip = 1; },
    step(dt, speed, now) {
      kick = Math.max(0, kick - dt * 6);
      bobPhase += dt * speed * 1.6;
      const bobY = Math.sin(bobPhase * 2) * 0.008 * Math.min(speed / 5, 1);
      const bobX = Math.cos(bobPhase) * 0.006 * Math.min(speed / 5, 1);
      reloadDip = Math.max(0, reloadDip - dt * 1.4);
      group.position.set(
        0.22 + bobX,
        -0.22 + bobY - reloadDip * 0.12,
        -0.42 + kick * 0.06,
      );
      group.rotation.x = kick * 0.09 + reloadDip * 0.5;
      const flashing = now < flashUntil;
      flashMaterial.opacity = flashing ? 0.9 : 0;
      flash.rotation.z = Math.random() * Math.PI;
      flashLight.intensity = flashing ? 6 : 0;
    },
    muzzleWorldPosition(out) {
      muzzle.getWorldPosition(out);
      return out;
    },
  };
}
