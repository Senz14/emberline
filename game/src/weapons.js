// The armoury. Six weapons, three grenades, two armour tiers — the same
// table drives the buy menu, the bots' wallets and the viewmodels, so a price
// or a damage number can never disagree between them.

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'VK-9 Sidearm', kind: 'pistol', price: 300,
    damage: 34, headshot: 2.2, fireGap: 0.16, auto: false,
    spread: 0.011, moveSpread: 0.035, recoil: 0.011,
    mag: 12, reserve: 36, reloadTime: 1.2, range: 60,
  },
  scattergun: {
    id: 'scattergun', name: 'Rook-12 Scattergun', kind: 'shotgun', price: 900,
    damage: 13, pellets: 8, headshot: 1.6, fireGap: 0.85, auto: false,
    spread: 0.042, moveSpread: 0.06, recoil: 0.05,
    mag: 6, reserve: 24, reloadTime: 2.4, range: 26,
  },
  smg: {
    id: 'smg', name: 'Needle-9 SMG', kind: 'smg', price: 1400,
    damage: 26, headshot: 1.9, fireGap: 0.075, auto: true,
    spread: 0.02, moveSpread: 0.05, recoil: 0.009,
    mag: 30, reserve: 90, reloadTime: 1.7, range: 45,
  },
  rifle: {
    id: 'rifle', name: 'Halberd-7 Rifle', kind: 'rifle', price: 2700,
    damage: 36, headshot: 3.2, fireGap: 0.1, auto: true,
    spread: 0.008, moveSpread: 0.045, recoil: 0.016,
    mag: 25, reserve: 75, reloadTime: 2.2, range: 90,
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', kind: 'sniper', price: 2400,
    damage: 82, headshot: 2.6, fireGap: 0.95, auto: false,
    spread: 0.003, moveSpread: 0.05, recoil: 0.045,
    mag: 5, reserve: 20, reloadTime: 2.6, range: 120,
  },
  lmg: {
    id: 'lmg', name: 'Bastion LMG', kind: 'lmg', price: 3800,
    damage: 30, headshot: 1.8, fireGap: 0.09, auto: true,
    spread: 0.024, moveSpread: 0.055, recoil: 0.014,
    mag: 60, reserve: 120, reloadTime: 3.4, range: 70,
  },
};

export const GRENADES = {
  flash: { id: 'flash', name: 'Flash Orb', price: 200, detail: 'Blinds anyone looking at the burst' },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 300, detail: 'A grey cloud that blocks sight for 14 s' },
  frag: { id: 'frag', name: 'Frag Charge', price: 300, detail: 'Explodes for up to 110 damage' },
};

export const ARMOR = {
  plating: { id: 'plating', name: 'Plating', price: 650, value: 50, detail: 'Absorbs half of incoming damage' },
  helm: { id: 'helm', name: 'Helm + Plating', price: 1000, value: 100, detail: 'Full protection, headshots halved too' },
};

// The buy menu in order: 1-6 weapons, 7-9 grenades, 0 armour.
export const SHOP = [
  { key: '1', type: 'weapon', id: 'sidearm' },
  { key: '2', type: 'weapon', id: 'scattergun' },
  { key: '3', type: 'weapon', id: 'smg' },
  { key: '4', type: 'weapon', id: 'rifle' },
  { key: '5', type: 'weapon', id: 'dmr' },
  { key: '6', type: 'weapon', id: 'lmg' },
  { key: '7', type: 'grenade', id: 'flash' },
  { key: '8', type: 'grenade', id: 'smoke' },
  { key: '9', type: 'grenade', id: 'frag' },
  { key: '0', type: 'armor', id: 'plating' },
];

export function createWeaponInstance(weaponId) {
  const def = WEAPONS[weaponId];
  return {
    def,
    mag: def.mag,
    reserve: def.reserve,
    reloadingUntil: 0,
    lastShotAt: -Infinity,
    spreadBloom: 0,
  };
}

export function weaponReady(instance, now) {
  return now >= instance.lastShotAt + instance.def.fireGap && now >= instance.reloadingUntil;
}

export function weaponSpread(instance, speed) {
  const base = instance.def.spread + instance.spreadBloom;
  return speed > 0.5 ? base + instance.def.moveSpread : base;
}

// Fires one trigger pull: consumes a round (or a pellet volley), starts the
// bloom that punishes spraying, and returns false when the magazine is empty.
export function weaponPullTrigger(instance, now) {
  if (instance.mag <= 0) return false;
  instance.mag -= 1;
  instance.lastShotAt = now;
  instance.spreadBloom = Math.min(instance.spreadBloom + instance.def.recoil * 0.9, 0.05);
  return true;
}

export function weaponStep(instance, dt) {
  instance.spreadBloom = Math.max(0, instance.spreadBloom - dt * 0.03);
}

export function weaponReload(instance, now) {
  if (instance.mag >= instance.def.mag || instance.reserve <= 0) return false;
  if (now < instance.reloadingUntil) return false;
  instance.reloadingUntil = now + instance.def.reloadTime;
  return true;
}

// Called once the reload timer elapses: moves rounds from reserve to mag.
export function weaponFinishReload(instance) {
  const needed = instance.def.mag - instance.mag;
  const taken = Math.min(needed, instance.reserve);
  instance.mag += taken;
  instance.reserve -= taken;
  instance.reloadingUntil = 0;
}

export function weaponRefill(instance) {
  instance.reserve = instance.def.reserve;
  instance.mag = instance.def.mag;
  instance.reloadingUntil = 0;
}
