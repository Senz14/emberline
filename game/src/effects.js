// Transient combat effects, all pooled: nothing here allocates while the
// round runs. Tracers are stretched boxes, sparks are small point clouds,
// smoke is a set of translucent billboards that also block line of sight for
// the bots. Flash blindness is a number per actor, read by the HUD and the
// bot AI.

import * as THREE from 'three';
import { clamp } from './rng.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 10;
const MAX_SMOKE = 6;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeometry = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  for (let i = 0; i < MAX_TRACERS; i++) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, until: 0 });
  }
  let tracerIndex = 0;

  const sparks = [];
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
  for (let i = 0; i < MAX_SPARKS; i++) {
    const material = new THREE.PointsMaterial({ color: 0xffb347, size: 0.12, transparent: true, opacity: 0 });
    const points = new THREE.Points(sparkGeometry, material);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, material, until: 0, velocities: new Float32Array(24 * 3) });
  }
  let sparkIndex = 0;

  const smokes = [];
  for (let i = 0; i < MAX_SMOKE; i++) {
    const group = new THREE.Group();
    group.visible = false;
    const material = new THREE.MeshBasicMaterial({ color: 0x8a8578, transparent: true, opacity: 0.32, depthWrite: false });
    for (let j = 0; j < 7; j++) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random() * 0.9, 10, 10), material);
      sphere.position.set((Math.random() - 0.5) * 3.4, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 3.4);
      group.add(sphere);
    }
    scene.add(group);
    smokes.push({ group, until: 0, x: 0, z: 0 });
  }
  let smokeIndex = 0;

  const explosionLight = new THREE.PointLight(0xff8a3d, 0, 18, 1.6);
  scene.add(explosionLight);
  let explosionUntil = 0;

  return {
    tracer(from, to) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
      const mesh = slot.mesh;
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.lookAt(to);
      mesh.scale.set(1, 1, from.distanceTo(to));
      mesh.visible = true;
      slot.until = performance.now() / 1000 + 0.06;
    },
    sparksAt(position, count = 16) {
      const slot = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      const positions = slot.points.geometry.attributes.position;
      for (let i = 0; i < 24; i++) {
        const active = i < count;
        positions.setXYZ(i, position.x, position.y, position.z);
        const angle = Math.random() * Math.PI * 2;
        const speed = active ? 2 + Math.random() * 4 : 0;
        slot.velocities[i * 3] = Math.cos(angle) * speed;
        slot.velocities[i * 3 + 1] = Math.random() * 4;
        slot.velocities[i * 3 + 2] = Math.sin(angle) * speed;
      }
      positions.needsUpdate = true;
      slot.points.visible = true;
      slot.material.opacity = 1;
      slot.until = performance.now() / 1000 + 0.45;
    },
    explode(position) {
      this.sparksAt(position, 24);
      explosionLight.position.set(position.x, position.y + 1, position.z);
      explosionLight.intensity = 60;
      explosionUntil = performance.now() / 1000 + 0.35;
    },
    smoke(position, duration) {
      const slot = smokes[smokeIndex];
      smokeIndex = (smokeIndex + 1) % MAX_SMOKE;
      slot.group.position.set(position.x, 0, position.z);
      slot.group.visible = true;
      slot.x = position.x;
      slot.z = position.z;
      slot.until = performance.now() / 1000 + duration;
    },
    // True when the segment between two points crosses a live smoke cloud.
    smokeBlocks(from, to) {
      const now = performance.now() / 1000;
      for (const slot of smokes) {
        if (now >= slot.until) continue;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq < 0.001) continue;
        const t = clamp(((slot.x - from.x) * dx + (slot.z - from.z) * dz) / lengthSq, 0, 1);
        const px = from.x + dx * t;
        const pz = from.z + dz * t;
        if (Math.hypot(px - slot.x, pz - slot.z) < 2.4) return true;
      }
      return false;
    },
    flashBlindness(position, direction, flashPosition, radius) {
      const toFlash = new THREE.Vector3().subVectors(flashPosition, position);
      const distance = toFlash.length();
      if (distance > radius) return 0;
      const facing = toFlash.normalize().dot(direction);
      const looking = facing > 0 ? 1 : 0.25;
      return clamp(2.6 * (1 - distance / radius) * looking + 0.4, 0, 3);
    },
    step(now) {
      for (const slot of tracers) if (slot.mesh.visible && now >= slot.until) slot.mesh.visible = false;
      for (const slot of sparks) {
        if (!slot.points.visible) continue;
        if (now >= slot.until) { slot.points.visible = false; slot.material.opacity = 0; continue; }
        const positions = slot.points.geometry.attributes.position;
        for (let i = 0; i < 24; i++) {
          positions.array[i * 3] += slot.velocities[i * 3] * 0.016;
          positions.array[i * 3 + 1] += slot.velocities[i * 3 + 1] * 0.016;
          positions.array[i * 3 + 2] += slot.velocities[i * 3 + 2] * 0.016;
          slot.velocities[i * 3 + 1] -= 9 * 0.016;
          if (positions.array[i * 3 + 1] < 0.02) positions.array[i * 3 + 1] = 0.02;
        }
        positions.needsUpdate = true;
        slot.material.opacity = Math.max(0, (slot.until - now) / 0.45);
      }
      for (const slot of smokes) if (slot.group.visible && now >= slot.until) slot.group.visible = false;
      if (explosionLight.intensity > 0 && now >= explosionUntil) explosionLight.intensity = 0;
    },
    clear() {
      for (const slot of tracers) slot.mesh.visible = false;
      for (const slot of sparks) { slot.points.visible = false; slot.material.opacity = 0; }
      for (const slot of smokes) slot.group.visible = false;
      explosionLight.intensity = 0;
    },
  };
}
