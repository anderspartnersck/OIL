> **STATUS: WORKING BUILD, LIVE ON GITHUB PAGES. An early one: not a finished game.**
> - The game (the only front door): <https://anderspartnersck.github.io/OIL/gateway.html>
> - Workbenches: [oil-native.html](https://anderspartnersck.github.io/OIL/oil-native.html) ·
>   [diciner.html](https://anderspartnersck.github.io/OIL/diciner.html) · [test-lab.html](https://anderspartnersck.github.io/OIL/test-lab.html)
> - Archive: the bare URL <https://anderspartnersck.github.io/OIL/> is the old ER$N-skinned sketch (see the bottom of this page).

# OiL! — THE HOME GAME

Crude, capital, and everyone at the table willing to sell you out.

A Castle Killscreen game by **Anders & Partners**. The finished Castle Killscreen titles are
**[SUCK UP](https://anderspartnersck.github.io/suck-up/3d.html?arcade)** and
**[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo exists so the
work can happen in the open, not because the work is done.

## About

Predatory capitalism as a board game. Pump, ship and sell across a world of real passages and capes, cut
deals you intend to honour until you don't, and watch a flashpoint turn into a blowout that burns the clock
for everybody.

**gateway.html** runs OiL!'s own native engine: three dice (Supply, Weather, World) make one price, oil
is a clock that only runs down, and you play on the shipping map with deals, crisis and **THE PATH**
(face-up contracts you sail cargo to).

## Which rules

- The **📖 RULEBOOK** in the game is written from the engine as it plays. It is the rules of this build.
- The designer's printed core rules are **not final**. Most of the open core-rule questions are still open,
  and every card is a concept draft.
- **CORE GAME** (4–6 companies) is the default. **+ Green Anders** (the expansion: the fourth die, the
  privilege, momentum, pirates, the seat clock; 2–8 companies, and 2 = HEGEMONY) is a choice on setup.
- **LEVELS** is a prototype, off by default.

## How to play (gateway.html)

1. **FUEL UP** on the title (or **Enter**).
2. On setup, choose THE BOX (CORE GAME or + Green Anders) and tap each company: **— → BOT → PLAYER → —**.
   The ★ seat is you; extra PLAYER seats are **pass-and-play** at one screen. Then **OPEN THE MARKET**.
3. **▶ RUN** lets the table play; **STEP** plays one step. When it's a human's decision, the game stops and asks.

| Key | Does |
|---|---|
| **Enter** | The screen's big button: FUEL UP · OPEN THE MARKET · PLAY AGAIN |
| **Space** | Run / pause the table |
| **Esc** or **P** | Pause menu: resume, how to play, settings (table speed, map or price-tape view), new game, quit to title |
| **?** | The rulebook |
| **Esc** | On setup or the final screen, back to the title |

No sound in this build yet. URL option: `?levels=two` or `?levels=voyage` starts with a LEVELS preset.

## The other pages

- **[oil-native.html](oil-native.html)**: the native engine as a bare market tape, without the map.
- **[diciner.html](diciner.html)**: the dice designer. Every face and weight is a dial.
- **[test-lab.html](test-lab.html)**: the balance lab. Runs batches of bot games on the real engine.

## What still needs work

- THE PATH and the expansion modules are measured in simulation (bot games), not finished rules.
- No card art in the gateway yet; the board and boxes are further along.
- One screen only: no online play.

## Rebuilding this bundle

This repo is **generated**. Never edit it directly. Everything here is built from the private Castle
Killscreen tree, and this README's source is `tools/PAGES_README.md` there:

```
cd "ANDERS CASTLE KILLSCREEN/oil_home_game/VIDEO GAME BUILD"
python3 tools/build_pages.py
```

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset paths by
string concatenation, so a static scan can't see what's used, and a wrongly-cut sprite doesn't error.
It just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude, ChatGPT, and Blender.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>

## RETIRED / ARCHIVE: the ER$N-skinned sketch (index.html)

The bare URL ([anderspartnersck.github.io/OIL](https://anderspartnersck.github.io/OIL/)) still boots the
first sketch, which ran OiL!'s look on the ER$N rules engine. It is no longer updated and is not the game;
it links to gateway.html. Its card scans were never made for OiL!, so the card images there are missing.
