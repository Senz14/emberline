// The match: a phase machine over buy, live, round end and match end, with
// the economy and the bomb. First to five round wins takes the match, at
// most nine rounds. A round is won by eliminating the other team, by the
// charge exploding, or by defusing it; the timer running out favours the
// defenders unless the charge is planted.

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const PLANT_SECONDS = 3.5;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const LOSS_STREAK_BONUS = 500;
const PLANT_REWARD = 300;

export function createRounds() {
  const state = {
    phase: 'lobby',
    round: 1,
    wins: { vanguard: 0, sentinel: 0 },
    timer: BUY_SECONDS,
    money: 800,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    plantedThisRound: false,
    bomb: {
      state: 'carried',
      site: null,
      x: 0,
      z: 0,
      plantedAt: 0,
      carrier: null,
    },
  };

  let phaseEndsAt = 0;
  let roundWinner = null;

  return {
    state,
    startMatch(playerTeam) {
      state.phase = 'buy';
      state.round = 1;
      state.wins = { vanguard: 0, sentinel: 0 };
      state.money = 800;
      state.lossStreak = 0;
      state.kills = 0;
      state.deaths = 0;
      state.timer = BUY_SECONDS;
      phaseEndsAt = BUY_SECONDS;
      this.resetBomb('carried', null);
    },
    startRound(round) {
      state.phase = 'buy';
      state.round = round;
      state.timer = BUY_SECONDS;
      phaseEndsAt = BUY_SECONDS;
      state.plantedThisRound = false;
      this.resetBomb('carried', null);
    },
    resetBomb(bombState, carrier) {
      state.bomb.state = bombState;
      state.bomb.site = null;
      state.bomb.x = 0;
      state.bomb.z = 0;
      state.bomb.plantedAt = 0;
      state.bomb.carrier = carrier;
    },
    beginLive(now) {
      state.phase = 'live';
      state.timer = ROUND_SECONDS;
      phaseEndsAt = now + ROUND_SECONDS;
    },
    awardKill() {
      state.money += KILL_REWARD;
      state.kills += 1;
    },
    awardPlant() {
      state.money += PLANT_REWARD;
      state.plantedThisRound = true;
    },
    // The round's outcome: pays the player's team, updates the score, and
    // decides whether the match is over. Returns the winner's team.
    endRound(winner, now, hooks) {
      if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return winner;
      roundWinner = winner;
      state.wins[winner] += 1;
      const playerTeam = hooks.playerTeam;
      if (winner === playerTeam) {
        state.money += WIN_REWARD;
        state.lossStreak = 0;
      } else {
        state.money += LOSS_REWARD + Math.min(state.lossStreak, 3) * LOSS_STREAK_BONUS;
        state.lossStreak += 1;
      }
      if (hooks.onRoundMoney) hooks.onRoundMoney(winner);
      const matchOver = state.wins[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS;
      state.phase = matchOver ? 'matchEnd' : 'roundEnd';
      state.timer = matchOver ? 0 : 5;
      phaseEndsAt = now + (matchOver ? 0 : 5);
      return winner;
    },
    nextRound() {
      state.round += 1;
      this.startRound(state.round);
    },
    bombTimeLeft(now) {
      if (state.bomb.state !== 'planted') return BOMB_SECONDS;
      return Math.max(0, BOMB_SECONDS - (now - state.bomb.plantedAt));
    },
    // One fixed step: counts the phase timer down and fires the transitions.
    step(dt, context, now) {
      if (state.phase === 'buy') {
        state.timer = Math.max(0, state.timer - dt);
        if (state.timer <= 0) this.beginLive(now);
        return;
      }
      if (state.phase === 'live') {
        state.timer = Math.max(0, phaseEndsAt - now);
        if (state.bomb.state === 'planted' && now - state.bomb.plantedAt >= BOMB_SECONDS) {
          state.bomb.state = 'exploded';
          this.endRound('vanguard', now, context);
          return;
        }
        const playerAlive = context.player.state.alive;
        const vanguardAlive = context.bots.bots.some((b) => b.team === 'vanguard' && b.alive) || (context.playerTeam === 'vanguard' && playerAlive);
        const sentinelAlive = context.bots.bots.some((b) => b.team === 'sentinel' && b.alive) || (context.playerTeam === 'sentinel' && playerAlive);
        if (!vanguardAlive && state.bomb.state !== 'planted') {
          this.endRound('sentinel', now, context);
          return;
        }
        if (!sentinelAlive) {
          this.endRound('vanguard', now, context);
          return;
        }
        if (state.timer <= 0 && state.bomb.state !== 'planted') {
          this.endRound('sentinel', now, context);
          return;
        }
        return;
      }
      if (state.phase === 'roundEnd') {
        state.timer = Math.max(0, phaseEndsAt - now);
        if (state.timer <= 0) this.nextRound();
      }
    },
    get roundWinner() { return roundWinner; },
  };
}
