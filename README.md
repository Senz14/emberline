# emberline

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Senz14/emberline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Senz14/emberline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBERLINE is a round-based tactical FPS in three.js: two five-player teams fight over a derelict solar relay station in a rust-red canyon at dusk. Vanguard plants a surge charge at Site A or Site B; Sentinel holds the sites and defuses. Between rounds, players spend round money on six weapons, three grenades and armour; nine AI teammates and opponents buy, rotate, hold angles, react to sight and sound, and plant or defuse. First to five rounds takes the match.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network: three.js 0.187.0 is vendored under `game/vendor/three/`, and all art and sounds are generated in code.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jkmc4mts&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
