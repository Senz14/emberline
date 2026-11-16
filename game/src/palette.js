// EMBERLINE's look: a derelict solar relay station in a rust-red desert
// canyon at dusk. One palette object drives the map, the HUD and the CSS so
// the game reads as one place from every angle.

export const PALETTE = {
  // Sky and light.
  skyTop: 0x2e4a6b,
  skyHorizon: 0xd9822b,
  sun: 0xffb347,
  sunIntensity: 1.1,
  hemisphereSky: 0x8a7a8c,
  hemisphereGround: 0x5a4636,
  fog: 0x8c5a3c,
  // Ground and structures.
  sand: 0xc98d4e,
  sandDark: 0x8a5a30,
  concrete: 0x6e6a63,
  concreteDark: 0x4a4640,
  rust: 0x9a4a28,
  panel: 0x2c4a6b,
  panelGlow: 0x3da5a0,
  rock: 0x7a4a30,
  // Teams.
  vanguard: 0xe8a33d,
  sentinel: 0x3da5a0,
  // Interface.
  ink: '#f2ede4',
  muted: '#9a8f80',
  surface: '#1e1712',
  hairline: '#3a2e26',
  red: '#d84a35',
  green: '#7fb069',
};

// Per-team colours, used for bot rings, tracers and the scoreboard.
export const TEAM = {
  vanguard: { main: PALETTE.vanguard, css: '#e8a33d', name: 'Vanguard' },
  sentinel: { main: PALETTE.sentinel, css: '#3da5a0', name: 'Sentinel' },
};

export function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
