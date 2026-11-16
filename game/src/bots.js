// The nine bots: four Vanguard teammates and five Sentinel opponents. Each
// bot runs a small state machine — buy, move along a waypoint route, hold a
// position, engage a visible enemy, investigate a noise, plant or defuse —
// with a reaction delay and aim error so they feel like players, not
// aimbots. They buy from a simulated purse, pick up a dropped charge, and
// rotate to a planted site. Their visuals are simple capsule soldiers with a
// team-coloured ring and a gun box.

import * as THREE from 'three';
import { makeBody, moveBody, flatDistance, hasLineOfSight } from './physics.js';
import { findPath, nearestNode, nodePosition } from './nav.js';
import { SPAWNS, SITES } from './map.js';
import { WEAPONS } from './weapons.js';
import { clamp, weightedPick } from './rng.js';
import { TEAM } from './palette.js';

const BOT_SPEED = 4.6;
const BOT_RADIUS = 0.42;
const BOT_HEIGHT = 1.75;
const BOT_GRAVITY = 22;
const REACTION_MIN = 0.45;
const REACTION_MAX = 0.95;
const FOV_COS = 0.25;

const NAMES = {
  vanguard: ['Ash', 'Bram', 'Cleo', 'Dara'],
  sentinel: ['Ember', 'Frost', 'Gage', 'Holly', 'Ivo'],
};

const LOADOUTS = [
  { value: 'rifle', weight: 5 },
  { value: 'smg', weight: 3 },
  { value: 'dmr', weight: 2 },
  { value: 'scattergun', weight: 2 },
  { value: 'lmg', weight: 1 },
];

export function createBots(scene, world, random) {
  const bots = [];
  const group = new THREE.Group();
  scene.add(group);
  // The team's plan for the round: every Vanguard bot pushes the same site,
  // so the attack arrives as a group instead of one bot at a time.
  let attackSite = 'A';

  function makeVisuals(team) {
    const visuals = new THREE.Group();
    const color = TEAM[team].main;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x554e42, roughness: 0.8 });
    const teamMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), bodyMaterial);
    torso.position.y = 1.05;
    torso.castShadow = true;
    visuals.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), teamMaterial);
    chest.position.y = 1.15;
    visuals.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), bodyMaterial);
    head.position.y = 1.62;
    head.castShadow = true;
    visuals.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), teamMaterial);
    visor.position.set(0, 1.62, -0.18);
    visuals.add(visor);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), bodyMaterial);
    legL.position.set(-0.16, 0.31, 0);
    visuals.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    visuals.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.62), new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.7 }));
    gun.position.set(0.28, 1.2, -0.3);
    visuals.add(gun);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    visuals.add(ring);
    return { group: visuals, torso, head };
  }

  function spawnBot(team, index) {
    const spawn = SPAWNS[team][index];
    const body = makeBody(spawn[0], spawn[1], BOT_RADIUS, BOT_HEIGHT);
    const visuals = makeVisuals(team);
    group.add(visuals.group);
    const bot = {
      name: NAMES[team][index],
      team,
      isBot: true,
      body,
      visuals,
      yaw: team === 'vanguard' ? 0 : Math.PI,
      alive: true,
      health: 100,
      armor: 0,
      money: 800,
      weapon: null,
      weaponId: 'sidearm',
      state: 'route',
      route: null,
      routeIndex: 0,
      holdUntil: 0,
      targetSite: null,
      carrier: false,
      investigateNode: null,
      investigateUntil: 0,
      seenEnemy: null,
      seenAt: 0,
      reactionUntil: 0,
      lastShotAt: 0,
      burstLeft: 0,
      burstUntil: 0,
      strafeDirection: 1,
      strafeUntil: 0,
      plantProgress: 0,
      defuseProgress: 0,
      flashUntil: 0,
      walkPhase: Math.random() * Math.PI * 2,
      damage(amount) {
        if (!bot.alive) return false;
        let remaining = amount;
        if (bot.armor > 0) {
          const absorbed = Math.min(bot.armor, Math.ceil(remaining * 0.5));
          bot.armor -= absorbed;
          remaining -= absorbed;
        }
        bot.health -= remaining;
        if (bot.health <= 0) {
          bot.health = 0;
          bot.alive = false;
          bot.visuals.group.visible = false;
          return true;
        }
        return false;
      },
    };
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    for (const bot of bots) group.remove(bot.visuals.group);
    bots.length = 0;
    for (let i = 0; i < 4; i++) spawnBot('vanguard', i);
    for (let i = 0; i < 5; i++) spawnBot('sentinel', i);
  }

  function buy(bot) {
    const weaponId = weightedPick(random, LOADOUTS);
    const def = WEAPONS[weaponId];
    if (bot.money >= def.price) {
      bot.money -= def.price;
      bot.weaponId = pick.weapon;
    } else {
      bot.weaponId = 'sidearm';
    }
    bot.weapon = { def, mag: def.mag, reserve: def.reserve, lastShotAt: 0, reloadingUntil: 0 };
    if (bot.money >= 650 && (bot.team === 'vanguard' || random() < 0.5)) {
      bot.money -= 650;
      bot.armor = 50;
    }
  }

  function buyAll() {
    for (const bot of bots) buy(bot);
  }

  function pickDestination(bot, game) {
    // Defenders hold near a site; attackers push the team's site together.
    if (bot.team === 'sentinel') {
      const site = random() < 0.5 ? SITES.A : SITES.B;
      const angle = random() * Math.PI * 2;
      // Defenders hold off the site itself (5–9 m out), so attackers can
      // enter the site and plant instead of walking into a point-blank
      // crossfire the moment they arrive.
      const radius = 5 + random() * 4;
      return { x: site.x + Math.cos(angle) * radius, z: site.z + Math.sin(angle) * radius, site: site.label };
    }
    if (bot.carrier) {
      const site = bot.targetSite === 'B' ? SITES.B : SITES.A;
      return { x: site.x, z: site.z, site: site.label };
    }
    const site = attackSite === 'B' ? SITES.B : SITES.A;
    bot.targetSite = site.label;
    return { x: site.x, z: site.z, site: site.label };
  }

  function setRoute(bot, destination) {
    const path = findPath(bot.body.position.x, bot.body.position.z, destination.x, destination.z);
    if (!path) return false;
    bot.route = path;
    bot.routeIndex = 0;
    bot.state = 'route';
    return true;
  }

  function visibleEnemy(bot, actors, game, now, effects) {
    let best = null;
    let bestDistance = Infinity;
    const eye = { x: bot.body.position.x, y: bot.body.position.y + 1.5, z: bot.body.position.z };
    for (const actor of actors) {
      if (actor === bot || !actor.alive || actor.team === bot.team) continue;
      const distance = flatDistance(bot.body.position.x, bot.body.position.z, actor.body.position.x, actor.body.position.z);
      if (distance > 42) continue;
      if (distance >= bestDistance) continue;
      const target = { x: actor.body.position.x, y: actor.body.position.y + 1.2, z: actor.body.position.z };
      const dx = actor.body.position.x - bot.body.position.x;
      const dz = actor.body.position.z - bot.body.position.z;
      const facingX = -Math.sin(bot.yaw);
      const facingZ = -Math.cos(bot.yaw);
      const facing = (dx * facingX + dz * facingZ) / Math.max(distance, 0.001);
      const behind = facing < FOV_COS && distance > 6;
      if (behind) continue;
      if (!hasLineOfSight(eye, target, world.occluders, 1.4)) continue;
      if (effects && effects.smokeBlocks(eye, target)) continue;
      best = actor;
      bestDistance = distance;
    }
    return best ? { actor: best, distance: bestDistance } : null;
  }

  function faceTowards(bot, x, z, dt) {
    const target = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += clamp(diff, -6 * dt, 6 * dt);
  }

  function steer(bot, target, dt) {
    const dx = target.x - bot.body.position.x;
    const dz = target.z - bot.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.3) return true;
    faceTowards(bot, target.x, target.z, dt);
    const speed = BOT_SPEED * (bot.state === 'engage' ? 0.55 : 1);
    bot.body.velocity.x = -Math.sin(bot.yaw) * speed;
    bot.body.velocity.z = -Math.cos(bot.yaw) * speed;
    return false;
  }

  function fireAt(bot, target, dt, now, hooks) {
    const def = bot.weapon.def;
    const distance = flatDistance(bot.body.position.x, bot.body.position.z, target.body.position.x, target.body.position.z);
    if (bot.weapon.reloading) {
      if (now < bot.weapon.reloadingUntil) return;
      const taken = Math.min(def.mag, bot.weapon.reserve);
      bot.weapon.mag = taken;
      bot.weapon.reserve -= taken;
      bot.weapon.reloading = false;
    }
    if (bot.weapon.mag <= 0) {
      if (bot.weapon.reserve <= 0) return;
      bot.weapon.reloadingUntil = now + def.reloadTime;
      bot.weapon.reloading = true;
      return;
    }
    if (now < bot.lastShotAt + def.fireGap) return;
    if (bot.burstLeft <= 0) {
      if (now < bot.burstUntil) return;
      bot.burstLeft = def.auto ? 2 + Math.floor(random() * 3) : 1;
      bot.burstUntil = now + 0.7 + random() * 0.9;
    }
    bot.burstLeft -= 1;
    bot.lastShotAt = now;
    bot.weapon.mag -= 1;
    const eye = { x: bot.body.position.x, y: bot.body.position.y + 1.5, z: bot.body.position.z };
    const aimError = clamp(0.024 + distance * 0.0016, 0.024, 0.085);
    const aim = {
      x: (target.body.position.x - eye.x) / distance + (random() * 2 - 1) * aimError,
      y: (1.2 - 1.5) / Math.max(distance, 1) + (random() * 2 - 1) * aimError * 0.5,
      z: (target.body.position.z - eye.z) / distance + (random() * 2 - 1) * aimError,
    };
    const length = Math.hypot(aim.x, aim.y, aim.z);
    aim.x /= length;
    aim.y /= length;
    aim.z /= length;
    const origin = new THREE.Vector3(eye.x, eye.y, eye.z);
    const direction = new THREE.Vector3(aim.x, aim.y, aim.z);
    const result = hooks.combat.resolveShot(origin, direction, def, aimError, bot, hooks.actors, random);
    hooks.onBotShot(bot, result);
  }

  function think(bot, dt, actors, game, now, hooks) {
    if (!bot.alive) return;
    if (now < bot.flashUntil) {
      bot.body.velocity.x = 0;
      bot.body.velocity.z = 0;
      return;
    }
    const sight = visibleEnemy(bot, actors, game, now, hooks.effects);
    if (sight) {
      if (bot.seenEnemy !== sight.actor) {
        bot.seenEnemy = sight.actor;
        bot.seenAt = now;
        bot.reactionUntil = now + REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
      }
      if (now >= bot.reactionUntil) {
        bot.state = 'engage';
        faceTowards(bot, sight.actor.body.position.x, sight.actor.body.position.z, dt);
        if (now > bot.strafeUntil) {
          bot.strafeDirection = random() < 0.5 ? -1 : 1;
          bot.strafeUntil = now + 0.6 + random() * 0.9;
        }
        const strafeSpeed = BOT_SPEED * 0.45 * bot.strafeDirection;
        bot.body.velocity.x = -Math.cos(bot.yaw) * strafeSpeed;
        bot.body.velocity.z = Math.sin(bot.yaw) * strafeSpeed;
        fireAt(bot, sight.actor, dt, now, hooks);
        return;
      }
    } else {
      bot.seenEnemy = null;
    }

    // A dropped charge is picked up by the nearest Vanguard bot that walks over it.
    if (game.bomb.state === 'dropped' && bot.team === 'vanguard') {
      const distance = flatDistance(bot.body.position.x, bot.body.position.z, game.bomb.x, game.bomb.z);
      if (distance < 1.5) {
        bot.carrier = true;
        bot.targetSite = attackSite;
        hooks.onChargePickup(bot);
      }
    }

    // Attackers with the charge plant when the site is clear.
    if (bot.carrier && bot.team === 'vanguard') {
      const site = bot.targetSite === 'B' ? SITES.B : SITES.A;
      const distance = flatDistance(bot.body.position.x, bot.body.position.z, site.x, site.z);
      if (distance < site.radius && !sight) {
        bot.state = 'plant';
        bot.plantProgress += dt;
        if (bot.plantProgress >= 3.5) {
          bot.plantProgress = 0;
          bot.carrier = false;
          hooks.onPlant(bot, bot.targetSite);
        }
        return;
      }
      bot.plantProgress = 0;
    }

    // Defenders defuse a planted charge when they reach it.
    if (game.bomb.state === 'planted' && bot.team === 'sentinel') {
      const distance = flatDistance(bot.body.position.x, bot.body.position.z, game.bomb.x, game.bomb.z);
      if (distance < 1.6 && !sight) {
        bot.state = 'defuse';
        bot.defuseProgress += dt;
        if (bot.defuseProgress >= 5) {
          bot.defuseProgress = 0;
          hooks.onDefuse(bot);
        }
        return;
      }
      bot.defuseProgress = 0;
    }

    // The bomb changes everything for defenders: rotate to the planted site.
    if (game.bomb.state === 'planted' && bot.team === 'sentinel') {
      const site = game.bomb.site === 'B' ? SITES.B : SITES.A;
      if (bot.state !== 'route' || !bot.route) {
        setRoute(bot, { x: site.x, z: site.z, site: site.label });
      }
    }

    // A noise pulls nearby bots to investigate for a few seconds.
    if (bot.investigateNode !== null && now < bot.investigateUntil) {
      const node = nodePosition(bot.investigateNode);
      if (steer(bot, node, dt)) {
        bot.investigateNode = null;
      }
      return;
    }
    bot.investigateNode = null;

    if (bot.state === 'hold') {
      if (now >= bot.holdUntil) {
        const destination = pickDestination(bot, game);
        setRoute(bot, destination);
      }
      return;
    }

    if (bot.state === 'route' && bot.route) {
      const waypoint = bot.route[bot.routeIndex];
      if (!waypoint) {
        bot.state = 'hold';
        bot.holdUntil = now + 2 + random() * 4;
        return;
      }
      if (steer(bot, waypoint, dt)) {
        bot.routeIndex += 1;
      }
      return;
    }

    const destination = pickDestination(bot, game);
    setRoute(bot, destination);
  }

  function step(dt, actors, game, now, hooks) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.body.velocity.x = 0;
      bot.body.velocity.z = 0;
      think(bot, dt, actors, game, now, hooks);
      moveBody(bot.body, dt, world.colliders, BOT_GRAVITY);
      bot.body.position.x = clamp(bot.body.position.x, -22, 22);
      bot.body.position.z = clamp(bot.body.position.z, -19, 19);
      const visuals = bot.visuals.group;
      visuals.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
      visuals.rotation.y = bot.yaw;
      const moving = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
      bot.walkPhase += dt * moving * 1.8;
      visuals.position.y = bot.body.position.y + Math.abs(Math.sin(bot.walkPhase)) * 0.03;
    }
  }

  function onNoise(position, radius, team, now) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const distance = flatDistance(bot.body.position.x, bot.body.position.z, position.x, position.z);
      if (distance < radius && random() < 0.7) {
        bot.investigateNode = nearestNode(position.x, position.z);
        bot.investigateUntil = now + 8;
      }
    }
  }

  function onFlashed(position, radius, now, effects, playerEye, playerFacing) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const eye = new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.5, bot.body.position.z);
      const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      const blindness = effects.flashBlindness(eye, facing, new THREE.Vector3(position.x, position.y, position.z), radius);
      if (blindness > 0.3) bot.flashUntil = now + blindness;
    }
    return playerEye ? effects.flashBlindness(playerEye, playerFacing, new THREE.Vector3(position.x, position.y, position.z), radius) : 0;
  }

  function reset() {
    attackSite = random() < 0.5 ? 'A' : 'B';
    spawnAll();
  }

  function awardKillMoney(bot) {
    if (bot) bot.money += 300;
  }

  function awardRoundMoney(winnerTeam) {
    for (const bot of bots) bot.money += bot.team === winnerTeam ? 3250 : 1900;
  }

  spawnAll();

  return {
    bots,
    get attackSite() { return attackSite; },
    step,
    reset,
    buyAll,
    onNoise,
    onFlashed,
    awardKillMoney,
    awardRoundMoney,
  };
}
