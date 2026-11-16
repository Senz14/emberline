// The DOM HUD: health and armour bars, ammunition, the top bar (score,
// timer, round, alive counts), money, the kill feed, the bomb status, the
// charge hint, the plant/defuse progress bar, the buy menu, the centre
// banner and the full-screen overlays. Every setter is idempotent — the main
// loop calls several of them every frame, and writing the same text twice is
// wasted work, so each one caches its last value.

import { SHOP, WEAPONS, GRENADES, ARMOR } from './weapons.js';

const OVERLAYS = {
  start: { title: 'EMBERLINE', copy: 'A derelict relay station in the canyon. Plant the surge charge at Site A or Site B — or hold the line and defuse it. First to five rounds takes the match.', button: 'Click to play' },
  paused: { title: 'Paused', copy: 'The match is waiting. Click below to lock the mouse and keep playing.', button: 'Resume' },
  dead: { title: 'You are down', copy: 'A teammate will carry the round. Spectate from their view until the next round starts.', button: 'Spectate' },
  match: { title: 'Match over', copy: '', button: 'Play again' },
};

export function createHud(document) {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    ammo: $('ammo'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    healthNumber: $('health-number'),
    healthFill: $('health-fill'),
    armorNumber: $('armor-number'),
    armorFill: $('armor-fill'),
    moneyValue: $('money-value'),
    timerValue: $('timer-value'),
    scoreVanguard: $('score-vanguard'),
    scoreSentinel: $('score-sentinel'),
    roundValue: $('round-value'),
    aliveValue: $('alive-value'),
    killfeed: $('killfeed'),
    bombStatus: $('bomb-status'),
    hitmarker: $('hitmarker'),
    crosshair: $('crosshair'),
    damageVignette: $('damage-vignette'),
    flashOverlay: $('flash-overlay'),
    damageDirection: $('damage-direction'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    chargeHint: $('charge-hint'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    buyMenu: $('buy-menu'),
    buyItems: $('buy-items'),
    buyMoney: $('buy-money'),
    buyClose: $('buy-close'),
  };
  const last = {};
  let hitmarkerTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;
  let overlayMode = null;
  let buyOpen = false;
  let playHandler = null;

  function setText(key, element, text) {
    if (last[key] === text) return;
    last[key] = text;
    element.textContent = text;
  }

  function buildBuyItems(onBuy) {
    els.buyItems.innerHTML = '';
    for (const entry of SHOP) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.key = entry.key;
      let name = '';
      let detail = '';
      let price = 0;
      if (entry.type === 'weapon') {
        const def = WEAPONS[entry.id];
        name = def.name;
        detail = `$${def.damage} dmg · ${def.mag} rounds · ${def.auto ? 'automatic' : 'semi-automatic'}`;
        price = def.price;
      } else if (entry.type === 'grenade') {
        const def = GRENADES[entry.id];
        name = def.name;
        detail = def.detail;
        price = def.price;
      } else {
        const def = ARMOR[entry.id];
        name = def.name;
        detail = def.detail;
        price = def.price;
      }
      button.innerHTML = `<kbd>${entry.key}</kbd><span class="buy-name">${name}<span class="buy-detail">${detail}</span></span><span class="buy-price">$${price}</span>`;
      button.addEventListener('click', () => onBuy(entry));
      els.buyItems.appendChild(button);
    }
  }

  return {
    setHealth(health, armor) {
      setText('health', els.healthNumber, String(Math.round(health)));
      const width = Math.round((health / 100) * 100) + '%';
      if (last.healthFill !== width) {
        last.healthFill = width;
        els.healthFill.style.width = width;
      }
      els.healthFill.classList.toggle('low', health <= 30);
      setText('armor', els.armorNumber, String(Math.round(armor)));
      const armorWidth = Math.round((armor / 100) * 100) + '%';
      if (last.armorFill !== armorWidth) {
        last.armorFill = armorWidth;
        els.armorFill.style.width = armorWidth;
      }
    },
    setAmmo(mag, reserve) {
      setText('mag', els.ammoMag, String(mag));
      setText('reserve', els.ammoReserve, '/ ' + reserve);
      els.ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      setText('money', els.moneyValue, String(money));
    },
    setTimer(seconds, planted) {
      const value = Math.max(0, Math.ceil(seconds));
      setText('timer', els.timerValue, String(value));
      els.timerValue.classList.toggle('planted', !!planted);
    },
    setScore(wins, round) {
      setText('scoreV', els.scoreVanguard, String(wins.vanguard));
      setText('scoreS', els.scoreSentinel, String(wins.sentinel));
      setText('round', els.roundValue, 'ROUND ' + round);
    },
    setAlive(vanguard, sentinel) {
      setText('alive', els.aliveValue, vanguard + ' — ' + sentinel);
    },
    setBombStatus(text, urgent) {
      if (!text) {
        if (last.bombStatus !== '') {
          last.bombStatus = '';
          els.bombStatus.hidden = true;
        }
        return;
      }
      setText('bombStatus', els.bombStatus, text);
      els.bombStatus.hidden = false;
      els.bombStatus.classList.toggle('urgent', !!urgent);
    },
    setCrosshairGap(gap) {
      const value = Math.round(gap) + 'px';
      if (last.gap === value) return;
      last.gap = value;
      els.crosshair.style.setProperty('--gap', value);
    },
    hitMarker(kill, damage) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', kill);
      hitmarkerTimer = performance.now() / 1000 + 0.15;
    },
    addKill(killer, killerTeam, victim, victimTeam, headshot) {
      const entry = document.createElement('div');
      entry.className = 'killfeed-entry';
      const killerSpan = `<span class="team-${killerTeam}">${killer}</span>`;
      const victimSpan = `<span class="team-${victimTeam}">${victim}</span>`;
      entry.innerHTML = `${killerSpan} <span class="killfeed-action">${headshot ? '◉' : '✕'}</span> ${victimSpan}`;
      els.killfeed.prepend(entry);
      while (els.killfeed.children.length > 5) els.killfeed.removeChild(els.killfeed.lastChild);
      setTimeout(() => entry.classList.add('fade'), 4000);
      setTimeout(() => entry.remove(), 5000);
    },
    damageFlash(direction) {
      els.damageVignette.classList.add('on');
      vignetteTimer = performance.now() / 1000 + 0.35;
      const angle = direction !== null ? (direction * 180) / Math.PI : 0;
      els.damageDirection.style.transform = `rotate(${angle}deg)`;
      els.damageDirection.classList.toggle('on', direction !== null);
    },
    setFlashOpacity(opacity) {
      els.flashOverlay.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    },
    showBanner(kind, title, sub, seconds = 2.5) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.className = 'show ' + kind;
      bannerTimer = performance.now() / 1000 + seconds;
    },
    hideBanner() {
      els.banner.className = '';
    },
    setChargeHint(text) {
      if (!text) {
        if (last.chargeHint !== '') {
          last.chargeHint = '';
          els.chargeHint.hidden = true;
        }
        return;
      }
      setText('chargeHint', els.chargeHint, text);
      els.chargeHint.hidden = false;
    },
    setPlantProgress(progress) {
      if (progress === null) {
        if (last.plantBar !== 'hidden') {
          last.plantBar = 'hidden';
          els.plantBar.hidden = true;
        }
        return;
      }
      els.plantBar.hidden = false;
      last.plantBar = 'shown';
      const width = Math.round(progress * 100) + '%';
      if (last.plantFill !== width) {
        last.plantFill = width;
        els.plantFill.style.width = width;
      }
    },
    showOverlay(mode, money) {
      const spec = OVERLAYS[mode];
      if (!spec) return;
      if (overlayMode === mode && !els.overlay.hidden) return;
      overlayMode = mode;
      els.overlayTitle.innerHTML = mode === 'start' ? 'EMBER<span class="accent">LINE</span>' : spec.title;
      els.overlayCopy.textContent = mode === 'match' ? spec.copy : spec.copy;
      els.play.textContent = spec.button;
      els.overlay.hidden = false;
    },
    hideOverlay() {
      overlayMode = null;
      els.overlay.hidden = true;
    },
    get overlayHidden() { return els.overlay.hidden; },
    onPlay(handler) {
      playHandler = handler;
      els.play.addEventListener('click', () => playHandler && playHandler());
    },
    onBuyClose(handler) {
      els.buyClose.addEventListener('click', handler);
    },
    get playButton() { return els.play; },
    openBuy(onBuy, money) {
      if (buyOpen) return;
      buyOpen = true;
      buildBuyItems(onBuy);
      els.buyMoney.textContent = '$' + money;
      els.buyMenu.hidden = false;
    },
    closeBuy() {
      buyOpen = false;
      els.buyMenu.hidden = true;
    },
    get buyOpen() { return buyOpen; },
    setBuyMoney(money) {
      els.buyMoney.textContent = '$' + money;
      for (const button of els.buyItems.children) {
        const entry = SHOP.find((item) => item.key === button.dataset.key);
        if (!entry) continue;
        const price = entry.type === 'weapon' ? WEAPONS[entry.id].price : entry.type === 'grenade' ? GRENADES[entry.id].price : ARMOR[entry.id].price;
        button.disabled = money < price;
      }
    },
    tick(now) {
      if (hitmarkerTimer && now >= hitmarkerTimer) {
        hitmarkerTimer = 0;
        els.hitmarker.classList.remove('on');
      }
      if (bannerTimer && now >= bannerTimer) {
        bannerTimer = 0;
        els.banner.className = '';
      }
      if (vignetteTimer && now >= vignetteTimer) {
        vignetteTimer = 0;
        els.damageVignette.classList.remove('on');
        els.damageDirection.classList.remove('on');
      }
    },
  };
}
