// Axis-aligned collision for a flat map: every obstacle is a box (or a
// cylinder approximated as a box for movement), and every actor is a vertical
// capsule approximated as a box with a radius and a height.

export function makeBody(x, z, radius, height) {
  return {
    position: { x, y: 0, z },
    velocity: { x: 0, y: 0, z: 0 },
    radius,
    height,
    onGround: true,
  };
}

// Move a body one step, resolving X and Z separately so sliding along a wall
// works, then applying gravity and the floor.
export function moveBody(body, dt, obstacles, gravity = 22) {
  body.velocity.y -= gravity * dt;
  body.position.x += body.velocity.x * dt;
  resolveAxis(body, obstacles, 'x');
  body.position.z += body.velocity.z * dt;
  resolveAxis(body, obstacles, 'z');
  body.position.y += body.velocity.y * dt;
  if (body.position.y <= 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  } else {
    body.onGround = false;
  }
}

function resolveAxis(body, obstacles, axis) {
  const half = body.radius;
  const top = body.position.y + body.height;
  for (const obstacle of obstacles) {
    if (top <= obstacle.minY || body.position.y >= obstacle.maxY) continue;
    if (body.position.x + half <= obstacle.minX || body.position.x - half >= obstacle.maxX) continue;
    if (body.position.z + half <= obstacle.minZ || body.position.z - half >= obstacle.maxZ) continue;
    if (axis === 'x') {
      body.position.x = body.velocity.x > 0
        ? obstacle.minX - half - 0.001
        : obstacle.maxX + half + 0.001;
      body.velocity.x = 0;
    } else {
      body.position.z = body.velocity.z > 0
        ? obstacle.minZ - half - 0.001
        : obstacle.maxZ + half + 0.001;
      body.velocity.z = 0;
    }
  }
}

// True when a straight segment between two points at a given height is not
// blocked by any obstacle (used for sight lines and frag damage).
export function hasLineOfSight(from, to, obstacles, height = 1.4) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return true;
  const steps = Math.max(1, Math.ceil(length / 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    for (const obstacle of obstacles) {
      if (height < obstacle.minY || height > obstacle.maxY) continue;
      if (x >= obstacle.minX && x <= obstacle.maxX && z >= obstacle.minZ && z <= obstacle.maxZ) return false;
    }
  }
  return true;
}

export function flatDistance(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

// The closest point on a box to (x, z), used to measure how near a blast is
// to a body that is partly behind cover.
export function closestPointOnBox(x, z, box) {
  return {
    x: Math.max(box.minX, Math.min(x, box.maxX)),
    z: Math.max(box.minZ, Math.min(z, box.maxZ)),
  };
}
