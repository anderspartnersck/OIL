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
      text: 'Generates nothing alone — banks +1 value for every 3 barrels the REST of the table holds (everyone fuels up at Big Hartmart). When oil enters the scarcity band the habit breaks: +1 exposure each turn.',
      passive: (g, p) => {
        const tableBarrels = g.players.reduce((a, q) => a + (q === p ? 0 : q.barrels), 0);
        p.value += Math.floor(tableBarrels / 3);
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
      text: 'Volatility is leverage — banks value equal to the SIZE of the market swing each turn, whichever way it broke. Starts capitalized (+$8).',
      setup: (g, p) => { p.value += 8; },
      passive: (g, p) => { p.value += Math.abs(g.lastShove || 0); },
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
      text: 'Frontier extraction — each turn banks +2 value and pumps the clock down faster (burn 1 oil), but the liability piles up: +1 exposure. Starts with the engineering edge (+2 pips).',
      setup: (g, p) => { p.pips = Math.min(g.dials.PIPS_START + 2, p.pips + 2); },
      passive: (g, p) => { p.value += 2; g.burnOil(1); p.exposure += 1; },
    },
    BRIGHT: {
      edition: 'CORE',
      lead: 'Bright 合 (national champion)',
      tagline: '合 — the price the whole country drives past.',
      stats: S(7, 8, 6, 9, 7),   // no stat card in refs — read from scale/ubiquity
      power: 'Post the Number',
      // The 92/95/98 board posted to all traffic; always-open 24小时 scale. Bright
      // doesn't hoard — it SETS the number, pushing the trend the way it's going.
      text: 'Sets the number the nation pays — pushes the shared price one step FURTHER the way it already moved this turn (amplify the trend; never reverses it).',
      passive: (g, p) => { const d = priceDelta(g); if (d > 0) g.bumpPrice(1); else if (d < 0) g.bumpPrice(-1); },
    },
    MINA: {
      edition: 'CORE',
      lead: 'The Board of Executives — Mina Gaz (Dnipro)',
      tagline: "We don't move oil. We move decisions. Flow without freedom.",
      stats: S(8, 8, 7, 7, 7),
      power: 'Chokepoint',
      // 'мина' = landmine: the buried thing your supply line runs over. The richest
      // rival is the one standing on it — and a rising price tightens the squeeze.
      text: 'The landmine under the supply line — each turn the table’s richest rival takes +1 exposure (+2 instead if the price rose this turn). No gain to Mina; pure squeeze.',
      passive: (g, p) => { const t = g.richestOpp(p); if (t) t.exposure += (priceDelta(g) > 0 ? 2 : 1); },
    },
    NIK: {
      edition: 'CORE',
      lead: "Nikolai 'Niko' Uilyamson — CEO, Nikoyl",
      tagline: 'We own the arteries. Where we close, we wait.',
      stats: S(8, 9, 8, 3, 7),   // signature: high control/stability, LOW expansion
      power: 'Own the Arteries',
      // "You don't beat him. You negotiate with him." Pipeline leverage: when the
      // price climbs (his moment), the richest rival pays a toll straight to Niko.
      text: 'The gatekeeper toll — while the price is RISING, the richest rival pays a $1 toll straight to Nikoyl each turn (you don’t beat him, you pay him). Patient: very low growth.',
      passive: (g, p) => { if (priceDelta(g) > 0) { const t = g.richestOpp(p); if (t) { const toll = Math.min(1, t.value); t.value -= toll; p.value += toll + 1; } } },
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
      text: 'Thrives on chaos — on a CHAOTIC turn, gain +1 barrel and shed 1 exposure (keep it moving, no matter what). A calm market gives nothing.',
      passive: (g, p) => { if (g.era === 'CHAOTIC') { p.barrels += 1; p.exposure = Math.max(0, p.exposure - 1); } },
    },
    HADDAD: {
      edition: 'EXPANSION',
      lead: 'Khamis Haddad — Founder & Chairman, Haddad Energy',
      tagline: "We don't move markets. We steady them. We decide who feels it — and who does not.",
      stats: S(8, 9, 3, 5, 8),
      power: 'Market Stewardship',
      // The candidate card: STABILIZE / TIGHTEN + "Quiet Quota". Haddad suppresses
      // volatility as soft power — and "Visibility Risk": stability makes you a target.
      text: 'Steadies the tape — each turn nudges the price one step back toward its start, and forces a CHAOTIC market back to STABLE. Standing tall is visible: +1 exposure on any turn it calms a chaotic market.',
      passive: (g, p) => {
        const mid = g.dials.PRICE_START;
        if (g.price > mid) g.bumpPrice(-1); else if (g.price < mid) g.bumpPrice(1);
        if (g.era === 'CHAOTIC') { g.forceEra('STABLE'); p.exposure += 1; }
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
