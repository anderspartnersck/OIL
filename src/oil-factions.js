/* OiL! FACTION ABILITIES — the asymmetry layer (CORE-014).
   ============================================================================
   REVAMPED 2026-06-15 from the FACTION REFS art (GPT RAW/0 FACTION REFS/*): each
   faction's CORE, leader, tagline, /10 stat block, and power are read from the
   designer's reference card mockups — not invented. The art is canon; the engine
   TRANSLATION of each card's ability into OiL!'s abstract meters (price / oil /
   barrels / value / exposure / control / pips) is the candidate read, dialed and
   validated by scripts/oil-sweep.js — the designer's to confirm/cut. data.py keeps
   mechanical_role = None until the designer signs off (House Rule 5).

   STATS are the art's evocative /10 reads (CONTROL · STABILITY · PRESSURE ·
   EXPANSION · INFLUENCE) — NOT a balanced point-budget (the cards don't sum to a
   constant). They're flavor; balance is proven IN PLAY by the sweep, not on paper.

   HARD RULE (so the franchise laws survive): no power may ADD oil and none may stop
   depletion -> the collapse clock stays monotonic, E.D.D. stays reachable (L2/E3).
   Powers only push price / move exposure-value-barrels-pips-control / BURN oil.
   Effects are IMMEDIATE (no hidden persistent modifiers).

   The 8 are mechanically DISTINCT levers:
     Bright AMPLIFIES the price swing  <->  Haddad DAMPS it toward start
     Nikoyl tolls a rival's VALUE      <->  Mina inflicts a rival's EXPOSURE
     Stock banks the swing's SIZE      ·   Petro Sur rides the swing for BARRELS
     Hartstarr feeds off the TABLE     ·   Milecastle EXTRACTS hard (burns oil)

   Each profile: { edition, lead, tagline, stats, power, text, setup?(g,p), passive?(g,p) }
   Symmetric by default: attached only when opts.factions is given AND opts.asym. */
(function (global) {
  'use strict';

  const STAT_AXES = ['CONTROL', 'STABILITY', 'PRESSURE', 'EXPANSION', 'INFLUENCE'];
  const STAT_MAX = 10;   // art scale is /10 per axis (no fixed budget)
  const S = (CONTROL, STABILITY, PRESSURE, EXPANSION, INFLUENCE) =>
    ({ CONTROL, STABILITY, PRESSURE, EXPANSION, INFLUENCE });
  // net price delta applied to the shared market this turn (shove + scarcity premium)
  const priceDelta = g => (g.lastShove || 0) + (g.scarcity || 0);

  const FACTIONS = {
    // ===================== CORE =====================
    HARTSTARR: {
      edition: 'CORE',
      lead: 'Evelyn & Delilah Hart (Big Hartmart)',
      tagline: "We don't move oil. We control the moment. We decide what it's worth.",
      stats: S(8, 7, 8, 6, 8),
      power: 'Codependency',
      // The art: star-INSIDE-a-heart logo; "RETAIL DOMINANCE — you do not generate
      // barrels passively; gain only when barrels move through your network";
      // "DEMAND DEPENDENCE — if no barrels move, you lose." Hartstarr can't feed
      // itself — it eats off the table's habit, and crashes when the supply dries.
      // 1119 (docs/FACTION-BALANCE-1119.md): the $ half never reached the verdict (A/B 1.10 on, 1.15 off). Batch 9 tried
      // a fed/dry exposure swing (measured ~0: Hartstarr's yard already wins its share). Batch 14, the card's own words:
      // "gain only when barrels move through your network". Big Hartmart keeps a tally of every cargo the REST of the
      // table lands; each time it reaches twice the number of rivals (4 at 3 seats … 10 at 6), Hartstarr takes ▰1.
      // A quiet table pays nothing, and the scarcity crash stays. (Counts the map's 'deliver' events — map tables.)
      text: 'Generates nothing alone — banks +1 value for every 3 barrels the REST of the table holds (everyone fuels up at Big Hartmart), and keeps a tally of every cargo a rival lands: each time the tally reaches twice the number of rivals (4 at 3 seats, 10 at 6), the network takes its cut — +1 control. When oil enters the scarcity band the habit breaks: +1 exposure each turn.',
      passive: (g, p) => {
        const tableBarrels = g.players.reduce((a, q) => a + (q === p ? 0 : q.barrels), 0);
        p.value += Math.floor(tableBarrels / 3);
        let landed = 0;
        for (let i = p.netMark || 0; i < g.events.length; i++) { const e = g.events[i]; if (e.type === 'deliver' && e.player !== p.name) landed++; }
        p.netMark = g.events.length;
        p.netTally = (p.netTally || 0) + landed;
        const cut = 2 * (g.players.length - 1);
        while (p.netTally >= cut) { p.netTally -= cut; p.control += 1; }
        if (g.oil <= g.dials.SCARCITY_BAND) p.exposure += 1;
      },
    },
    STOCK: {
      edition: 'CORE',
      lead: 'Alexandra Mercer — CEO, Stock Oil (Weehawken, NJ)',
      tagline: 'Energy is movement. Movement is control. We don’t compete — we regulate outcomes.',
      stats: S(9, 8, 7, 5, 6),
      power: 'Price Discipline',
      // "Volatility is not an event. It's a failure of discipline." Mercer profits
      // from the swing in EITHER direction — the house that wins on the move itself.
      // 1119 (docs/FACTION-BALANCE-1119.md, batch 7→8): banking $ alone never reached the verdict (A/B 1.08 on, 1.13
      // off — money only makes you the richest target). The card's own line is the other half: "Volatility ... is a
      // failure of discipline." On a turn the tape holds (a swing of 0 or 1) Mercer's discipline cleans the books.
      // batch 14→15: discipline shifted HOW Stock wins (exposure wins 136→176) but not how often (A/B ±0). A swing big
      // enough to be leverage is a position the house takes: ▰1. Expansion batch 2→3: at 4+ (1 turn in 24) Stock ran
      // 1.35× fair in the SuprexCore box (where ▰ is scarcer and the western majors dodge the sanctions); now the
      // widest break only (|5|, 1 turn in 72).
      text: 'Volatility is leverage — banks value equal to the SIZE of the market swing each turn, whichever way it broke, and a swing of 5 (the widest the dice can break) is a position: +1 control. Discipline is the other half: on a turn the tape barely moves (a swing of 0 or 1), shed 1 exposure. Starts capitalized (+$8).',
      setup: (g, p) => { p.value += 8; },
      passive: (g, p) => { const sw = Math.abs(g.lastShove || 0); p.value += sw;
        if (sw >= 5) p.control += 1;
        else if (sw <= 1 && p.exposure > 0) p.exposure -= 1; },
    },
    MC: {
      edition: 'CORE',
      lead: 'Arjun Mehta — CEO, Milecastle Petroleum',
      tagline: "We go where others won't. We bring it back safely. That's our word.",
      stats: S(7, 8, 6, 8, 5),
      power: 'Deepwater Premium',
      // "Depth doesn't forgive mistakes. Neither does the market." DEEPWATER
      // LIABILITY: spill risk. Milecastle extracts the barrels others can't reach —
      // richer takings, faster depletion, and the liability quietly piling up.
      // 1119 (docs/FACTION-BALANCE-1119.md, batch 2→3): the old read paid $ (which the verdict never reads) and
      // charged exposure (which it does) — the power was a net LOSS (0.94× fair on, 1.02 off). Now the deep well
      // actually comes in: every 3rd turn Milecastle lifts a barrel nobody else can reach, and pays for it on the record.
      // Expansion batch 3→4: the +1 exposure EVERY turn (17 at the verdict, worst in the box) priced MC out of THE
      // PRIVILEGE (0.89× fair, A/B ±0) — the liability now lands with the barrel only.
      text: 'Frontier extraction — each turn banks +2 value and pumps the clock down faster (burn 1 oil). Every 3rd turn the deep well comes in: +1 barrel — and the liability lands on the record: +2 exposure. Starts with the engineering edge (+2 pips).',
      setup: (g, p) => { p.pips = Math.min(g.dials.PIPS_START + 2, p.pips + 2); },
      passive: (g, p) => { p.deepTurns = (p.deepTurns || 0) + 1; p.value += 2; g.burnOil(1);
        if (p.deepTurns % 3 === 0) { p.barrels += 1; p.exposure += 2; } },
    },
    BRIGHT: {
      edition: 'CORE',
      lead: 'Bright 合 (national champion)',
      tagline: '合 — the price the whole country drives past.',
      stats: S(7, 8, 6, 9, 7),   // no stat card in refs — read from scale/ubiquity
      power: 'Post the Number',
      // The 92/95/98 board posted to all traffic; always-open 24小时 scale. Bright
      // doesn't hoard — it SETS the number, pushing the trend the way it's going.
      // 1119 (docs/FACTION-BALANCE-1119.md, batch 1→2): the push alone moved the tape for everyone and paid Bright
      // nothing the verdict counts — power-off A/B was identical (0.80× fair either way). Now the number is POSTED:
      // when Bright's own step is what carries the price over a $5 mark, the country reads Bright's board (▰1).
      text: 'Sets the number the nation pays — pushes the shared price one step FURTHER the way it already moved this turn (amplify the trend; never reverses it). When that push is what carries the price UP across a $5 mark ($55, $60, $65…), the whole country reads Bright’s board: +1 control.',
      passive: (g, p) => { const d = priceDelta(g), was = g.price;
        if (d > 0) { g.bumpPrice(1); if (Math.floor(g.price / 5) > Math.floor(was / 5)) p.control += 1; }
        else if (d < 0) g.bumpPrice(-1); },
    },
    MINA: {
      edition: 'CORE',
      lead: 'The Board of Executives — Mina Gaz (Dnipro)',
      tagline: "We don't move oil. We move decisions. Flow without freedom.",
      stats: S(8, 8, 7, 7, 7),
      power: 'Chokepoint',
      // 'мина' = landmine: the buried thing your supply line runs over. The richest
      // rival is the one standing on it — and a rising price tightens the squeeze.
      // 1119 (docs/FACTION-BALANCE-1119.md, batch 6→7): the mine went off under the RICHEST rival, who is rarely the one
      // the verdict crowns (▰ first) — 1.6 exposure a turn landed and Mina's own win rate didn't move (A/B 1.06 on,
      // 1.05 off). The front-runner is the one standing on the supply line now (ties: the next seat clockwise).
      // Batch 18→19: still the thinnest power (+0.06 A/B, 0.85× at 6 seats) — the mine is bigger: +2, +3 on a rise.
      text: 'The landmine under the supply line — each turn the front-runner (the rival with the most control) takes +2 exposure (+3 instead if the price rose this turn). No gain to Mina; pure squeeze.',
      passive: (g, p) => { const t = g.leaderOpp(p);
        // HEGEMONY 2p (CONCEPT): with one rival the mine never misses — it only goes off under a rival RICHER than Mina
        if (t && g.heg2 && g.hegDials.MINA_RICHER && t.holdings(g.price) <= p.holdings(g.price)) return;
        if (t) t.exposure += (priceDelta(g) > 0 ? 3 : 2); },
    },
    NIK: {
      edition: 'CORE',
      lead: "Nikolai 'Niko' Uilyamson — CEO, Nikoyl",
      tagline: 'We own the arteries. Where we close, we wait.',
      stats: S(8, 9, 8, 3, 7),   // signature: high control/stability, LOW expansion
      power: 'Own the Arteries',
      // "You don't beat him. You negotiate with him." Pipeline leverage: when the
      // price climbs (his moment), the richest rival pays a toll straight to Niko.
      // 1119 (docs/FACTION-BALANCE-1119.md, batch 5→6): the code paid Nikoyl toll+1 (the card said $1) and a $ toll
      // never reaches the verdict — power-off A/B: 1.00 on, 1.04 off. The arteries carry CRUDE: the toll is now
      // taken in kind when the rich rival is carrying cargo, and in cash (exactly $1) when it isn't.
      text: 'The gatekeeper toll — while the price is RISING, the richest rival pays the toll straight to Nikoyl each turn: 1 barrel out of its hold if it carries 2 or more, otherwise $1 (you don’t beat him, you pay him). Patient: very low growth.',
      passive: (g, p) => { if (priceDelta(g) > 0) { const t = g.richestOpp(p); if (!t) return;
        if (t.barrels >= 2) { t.barrels -= 1; p.barrels += 1; }
        else { const toll = Math.min(1, Math.max(0, t.value)); t.value -= toll; p.value += toll; } } },
    },
    // ===================== EXPANSION =====================
    PETRO_SUR: {
      edition: 'EXPANSION',
      lead: 'A council, not a CEO — Petro Sur (Caracas)',
      tagline: "We don't own the oil. We keep it moving. No matter what.",
      stats: S(6, 7, 4, 9, 8),
      power: 'Flow Under Pressure',
      // "They profit from instability, but collapse without flow. Cut them off, and
      // they starve." Adaptive resilience — every market lurch is fuel + cover.
      // 1119 (docs/FACTION-BALANCE-1119.md): fired on 22% of turns (a CHAOTIC era) for an A/B of +0.03 — barrels alone
      // barely reach the verdict. Expansion batch 5 tried "any lurch of 2+" (fired 63-83%, ran 1.34× at 8 seats as the
      // seat clock's scarcity premium lurched every late turn) — reverted. Batch 6: the canon trigger stays CHAOTIC, and
      // every SECOND chaotic turn the flow is also a claim on the ground: +1 control.
      text: 'Thrives on chaos — on a CHAOTIC turn, gain +1 barrel and shed 1 exposure (keep it moving, no matter what); every second chaotic turn the flow is also a claim: +1 control. A calm market gives nothing.',
      passive: (g, p) => { if (g.era === 'CHAOTIC') { p.barrels += 1; p.exposure = Math.max(0, p.exposure - 1);
        p.chaosTurns = (p.chaosTurns || 0) + 1; if (p.chaosTurns % 2 === 0) p.control += 1; } },
    },
    HADDAD: {
      edition: 'EXPANSION',
      lead: 'Khamis Haddad — Founder & Chairman, Haddad Energy',
      tagline: "We don't move markets. We steady them. We decide who feels it — and who does not.",
      stats: S(8, 9, 3, 5, 8),
      power: 'Market Stewardship',
      // The candidate card: STABILIZE / TIGHTEN + "Quiet Quota". Haddad suppresses
      // volatility as soft power — and "Visibility Risk": stability makes you a target.
      // 1119 (docs/FACTION-BALANCE-1119.md, expansion batch 1→2): the steadying hand moved the tape for everyone and
      // paid Haddad only the visibility cost — power-off A/B: 0.57× fair ON, 0.68× OFF (the power HURT), the weakest
      // seat in the box (its yard is the Gulf on fire). "We decide who feels it": calming a chaotic market is now
      // soft power the verdict reads — +1 control — and still +1 exposure (Visibility Risk).
      text: 'Steadies the tape — each turn nudges the price one step back toward its start, and forces a CHAOTIC market back to STABLE. Calming the storm is soft power: +1 control on any turn it calms a chaotic market — and standing tall is visible: +1 exposure on that turn too.',
      passive: (g, p) => {
        const mid = g.dials.PRICE_START;
        if (g.price > mid) g.bumpPrice(-1); else if (g.price < mid) g.bumpPrice(1);
        if (g.era === 'CHAOTIC') { g.forceEra('STABLE'); p.control += 1; p.exposure += 1; }
      },
    },
  };

  // sanity: every stat axis is a 1..10 art read (no fixed budget anymore)
  for (const code in FACTIONS) {
    const st = FACTIONS[code].stats;
    for (const k of STAT_AXES) {
      const v = st[k];
      if (!(v >= 1 && v <= STAT_MAX)) console.warn(`OiL! faction ${code} stat ${k}=${v} out of 1..${STAT_MAX}`);
    }
  }

  global.OIL_FACTIONS_FX = { FACTIONS, STAT_AXES, STAT_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = { FACTIONS, STAT_AXES, STAT_MAX };
})(typeof window !== 'undefined' ? window : globalThis);
