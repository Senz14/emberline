// Keyboard and pointer-lock mouse input. The state object is the one place
// the game reads keys from; takePressed gives edge detection for actions
// (reload, grenade, buy) that must fire once per press, not every frame.

import { clamp } from './rng.js';

export function createInput(document, canvas) {
  const keys = new Set();
  const state = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    crouch: false,
    firing: false,
    locked: false,
  };
  const pressed = new Set();

  const KEYMAP = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    Space: 'jump',
    ControlLeft: 'crouch',
    ControlRight: 'crouch',
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    const action = KEYMAP[event.code];
    if (action) {
      state[action] = true;
      if (action === 'jump') event.preventDefault();
    }
    if (event.code === 'Space') event.preventDefault();
    pressed.add(event.code);
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) state[action] = false;
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      state.firing = true;
      pressed.add('Mouse0');
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }

  function onLockChange() {
    state.locked = document.pointerLockElement === canvas;
  }

  function onMouseMove(event) {
    if (!state.locked) return;
    if (onMouseMove.handler) onMouseMove.handler(event.movementX, event.movementY);
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    state,
    // True once, on the frame the key went down; the set is cleared by
    // endFrame, so an action bound here fires at most once per press.
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    hasPressed(code) {
      return pressed.has(code);
    },
    endFrame() {
      pressed.clear();
    },
    requestLock() {
      try {
        const result = canvas.requestPointerLock();
        if (result && typeof result.catch === 'function') result.catch(() => {});
        return result;
      } catch {
        return undefined;
      }
    },
    onLook(handler) {
      onMouseMove.handler = handler;
    },
    // Apply mouse deltas to yaw/pitch with a fixed sensitivity.
    applyLook(yaw, pitch, dx, dy) {
      const sensitivity = 0.0022;
      const nextYaw = yaw - dx * sensitivity;
      const nextPitch = clamp(pitch - dy * sensitivity, -1.45, 1.45);
      return { yaw: nextYaw, pitch: nextPitch };
    },
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
