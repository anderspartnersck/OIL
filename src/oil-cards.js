/* OiL! CARD EFFECTS — wires the 40 existing cards onto the native engine's verbs.
   ============================================================================
   CONCEPT (House Rule 5): the card NAMES/decks/themes are the designer's (from
   ../data.py); the effect numbers here are DIALS, exactly like the engine — strawman,
   validated by scripts/oil-sweep.js, the designer's to confirm/cut. See
   docs/CARD-EFFECTS-BRAINSTORM.md for the rationale behind each.

   HARD RULE (so the franchise laws survive): no card may ADD oil and no card may
   stop depletion -> the collapse clock stays monotonic and E.D.D. stays reachable
   (Charter L2/E3). Cards only burn oil or leave it alone. Effects are IMMEDIATE
   (no persistent modifiers) to keep the validated engine clean.

   Effects use helper methods the engine exposes: g.bumpPrice(n) · g.burnOil(n) ·
   g.forceEra('CHAOTIC'|'STABLE') · g.richestOpp(p) · g.leaderOpp(p). Plus direct
   reads/writes of price, era, lastShove and player fields (control/barrels/value/
   exposure/pips). */
(function (global) {
  'use strict';
  const ALL = (global.OIL && global.OIL.CARDS) || [];
  const deckOf = {}; ALL.forEach(c => { deckOf[c.name] = c.deck; });
  const D = (name, fx) => ({ deck: deckOf[name] || '?', fx });

  // each fx(g, p): mutate immediately. opps = everyone but p.
  const FX = {
    // ---------------- DEEDS — build control & barrels ----------------
    "If I Say I'm An Oil Man": D("If I Say I'm An Oil Man", (g, p) => { p.control += 2; g.players.forEach(q => { if (q !== p) q.exposure += 1; }); g.bumpPrice(1); }),
    // "She comes up black and the air goes brown." +2 barrels, but the glut drops the
    // shared price −1 and the externality is everyone else's (each rival +1 exposure); oil −1.
    "Texas Tea": D("Texas Tea", (g, p) => { p.barrels += 2; g.bumpPrice(-1); g.players.forEach(q => { if (q !== p) q.exposure += 1; }); g.burnOil(1); }),
    // Mythic windfall: +3 barrels, +1 control — but "more than anyone should find" floods
    // the market (price −2, every hoarder revalues down) and hastens the end (oil −2).
    "Ocean of Oil": D("Ocean of Oil", (g, p) => { p.barrels += 3; p.control += 1; g.bumpPrice(-2); g.burnOil(2); }),
    // "All of it. Every drop. Mine." Consolidation: +2 control, and you absorb the leader's
    // drop (their −1 barrel) — the monopoly grab makes you the target too (+1 exposure).
    "...And It's All Mine": D("...And It's All Mine", (g, p) => { const t = g.leaderOpp(p); if (t) t.barrels = Math.max(0, t.barrels - 1); p.control += 2; p.exposure += 1; }),
    "Get Yer Own": D("Get Yer Own", (g, p) => { const t = g.leaderOpp(p); if (t) t.control = Math.max(0, t.control - 1); }),
    // "Floating inventory. Pray it doesn't list." Bank up to 2 barrels into protected value;
    // dumping the cargo onto the market drops the shared price −1 (the offload everyone feels).
    "Juice Tanker": D("Juice Tanker", (g, p) => { const n = Math.min(2, p.barrels); p.barrels -= n; p.value += n * g.price; if (n > 0) g.bumpPrice(-1); }),
    // "Some of us actually refine the stuff." You bank an honest day's work (+value) and run
    // clean (−1 exposure) while the dirt sticks to the biggest sloppy operator (richest rival +1).
    "For The Love Of The Craft": D("For The Love Of The Craft", (g, p) => { p.value += g.price; p.exposure = Math.max(0, p.exposure - 1); const t = g.richestOpp(p); if (t) t.exposure += 1; }),
    "All Yours": D("All Yours", (g, p) => { const t = g.richestOpp(p); if (t) { const e = Math.min(p.exposure, 3); t.exposure += e; p.exposure -= e; } }),

    // ---------------- FREEDOM-MARKET — move the shared price ----------------
    // THE strongest name in the bible, and with THE MAP on it finally does what it
    // says: "close Hormuz / Panama / Suez" (../data.py). You shut the gate that hurts
    // the leader most — the nearest one to where they stand — and the world gets
    // longer for everybody. Price jumps and the season turns, as before.
    "Strait Flush": D("Strait Flush", (g, p) => {
      g.bumpPrice(4); g.forceEra('CHAOTIC');
      if (g.map) { const t = g.leaderOpp(p) || g.richestOpp(p); if (t) g._eddCloseNear(t); }
    }),
    // "Two routes now. Neither of them yours." With the map on, one of the leader's
    // routes is taken out of service as well as a control point.
    "Split Tea": D("Split Tea", (g, p) => {
      const t = g.leaderOpp(p); if (t) t.control = Math.max(0, t.control - 1);
      if (g.map && t) g.disableRouteNear(t);
    }),
    // the rare cooler: the market comes off the boil (STABLE + price −2, revaluing every
    // hoarder's barrels down) and the peacemaker banks a slingshot (+1 pip). "Nobody dies."
    "Ocean of Serenity": D("Ocean of Serenity", (g, p) => { g.forceEra('STABLE'); g.bumpPrice(-2); p.pips = Math.min(g.dials.PIPS_START, p.pips + 1); }),
    "It's Just A Little Chop": D("It's Just A Little Chop", (g, p) => { g.bumpPrice(-1); g.burnOil(1); }),
    // "Everything freezes. The countdown does not." You keep your tempo (+1 pip) while
    // every rival loses one (−1 pip) — time stutters for them, not you. Tempo denial.
    "Ocean of Time": D("Ocean of Time", (g, p) => { p.pips = Math.min(g.dials.PIPS_START, p.pips + 1); g.players.forEach(q => { if (q !== p) q.pips = Math.max(0, q.pips - 1); }); }),
    // "I crossed an ocean. The least you can do is pay." You deliver and collect the toll
    // FROM the richest rival — their value (up to one price) crosses the table to you.
    "I've Travelled Across For You": D("I've Travelled Across For You", (g, p) => { const t = g.richestOpp(p); if (t) { const toll = Math.min(t.value, g.price); t.value -= toll; p.value += toll; } }),
    "Cash Wave": D("Cash Wave", (g, p) => { g.players.forEach(q => { q.value += 10; }); g.bumpPrice(2); }),
    "Rogue Wave": D("Rogue Wave", (g, p) => { const t = g.richestOpp(p); if (t) t.barrels = Math.max(0, t.barrels - 2); }),
    "Doldrums": D("Doldrums", (g, p) => { g.players.forEach(q => { if (q !== p) q.exposure += 1; }); }),
    "Chiiiiiiiina": D("Chiiiiiiiina", (g, p) => { g.bumpPrice(-5); }),
    "Cymbals and Gongs": D("Cymbals and Gongs", (g, p) => { g.bumpPrice(p.barrels > 0 ? 2 : -2); }),
    // "Pump it faster. Ask questions never." You sell into the market (+value) but the glut
    // drops the shared price −1 (everyone's barrels revalue down) and the world depletes (oil −1).
    "Up And Fill": D("Up And Fill", (g, p) => { p.value += g.price; g.bumpPrice(-1); g.burnOil(1); }),

    // ---------------- COMPETITION — disruption / oversight / predation ----------------
    "Force Majeure": D("Force Majeure", (g, p) => { const mid = Math.round((g.dials.PRICE_MIN + g.dials.PRICE_MAX) / 2); g.bumpPrice(Math.round((mid - g.price) / 2)); g.forceEra('STABLE'); }),
    // the watcher sees the BIGGEST operator first: the leader is marked (+exposure),
    // and you keep the foresight (+1 pip). Surveillance as pressure, not a self-buff.
    "Leviathan Knows": D("Leviathan Knows", (g, p) => { const t = g.leaderOpp(p); if (t) t.exposure += 2; p.pips = Math.min(g.dials.PIPS_START, p.pips + 1); }),
    // "Nasty, brutish, and this round." With THE TABLE on, this is the card's LITERAL
    // text at last: every standing deal on the table dissolves at once (each walk-out
    // marked as the betrayal it is) — the war of all against all. Everyone +1 exposure.
    "Hobbesian": D("Hobbesian", (g, p) => { if (g.deals) g.breakAllDeals('Hobbesian'); g.players.forEach(q => { q.exposure += 1; }); }),
    // enclosure: you wall off your own liability (−2 exposure) by FENCING THE COMMONS —
    // every rival loses a barrel of access ("property is sacred, mine especially").
    "Locke'd In": D("Locke'd In", (g, p) => { p.exposure = Math.max(0, p.exposure - 2); g.players.forEach(q => { if (q !== p) q.barrels = Math.max(0, q.barrels - 1); }); }),
    "Ocean of Monsters": D("Ocean of Monsters", (g, p) => { g.bumpPrice(2 * g.lastShove); g.forceEra('CHAOTIC'); }),
    "Ocean of Fire": D("Ocean of Fire", (g, p) => { g.bumpPrice(4); const t = g.leaderOpp(p); if (t) t.control = Math.max(0, t.control - 1); g.burnOil(2); }),
    "Stop Laughing!": D("Stop Laughing!", (g, p) => { const t = g.richestOpp(p); if (t) t.exposure += 2; }),
    "Catastrophe": D("Catastrophe", (g, p) => { g.players.forEach(q => { q.control = Math.max(0, q.control - 1); }); g.burnOil(2); }),
    // "Negotiations are concluded. They never began." With THE TABLE on it does what it
    // says: NO new deal may be offered for a full round (standing deals still run — you
    // can always stop honouring one, you just can't make a new one). Each rival +1 exposure.
    "No Words.": D("No Words.", (g, p) => { if (g.deals) g.dealFreeze = Math.max(g.dealFreeze, g.players.length); g.players.forEach(q => { if (q !== p) q.exposure += 1; }); }),
    // the externality made literal: your output is up (+2 barrels) and the asthma is
    // EVERYONE ELSE'S (each rival +1 exposure) while the world burns faster (oil −2).
    "Smoke Stack": D("Smoke Stack", (g, p) => { p.barrels += 2; g.players.forEach(q => { if (q !== p) q.exposure += 1; }); g.burnOil(2); }),
    "Stringent": D("Stringent", (g, p) => { g.players.forEach(q => { q.barrels = Math.max(0, q.barrels - 1); }); g.bumpPrice(-1); }),
    "Measured Austerity": D("Measured Austerity", (g, p) => { g.bumpPrice(-2); g.players.forEach(q => { q.value = Math.max(0, q.value - 5); }); }),
    // diplomacy by other means: you SEIZE a control point from the leader (their −1,
    // your +1) and the occupation is dirty (+1 exposure). Ground taken, not built.
    "Boots On The Ground": D("Boots On The Ground", (g, p) => { const t = g.leaderOpp(p); if (t) t.control = Math.max(0, t.control - 1); p.control += 1; p.exposure += 1; }),
    "Dog-Wagged": D("Dog-Wagged", (g, p) => { g.bumpPrice(-2 * g.lastShove); }),
    "Tugger, No!": D("Tugger, No!", (g, p) => { const t = g.leaderOpp(p); if (t) t.exposure += 2; }),
    "Drones R Us": D("Drones R Us", (g, p) => { const t = g.richestOpp(p); if (t) { t.control = Math.max(0, t.control - 1); t.exposure += 1; } g.forceEra('CHAOTIC'); }),
    // expansion megastructure: the map itself moves — control shifts off the leader to
    // you, and the supply reroute jolts the market (+2 price). Reshapes the board. (concept)
    "The Titan Shifts": D("The Titan Shifts", (g, p) => { const t = g.leaderOpp(p); if (t) t.control = Math.max(0, t.control - 1); p.control += 1; g.bumpPrice(2); }),
    "Oligarcheology": D("Oligarcheology", (g, p) => { const t = g.leaderOpp(p); if (t) { t.control = Math.max(0, t.control - 1); t.value = Math.max(0, t.value - g.price); } }),
    // visible calm, hidden collapse: you impose quiet (STABLE) and bury the unrest on the
    // loudest operator — the leader takes the blame (+1 exposure) while the world depletes.
    "Quiet Over Peace": D("Quiet Over Peace", (g, p) => { g.forceEra('STABLE'); const t = g.leaderOpp(p); if (t) t.exposure += 1; g.burnOil(2); }),
    "Gulf-Faw": D("Gulf-Faw", (g, p) => { g.bumpPrice(3); const t = g.richestOpp(p); if (t) t.control = Math.max(0, t.control - 1); }),
    // the American President negotiates with himself on TV: spectacle bends the price his
    // way + hands him a free lever (the photo-op), but it's on camera (+exposure) and the
    // world depletes while he preens (oil -1). Nothing structural changes — no opponent moves.
    "Negotiating With A Worthy Adversary": D("Negotiating With A Worthy Adversary", (g, p) => { g.bumpPrice(p.barrels > 0 ? 2 : -2); p.pips = Math.min(g.dials.PIPS_START, p.pips + 1); p.exposure += 1; g.burnOil(1); }),
  };

  global.OIL_CARD_FX = FX;
  if (typeof module !== 'undefined' && module.exports) module.exports = FX;
})(typeof window !== 'undefined' ? window : globalThis);
