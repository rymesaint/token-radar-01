# token-radar-makefun

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rymesaint/token-radar-makefun/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rymesaint/token-radar-makefun/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token protocol radar for the make.fun `token-radar-01` bounty. Ranks watchlist and early pre-token protocols by an implied-value model (radar-2) built from TVL, peer mcap/TVL multiples, 7d growth, and age-without-token. Includes a static no-network dashboard, `board.json`, farm plans, and dossier.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
python3 -m http.server 8931 --bind 127.0.0.1 --directory out
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ridwan-fauzan&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
