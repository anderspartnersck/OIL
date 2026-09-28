# OiL! — THE HOME GAME

Crude, capital, and everyone at the table willing to sell you out.

## ▶ [PLAY THE CURRENT GAME — gateway.html](https://anderspartnersck.github.io/OIL/gateway.html)

The bare URL ([anderspartnersck.github.io/OIL](https://anderspartnersck.github.io/OIL/)) still boots
the older ER$N-skinned build. It has a link to the gateway at the top. Which one should be the front
door hasn't been decided yet.

A Castle Killscreen game by **Anders & Partners**.

> ### ⚠︎ Working build — not a finished game
>
> **The earliest build here.** OiL!'s core rules are deliberately unwritten, so this runs the ER$N rules engine as a substrate with OiL!'s identity on top. Treat it as a sketch of a game, not the game.
>
> The finished Castle Killscreen titles are **[SUCK UP](https://anderspartnersck.github.io/suck-up/)**
> and **[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo
> exists so the work can happen in the open, not because the work is done.

## About

Predatory capitalism as a board game. Pump, ship and sell across a world of real
passages and capes, cut deals you intend to honour until you don't, and watch a
flashpoint turn into a blowout that burns the clock for everybody.

The architecture is **substrate + skin**: the hard part (a balance-tested rules
engine) is borrowed from ER$N, because inventing OiL!'s canon — dice resolution,
faction powers, the E.D.D. table, the collapse numbers — is explicitly off-limits
until it's designed properly.

## How to play

Click-driven: you take one company and bots play the rest. Four more builds ship alongside the front door:

- **[gateway.html](gateway.html)** — **the current game.** The native engine with the shipping
  map, deals, crisis and **THE PATH**: three face-up contracts on the board. You sail cargo to a
  buyer and land it for a premium, and the prompt itemises every delivery before you commit.
  Hold a buyer and rivals landing there pay you a toll. Megastructures become destinations you
  own. Each company starts in its own yard. Setup has one open scoring question (does a landed
  contract also earn control?), so both answers are selectable
- **[oil-native.html](oil-native.html)** — the native engine instead of the ER$N substrate
- **[diciner.html](diciner.html)** — the dice bench
- **[test-lab.html](test-lab.html)** — the rules bench

## What still needs work

- **Card art is missing.** `src/data.js` is inherited from ER$N and names ~117 card scans under `assets/cards-print/`, a directory OiL! doesn't have. Those 404 here exactly as they do locally — nothing is being hidden.
- The front door is the ER$N skin; `gateway.html` is actually the further-along build.
- THE PATH is a concept measured in simulation (1,000-game A/Bs), not a finished rule. A few
  known soft spots: the bots never work onshore ground, even though a human can; starting at home
  widens the gap between the strongest and weakest company (about 27% vs 15% win rate); and
  straits mostly shut late, so detours are rare.
- Core rules remain unwritten by design.

## Rebuilding this bundle

This repo is **generated** — never edit it directly. Everything here is built from the
private Castle Killscreen tree:

```
cd "ANDERS CASTLE KILLSCREEN/oil_home_game/VIDEO GAME BUILD"
python3 tools/build_pages.py
```

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset
paths by string concatenation, so a static scan can't see what's used, and a wrongly-cut
sprite doesn't error — it just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude and ChatGPT.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>
