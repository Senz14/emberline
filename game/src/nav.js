// Breadth-first search over the map's waypoint graph. Bots ask for a path
// when they pick a destination; the graph is small (50 nodes) so a fresh BFS
// per request is cheap and never needs caching.

import { NODES, EDGES } from './map.js';
import { flatDistance } from './physics.js';

const ADJACENCY = NODES.map(() => []);
for (const [a, b] of EDGES) {
  ADJACENCY[a].push(b);
  ADJACENCY[b].push(a);
}

export function nearestNode(x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const distance = flatDistance(x, z, NODES[i][0], NODES[i][1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export function nodePosition(index) {
  return { x: NODES[index][0], z: NODES[index][1] };
}

// Returns an array of {x, z} waypoints from (sx, sz) to (tx, tz), excluding
// the start point, or null when no route exists.
export function findPath(sx, sz, tx, tz) {
  const start = nearestNode(sx, sz);
  const goal = nearestNode(tx, tz);
  if (start === goal) return [{ x: tx, z: tz }];
  const cameFrom = new Array(NODES.length).fill(-1);
  const queue = [start];
  cameFrom[start] = start;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === goal) break;
    for (const next of ADJACENCY[current]) {
      if (cameFrom[next] === -1) {
        cameFrom[next] = current;
        queue.push(next);
      }
    }
  }
  if (cameFrom[goal] === -1) return null;
  const path = [];
  let node = goal;
  while (node !== start) {
    path.unshift(nodePosition(node));
    node = cameFrom[node];
  }
  path.push({ x: tx, z: tz });
  return path;
}
