// EMBERLINE — a round-based tactical FPS in three.js.
// Vanguard (amber) attacks: plant the surge charge at Site A or Site B.
// Sentinel (teal) defends: stop the plant, or defuse it. First to five
// rounds takes the match; money between rounds buys weapons, grenades and
// armour. Nine bots fill both teams; everything runs from static files.
//
// The main loop is fixed-step (60 Hz simulation, render decoupled) so the
// game plays the same on any machine. State lives in one place per module;
// this file only wires them together.

import * as THREE from 'three';
import { mulberry32, clamp } from './rng.js';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './map.js';
import { createPlayer, PLAYER_EYE } from './player.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS, PLANT_SECONDS, DEFUSE_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createGrenadeList, fragDamageAt } from './grenades.js';
import { createViewmodel } from './viewmodel.js';
import { createWeaponInstance, WEAPONS, GRENADES, ARMOR, SHOP, weaponReady, weaponPullTrigger, weaponReload, weaponFinishReload, weaponStep, weaponSpread } from './weapons.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1);
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyTop);
scene.fog = new THREE.Fog(PALETTE.fog, 34, 78);

const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 220);
scene.add(camera);

const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
sun.position.set(-18, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(PALETTE.hemisphereSky, PALETTE.hemisphereGround, 0.9));
const fill = new THREE.DirectionalLight(0x8a9ab8, 0.35);
fill.position.set(14, 10, -18);
scene.add(fill);
// A soft light on the camera lifts the viewmodel gun out of the dark.
const cameraLight = new THREE.PointLight(0xffe0b3, 2.2, 4, 1.6);
cameraLight.position.set(0.2, 0.1, 0.1);
camera.add(cameraLight);

const world = createWorld(scene);
const hud = createHud(document);
const input = createInput(document, renderer.domElement);
const audio = createAudio();
const effects = createEffects(scene);
const combat = createCombat(world);
const rounds = createRounds();
const playerTeam = 'vanguard';

const playerSpawn = SPAWNS.vanguard[2];
const player = createPlayer(playerSpawn[0], playerSpawn[1], 0);
const playerActor = {
  name: 'You',
  team: playerTeam,
  isBot: false,
  body: player.body,
  get alive() { return player.state.alive; },
  damage(amount, isHeadshot) { return player.damage(amount, isHeadshot); },
};

const bots = createBots(scene, world, random);
const actors = [playerActor, ...bots.bots];

const grenades = createGrenadeList(scene, {
  explosion: (position, thrower) => {
    effects.explode(position);
    audio.explosion(0);
    bots.onNoise({ x: position.x, z: position.z }, 60, 'none', elapsed);
    for (const actor of actors) {
      if (!actor.alive || actor === thrower) continue;
      const damage = fragDamageAt(position, actor.body.position, world.occluders);
      if (damage > 0) {
        const wasAlive = actor.alive;
        actor.damage(damage, false);
        if (wasAlive && !actor.alive) {
          const killerName = thrower ? thrower.name : 'Frag Charge';
          const killerTeam = thrower ? thrower.team : playerTeam;
          hud.addKill(killerName, killerTeam, actor.name, actor.team, false);
          if (thrower === playerActor) rounds.awardKill();
          else if (thrower) bots.awardKillMoney(thrower);
        }
      }
    }
  },
  flash: (position, radius) => {
    audio.flash();
    const eye = player.eyePosition(new THREE.Vector3());
    const facing = player.facing(new THREE.Vector3());
    const blindness = bots.onFlashed(position, radius, elapsed, effects, eye, facing);
    if (blindness > 0.3) player.state.flashUntil = elapsed + blindness;
  },
  smoke: (position, duration) => {
    effects.smoke(position, duration);
  },
});

const viewmodel = createViewmodel(scene, camera);

let elapsed = 0;
let started = false;
let buyOpen = false;
let spectateBot = null;
let plantHeld = 0;
let defuseHeld = 0;
let lastRoundPhase = 'lobby';
let lastRound = 1;

const eyePosition = new THREE.Vector3();
const shootDirection = new THREE.Vector3();
const muzzlePosition = new THREE.Vector3();
const tempVector = new THREE.Vector3();

function currentWeapon() {
  return player.state.weapons[player.state.currentWeapon];
}

function equipWeapon(index) {
  const weapon = player.state.weapons[index];
  if (!weapon) return;
  player.state.currentWeapon = index;
  viewmodel.setWeapon(weapon.def.kind);
  hud.setAmmo(weapon.mag, weapon.reserve);
  audio.click();
}

function giveStarterLoadout() {
  player.state.weapons = [createWeaponInstance('sidearm')];
  player.state.currentWeapon = 0;
  viewmodel.setWeapon('pistol');
  hud.setAmmo(12, 36);
}

function buyItem(entry) {
  if (rounds.state.phase !== 'buy') return;
  if (entry.type === 'weapon') {
    const def = WEAPONS[entry.id];
    if (rounds.state.money < def.price) { audio.denied(); return; }
    const existing = player.state.weapons.find((w) => w.def.id === entry.id);
    if (existing) {
      existing.reserve = def.reserve;
      existing.mag = def.mag;
      rounds.state.money -= def.price;
      audio.buy();
      hud.setMoney(rounds.state.money);
      hud.setBuyMoney(rounds.state.money);
      equipWeapon(player.state.weapons.indexOf(existing));
      return;
    }
    rounds.state.money -= def.price;
    const weapon = createWeaponInstance(entry.id);
    player.state.weapons.push(weapon);
    audio.buy();
    hud.setMoney(rounds.state.money);
    hud.setBuyMoney(rounds.state.money);
    equipWeapon(player.state.weapons.length - 1);
  } else if (entry.type === 'grenade') {
    const def = GRENADES[entry.id];
    if (rounds.state.money < def.price) { audio.denied(); return; }
    if (player.state.grenades[entry.id] >= 2) { audio.denied(); return; }
    rounds.state.money -= def.price;
    player.state.grenades[entry.id] += 1;
    player.state.grenadeKind = entry.id;
    audio.buy();
    hud.setMoney(rounds.state.money);
    hud.setBuyMoney(rounds.state.money);
  } else {
    const def = ARMOR[entry.id];
    if (rounds.state.money < def.price) { audio.denied(); return; }
    if (player.state.armor >= def.value) { audio.denied(); return; }
    rounds.state.money -= def.price;
    player.state.armor = def.value;
    audio.buy();
    hud.setMoney(rounds.state.money);
    hud.setBuyMoney(rounds.state.money);
    hud.setHealth(player.state.health, player.state.armor);
  }
}

function toggleBuy(open) {
  if (rounds.state.phase !== 'buy' && open) return;
  buyOpen = open;
  if (open) {
    hud.openBuy(buyItem, rounds.state.money);
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    hud.closeBuy();
    // Back into the game: re-lock the mouse from this user gesture. If the
    // browser refuses (it enforces a short cooldown after an exit), the
    // paused overlay stays and the player clicks Resume instead.
    if (started && player.state.alive && rounds.state.phase !== 'matchEnd' && !shot) input.requestLock();
  }
}

function onBotShot(bot, result) {
  bots.onNoise({ x: bot.body.position.x, z: bot.body.position.z }, 26, bot.team, elapsed);
  // resolveShot already applied the damage; here we handle the consequences:
  // the kill feed, the player's damage flash and death, and kill money.
  for (const hit of result.hits) {
    onHit(hit, bot);
  }
}

function onHit(hit, shooter) {
  if (hit.actor === playerActor) {
    const dx = shooter.body.position.x - player.body.position.x;
    const dz = shooter.body.position.z - player.body.position.z;
    const angle = Math.atan2(dx, dz);
    const relative = angle - player.yaw;
    hud.damageFlash(-relative);
    if (!player.state.alive) {
      rounds.state.deaths += 1;
      const teammates = bots.bots.filter((b) => b.team === playerTeam && b.alive);
      spectateBot = teammates.length > 0 ? teammates[Math.floor(random() * teammates.length)] : null;
      if (!shot) hud.showOverlay('dead', 0);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  } else if (hit.killed) {
    hud.addKill(shooter.name, shooter.team, hit.actor.name, hit.actor.team, hit.part === 'head');
    if (shooter.team !== playerTeam) bots.awardKillMoney(shooter);
  }
}

function playerShoot() {
  const weapon = currentWeapon();
  if (!weapon) return;
  if (!weaponReady(weapon, elapsed)) return;
  if (weapon.mag <= 0) {
    audio.dryFire();
    weaponReload(weapon, elapsed);
    audio.reload();
    viewmodel.startReload();
    return;
  }
  weaponPullTrigger(weapon, elapsed);
  player.eyePosition(eyePosition);
  player.facing(shootDirection);
  viewmodel.muzzleWorldPosition(muzzlePosition);
  viewmodel.fire();
  const spread = weaponSpread(weapon, player.groundSpeed());
  const result = combat.resolveShot(eyePosition, shootDirection, weapon.def, spread, playerActor, actors, random);
  effects.tracer(muzzlePosition, result.endPoint);
  audio.shot(weapon.def.kind, 0);
  bots.onNoise(muzzlePosition, 30, playerTeam, elapsed);
  player.recoil(weapon.def.recoil, (random() * 2 - 1) * 0.004);
  if (result.hits.length > 0) {
    for (const hit of result.hits) {
      hud.hitMarker(hit.killed, hit.killed ? 4000 : 120);
      audio.hit(hit.killed);
      if (hit.killed) {
        hud.addKill('You', playerTeam, hit.actor.name, hit.actor.team, hit.part === 'head');
        rounds.awardKill();
      }
    }
  } else if (result.blocked && result.endPoint) {
    effects.sparksAt(result.endPoint, 6);
  }
  hud.setAmmo(weapon.mag, weapon.reserve);
}

function resetRound(roundNumber) {
  bots.reset();
  actors.length = 1;
  actors.push(...bots.bots);
  bots.buyAll();
  const spawn = SPAWNS.vanguard[2];
  player.reset(spawn[0], spawn[1], 0);
  giveStarterLoadout();
  grenades.clear();
  effects.clear();
  spectateBot = null;
  plantHeld = 0;
  defuseHeld = 0;
  rounds.startRound(roundNumber);
  // The round starts with the charge on the player's back: the plant is
  // the player's job, and the bots push the same site as a team.
  rounds.state.bomb.carrier = playerActor;
  player.state.carrier = true;
  hud.setHealth(100, 0);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.wins, roundNumber);
  hud.setAlive(5, 5);
  // If the player is alive but not locked (after spectating a death, say),
  // offer the way back in; the overlay is the only click target that locks.
  if (!input.state.locked && !shot) hud.showOverlay(started ? 'paused' : 'start', 0);
  else hud.hideOverlay();
}

function startMatch() {
  resetRound(1);
  rounds.startMatch(playerTeam);
  // startMatch resets the bomb; the charge belongs to the player.
  rounds.state.bomb.carrier = playerActor;
  player.state.carrier = true;
  hud.setScore(rounds.state.wins, 1);
}

function syncCamera() {
  if (!player.state.alive && spectateBot) {
    const bot = spectateBot;
    camera.position.set(bot.body.position.x, bot.body.position.y + PLAYER_EYE, bot.body.position.z);
    camera.rotation.set(0, bot.yaw, 0, 'YXZ');
    return;
  }
  player.eyePosition(camera.position);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;

  if (phase !== lastRoundPhase || rounds.state.round !== lastRound) {
    if (phase === 'buy' && rounds.state.round !== lastRound) {
      resetRound(rounds.state.round);
    }
    if (phase === 'roundEnd') {
      const winner = rounds.roundWinner;
      const won = winner === playerTeam;
      hud.showBanner(won ? 'win' : 'lose', won ? 'Round won' : 'Round lost', `Vanguard ${rounds.state.wins.vanguard} — ${rounds.state.wins.sentinel} Sentinel`, 4);
      if (won) audio.roundWin();
      else audio.roundLose();
    }
    if (phase === 'matchEnd') {
      const won = rounds.state.wins[playerTeam] > rounds.state.wins[playerTeam === 'vanguard' ? 'sentinel' : 'vanguard'];
      hud.showBanner(won ? 'win' : 'lose', won ? 'Match won' : 'Match lost', `Final: Vanguard ${rounds.state.wins.vanguard} — ${rounds.state.wins.sentinel} Sentinel`, 5);
      if (!shot) hud.showOverlay('match', rounds.state.money);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    lastRoundPhase = phase;
    lastRound = rounds.state.round;
  }

  rounds.step(dt, { player, playerTeam, bots }, elapsed);

  if (phase === 'live' || phase === 'buy') {
    player.step(dt, input.state, world.colliders, (kind) => {
      if (kind === 'step') audio.step();
      if (kind === 'jump') audio.jump();
    }, elapsed);
    if (phase === 'live') bots.step(dt, actors, rounds.state, elapsed, {
      combat,
      actors,
      effects,
      onBotShot,
      onChargePickup: (bot) => {
        rounds.state.bomb.state = 'carried';
        rounds.state.bomb.carrier = bot;
        if (bot.team === playerTeam) hud.setChargeHint('');
      },
      onPlant: (bot, site) => {
        rounds.state.bomb.state = 'planted';
        rounds.state.bomb.site = site;
        rounds.state.bomb.x = SITES[site].x;
        rounds.state.bomb.z = SITES[site].z;
        rounds.state.bomb.plantedAt = elapsed;
        rounds.state.bomb.carrier = null;
        rounds.awardPlant();
        audio.plantDone();
        hud.showBanner('info', 'Charge planted at Site ' + site, 'Sentinel has 35 seconds to defuse it', 3);
      },
      onDefuse: (bot) => {
        rounds.state.bomb.state = 'defused';
        rounds.endRound('sentinel', elapsed, { player, playerTeam, bots, onRoundMoney: (winner) => bots.awardRoundMoney(winner) });
        audio.defuseDone();
      },
    });
    grenades.step(dt, () => {});
    effects.step(elapsed);
  }

  // Shooting, reloading and grenades: only while the round is live.
  if (phase === 'live' && player.state.alive && input.state.locked) {
    const weapon = currentWeapon();
    if (weapon) {
      if (elapsed >= weapon.reloadingUntil && weapon.reloadingUntil > 0) weaponFinishReload(weapon);
      weaponStep(weapon, dt);
      if (input.state.firing && weaponReady(weapon, elapsed)) {
      // Automatic weapons fire while the trigger is held; semi-automatic
      // ones fire once per click.
      if (weapon.def.auto || input.takePressed('Mouse0')) playerShoot();
    }
    }
    if (input.takePressed('KeyR')) {
      const w = currentWeapon();
      if (w && weaponReload(w, elapsed)) {
        audio.reload();
        viewmodel.startReload();
      }
    }
    if (input.takePressed('Digit1')) equipWeapon(0);
    if (input.takePressed('Digit2')) equipWeapon(1);
    if (input.takePressed('Digit3')) {
      const kinds = ['frag', 'smoke', 'flash'];
      const index = kinds.indexOf(player.state.grenadeKind);
      player.state.grenadeKind = kinds[(index + 1) % kinds.length];
      audio.click();
    }
    if (input.takePressed('KeyG')) {
      const kind = player.state.grenadeKind;
      if (player.state.grenades[kind] > 0) {
        player.state.grenades[kind] -= 1;
        player.eyePosition(eyePosition);
        player.facing(shootDirection);
        eyePosition.y -= 0.15;
        grenades.throwGrenade(kind, eyePosition, shootDirection, playerActor);
        audio.click();
      } else {
        audio.denied();
      }
    }
  }

  // Planting and defusing: hold E near the site or the charge.
  const bomb = rounds.state.bomb;
  if (phase === 'live' && player.state.alive && input.state.locked) {
    if (bomb.state === 'carried' && player.state.carrier && playerTeam === 'vanguard') {
      let nearest = null;
      for (const key of ['A', 'B']) {
        const distance = player.distanceTo(SITES[key].x, SITES[key].z);
        if (distance < SITES[key].radius && (!nearest || distance < nearest.distance)) nearest = { key, distance };
      }
      if (nearest) {
        hud.setChargeHint(`Hold E to plant the charge at Site ${nearest.key}`);
        if (input.state.locked && keysHeldE()) {
          plantHeld += dt;
          hud.setPlantProgress(plantHeld / PLANT_SECONDS);
          if (Math.floor(plantHeld * 4) !== Math.floor((plantHeld - dt) * 4)) audio.plantTick();
          if (plantHeld >= PLANT_SECONDS) {
            bomb.state = 'planted';
            bomb.site = nearest.key;
            bomb.x = SITES[nearest.key].x;
            bomb.z = SITES[nearest.key].z;
            bomb.plantedAt = elapsed;
            bomb.carrier = null;
            player.state.carrier = false;
            rounds.awardPlant();
            audio.plantDone();
            hud.showBanner('info', 'Charge planted at Site ' + nearest.key, 'Defend it for 35 seconds', 3);
            hud.setPlantProgress(null);
            hud.setChargeHint('');
            plantHeld = 0;
          }
        } else {
          plantHeld = 0;
          hud.setPlantProgress(null);
        }
      } else {
        hud.setChargeHint('Carry the charge to Site A or Site B — hold E there to plant');
        plantHeld = 0;
        hud.setPlantProgress(null);
      }
    } else if (bomb.state === 'planted' && playerTeam === 'sentinel') {
      const distance = player.distanceTo(bomb.x, bomb.z);
      if (distance < 2.2) {
        hud.setChargeHint('Hold E to defuse the charge');
        if (keysHeldE()) {
          defuseHeld += dt;
          hud.setPlantProgress(defuseHeld / DEFUSE_SECONDS);
          if (Math.floor(defuseHeld * 4) !== Math.floor((defuseHeld - dt) * 4)) audio.plantTick();
          if (defuseHeld >= DEFUSE_SECONDS) {
            bomb.state = 'defused';
            rounds.endRound('sentinel', elapsed, { player, playerTeam, bots, onRoundMoney: (winner) => bots.awardRoundMoney(winner) });
            audio.defuseDone();
            hud.setPlantProgress(null);
            hud.setChargeHint('');
            defuseHeld = 0;
          }
        } else {
          defuseHeld = 0;
          hud.setPlantProgress(null);
        }
      } else {
        hud.setChargeHint('The charge is planted — reach it to defuse');
        defuseHeld = 0;
        hud.setPlantProgress(null);
      }
    } else if (bomb.state === 'dropped') {
      const distance = player.distanceTo(bomb.x, bomb.z);
      if (distance < 1.5) {
        player.state.carrier = true;
        bomb.state = 'carried';
        bomb.carrier = playerActor;
        hud.setChargeHint('');
      } else {
        hud.setChargeHint('The charge was dropped — pick it up');
      }
    } else {
      hud.setChargeHint('');
      plantHeld = 0;
      defuseHeld = 0;
      hud.setPlantProgress(null);
    }
  }

  // If the carrier dies, the charge drops where they fell; a teammate can
  // pick it up, or the player can walk over it.
  if (bomb.state === 'carried' && bomb.carrier && !bomb.carrier.alive) {
    const carrier = bomb.carrier;
    bomb.state = 'dropped';
    bomb.x = carrier.body.position.x;
    bomb.z = carrier.body.position.z;
    bomb.carrier = null;
    if (carrier === playerActor) player.state.carrier = false;
    else carrier.carrier = false;
  }

  // The charge rides on its carrier's back.
  const chargeGroup = chargeGroupRef;
  if (bomb.state === 'carried' && bomb.carrier) {
    const carrier = bomb.carrier;
    chargeGroup.visible = true;
    chargeGroup.position.set(carrier.body.position.x, carrier.body.position.y + 1.1, carrier.body.position.z);
    if (carrier === playerActor) {
      chargeGroup.position.x += Math.sin(player.yaw) * 0.2;
      chargeGroup.position.z += Math.cos(player.yaw) * 0.2;
    }
  } else if (bomb.state === 'dropped') {
    chargeGroup.visible = true;
    chargeGroup.position.set(bomb.x, 0.35, bomb.z);
  } else {
    chargeGroup.visible = false;
  }

  // HUD: everything the player reads, every frame.
  const weapon = currentWeapon();
  if (weapon) hud.setAmmo(weapon.mag, weapon.reserve);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setMoney(rounds.state.money);
  const timer = bomb.state === 'planted' ? rounds.bombTimeLeft(elapsed) : rounds.state.timer;
  hud.setTimer(timer, bomb.state === 'planted');
  hud.setScore(rounds.state.wins, rounds.state.round);
  const vanguardAlive = bots.bots.filter((b) => b.team === 'vanguard' && b.alive).length + (player.state.alive ? 1 : 0);
  const sentinelAlive = bots.bots.filter((b) => b.team === 'sentinel' && b.alive).length;
  hud.setAlive(vanguardAlive, sentinelAlive);
  if (bomb.state === 'planted') {
    hud.setBombStatus(`CHARGE PLANTED — SITE ${bomb.site} · ${Math.ceil(rounds.bombTimeLeft(elapsed))}s`, true);
  } else if (phase === 'buy') {
    hud.setBombStatus(`BUY PHASE — HIT SITE ${bots.attackSite} · $${rounds.state.money} · press B`, false);
  } else {
    hud.setBombStatus('', false);
  }
  const spread = weapon ? weaponSpread(weapon, player.groundSpeed()) : 0.01;
  hud.setCrosshairGap(6 + spread * 900);
  const flashLeft = Math.max(0, player.state.flashUntil - elapsed);
  hud.setFlashOpacity(flashLeft > 0 ? Math.min(1, flashLeft / 2) : 0);
  hud.tick(elapsed);

  // The buy menu.
  if (input.takePressed('KeyB')) toggleBuy(!buyOpen);
  if (buyOpen && input.takePressed('Escape')) toggleBuy(false);
  if (buyOpen) {
    // Number keys buy while the menu is open, as its hint promises.
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']) {
      if (input.takePressed(code)) {
        const entry = SHOP.find((item) => item.key === code.slice(5));
        if (entry) buyItem(entry);
      }
    }
    hud.setBuyMoney(rounds.state.money);
  }

  viewmodel.step(dt, player.groundSpeed(), elapsed);
  world.beaconLight.intensity = 24 + Math.sin(elapsed * 2.4) * 8;
  world.beacon.position.y = 6.7 + Math.sin(elapsed * 2.4) * 0.08;
  for (const [key, ring] of Object.entries(world.siteRings)) {
    ring.material.opacity = 0.4 + Math.sin(elapsed * 1.8 + (key === 'A' ? 0 : 2)) * 0.15;
  }
  syncCamera();
  input.endFrame();
}

function keysHeldE() {
  return eHeld;
}

let eHeld = false;
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyE') eHeld = true;
});
document.addEventListener('keyup', (event) => {
  if (event.code === 'KeyE') eHeld = false;
});

// The charge: a small glowing box the carrier wears on their back.
const chargeGroupRef = (() => {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 0.12),
    new THREE.MeshStandardMaterial({ color: PALETTE.vanguard, emissive: PALETTE.vanguard, emissiveIntensity: 0.7, roughness: 0.4 }),
  );
  group.add(box);
  const light = new THREE.PointLight(PALETTE.vanguard, 4, 6, 1.8);
  light.position.set(0, 0.2, 0);
  group.add(light);
  group.visible = false;
  scene.add(group);
  return group;
})();

input.onLook((dx, dy) => {
  if (!input.state.locked) return;
  const next = input.applyLook(player.yaw, player.pitch, dx, dy);
  player.yaw = next.yaw;
  player.pitch = next.pitch;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    audio.resume();
    if (rounds.state.phase === 'lobby') {
      startMatch();
      started = true;
    }
    hud.hideOverlay();
  } else if (started && player.state.alive && rounds.state.phase !== 'matchEnd' && !shot && !buyOpen) {
    hud.showOverlay('paused', 0);
  }
});

hud.onPlay(() => {
  if (!player.state.alive && rounds.state.phase === 'live') {
    hud.hideOverlay();
    return;
  }
  if (rounds.state.phase === 'matchEnd') {
    startMatch();
  }
  audio.resume();
  input.requestLock();
});

hud.onBuyClose(() => toggleBuy(false));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Shot modes: deterministic renders for the dossier screenshots.
function runShot(mode) {
  startMatch();
  started = true;
  if (mode === 'start') {
    hud.showOverlay('start', 0);
  } else if (mode === 'play') {
    rounds.state.timer = 82;
    rounds.beginLive(elapsed);
    player.yaw = 0.12;
    player.pitch = -0.02;
    player.body.position.x = 0;
    player.body.position.y = 0;
    player.body.position.z = 14;
    for (let i = 0; i < 240; i++) step(1 / 60);
    playerShoot();
    // The play shot is a living first-person view: the player stood in mid
    // for four seconds while five bots shot at them.
    player.state.health = 100;
    player.state.alive = true;
    spectateBot = null;
    for (let i = 0; i < 30; i++) step(1 / 60);
  } else if (mode === 'plant') {
    rounds.beginLive(elapsed);
    player.state.carrier = true;
    rounds.state.bomb.state = 'carried';
    rounds.state.bomb.carrier = playerActor;
    player.body.position.x = -13;
    player.body.position.y = 0;
    player.body.position.z = -9;
    player.yaw = 0.6;
    for (let i = 0; i < 60; i++) step(1 / 60);
    // The plant shot is a first-person view: make sure the player survived
    // the bots' opening fire.
    player.state.health = 100;
    player.state.alive = true;
    spectateBot = null;
    rounds.state.bomb.state = 'planted';
    rounds.state.bomb.site = 'A';
    rounds.state.bomb.x = SITES.A.x;
    rounds.state.bomb.z = SITES.A.z;
    rounds.state.bomb.plantedAt = elapsed;
    hud.showBanner('info', 'Charge planted at Site A', 'Defend it for 35 seconds', 10);
    for (let i = 0; i < 30; i++) step(1 / 60);
  } else if (mode === 'end') {
    rounds.state.wins = { vanguard: 4, sentinel: 3 };
    rounds.endRound('vanguard', elapsed, { player, playerTeam, bots, onRoundMoney: (winner) => bots.awardRoundMoney(winner) });
    hud.showBanner('win', 'Match won', 'Final: Vanguard 5 — 3 Sentinel', 10);
    for (let i = 0; i < 30; i++) step(1 / 60);
  }
  syncCamera();
  renderer.render(scene, camera);
  window.__shotReady = true;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (shot) {
    // Shot mode renders once and stops: the screenshot is taken from this frame.
    if (!window.__shotReady) runShot(shot);
    return;
  }
  const steps = Math.min(5, Math.ceil(delta / (1 / 60)));
  for (let i = 0; i < steps; i++) step(1 / 60);
  renderer.render(scene, camera);
}

if (shot) {
  runShot(shot);
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
