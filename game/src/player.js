// The player: a first-person body with WASD movement, jumping, crouching,
// health and armour, recoil and footsteps. The body is the physics capsule;
// yaw/pitch are the camera; the state object is the one place the rest of
// the game reads (HUD, combat, rounds).

import { clamp } from './rng.js';
import { makeBody, moveBody, flatDistance } from './physics.js';

export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_EYE = 1.62;

const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.8;
const JUMP_SPEED = 7.5;
const ACCELERATION = 42;

export function createPlayer(x, z, yaw) {
  const body = makeBody(x, z, PLAYER_RADIUS, PLAYER_HEIGHT);
  const state = {
    health: 100,
    armor: 0,
    alive: true,
    kills: 0,
    deaths: 0,
    money: 800,
    weapons: [],
    grenades: { flash: 0, smoke: 0, frag: 0 },
    currentWeapon: 0,
    grenadeKind: 'frag',
    carrier: false,
    flashUntil: 0,
    plantedThisRound: false,
    defusedThisRound: false,
  };
  let pitch = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let stepPhase = 0;
  let lastStepAt = 0;

  return {
    body,
    state,
    get yaw() { return yaw; },
    set yaw(value) { yaw = value; },
    get pitch() { return pitch; },
    set pitch(value) { pitch = value; },
    eyePosition(out) {
      out.set(body.position.x, body.position.y + PLAYER_EYE, body.position.z);
      return out;
    },
    facing(out) {
      const totalPitch = pitch + recoilPitch;
      const totalYaw = yaw + recoilYaw;
      out.set(
        -Math.sin(totalYaw) * Math.cos(totalPitch),
        Math.sin(totalPitch),
        -Math.cos(totalYaw) * Math.cos(totalPitch),
      );
      return out;
    },
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    recoil(amount, yawAmount) {
      recoilPitch = clamp(recoilPitch + amount, 0, 0.12);
      recoilYaw += yawAmount;
    },
    // Apply one fixed step of movement. Returns true when a footstep landed.
    step(dt, input, obstacles, onStep, now) {
      if (!state.alive) return false;
      const crouched = input.crouch;
      const speed = crouched ? CROUCH_SPEED : WALK_SPEED;
      const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      let wishX = -sin * forward + cos * strafe;
      let wishZ = -cos * forward - sin * strafe;
      const length = Math.hypot(wishX, wishZ);
      if (length > 0.001) {
        wishX /= length;
        wishZ /= length;
      }
      body.velocity.x += (wishX * speed - body.velocity.x) * Math.min(1, ACCELERATION * dt / speed);
      body.velocity.z += (wishZ * speed - body.velocity.z) * Math.min(1, ACCELERATION * dt / speed);
      if (input.jump && body.onGround) {
        body.velocity.y = JUMP_SPEED;
        onStep('jump');
      }
      moveBody(body, dt, obstacles);
      body.position.x = clamp(body.position.x, -22, 22);
      body.position.z = clamp(body.position.z, -19, 19);
      recoilPitch = Math.max(0, recoilPitch - dt * 0.35);
      recoilYaw *= Math.max(0, 1 - dt * 8);
      const moving = this.groundSpeed();
      if (body.onGround && moving > 1) {
        stepPhase += dt * moving * 1.4;
        if (stepPhase > Math.PI * 2) {
          stepPhase -= Math.PI * 2;
          if (now - lastStepAt > 0.25) {
            lastStepAt = now;
            onStep('step');
            return true;
          }
        }
      }
      return false;
    },
    // Damage with armour: half goes to armour while any remains (a quarter
    // for headshots when the helm is worn — handled by the caller passing the
    // reduced amount). Returns true when the player died.
    damage(amount, isHeadshot) {
      if (!state.alive) return false;
      let remaining = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, Math.ceil(remaining * 0.5));
        state.armor -= absorbed;
        remaining -= absorbed;
      }
      state.health -= remaining;
      if (state.health <= 0) {
        state.health = 0;
        state.alive = false;
        state.deaths += 1;
        return true;
      }
      return false;
    },
    heal(amount) {
      state.health = clamp(state.health + amount, 0, 100);
    },
    reset(x, z, nextYaw) {
      body.position.x = x;
      body.position.y = 0;
      body.position.z = z;
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
      yaw = nextYaw;
      pitch = 0;
      recoilPitch = 0;
      recoilYaw = 0;
      state.health = 100;
      state.armor = 0;
      state.alive = true;
      state.carrier = false;
      state.flashUntil = 0;
      state.weapons = [];
      state.grenades = { flash: 0, smoke: 0, frag: 0 };
      state.currentWeapon = 0;
      state.grenadeKind = 'frag';
    },
    distanceTo(x, z) {
      return flatDistance(body.position.x, body.position.z, x, z);
    },
  };
}
