/* OiL! NATIVE ENGINE — the game's OWN rules, not the ER$N substrate.
   ============================================================================
   Implements the architecture locked in docs/DESIGN-DIRECTION.md + the dice review
   (Candidate 3, "Unified 3-Die"):

     • ONE 3-die roll per active turn (Red, Black, + a third "fate" die). Expansion
       adds the Green Anders die as a trigger-only override (no new meter).
     • The roll is read on TWO layers off the SAME dice:
         - shared MARKET: the three-body "price shove" (sorted a-2b+c, from
           three_body.py) moves the shared OIL PRICE. Mean 0 -> no house drift.
         - personal FATE: the third die + a one-pip "slingshot" the active player
           may spend to flip the shove's sign (the lever three_body.py describes).
     • Collapse clock = OIL REMAINING, monotonic (Charter G2). Every turn burns oil,
       so the clock PROVABLY reaches 0 -> E.D.D. is always reachable (Charter L2/E3).
     • Endgame = E.D.D. PROTOCOL (Eat / Divide / Destroy), fired by price+instability
       OR by oil running out.

   EVERY NUMBER BELOW IS A DIAL (strawman), exactly like three_body.py — none is
   declared canon. The validator (scripts/oil-sweep.js) sweeps + proves the laws.
   No faction/card/lore content is invented here; faction asymmetry is OFF
   (symmetric) pending CORE-014. Pure + seedable (Charter E1): seed -> outcome is
   byte-stable; no decoration touches this RNG.

   Runs in Node (globalThis) and the browser (window). */
(function (global) {
  'use strict';

  // ---- seedable RNG (mulberry32) — same surface as the ER$N engine ----------
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return {
      random: next, d6: () => 1 + Math.floor(next() * 6), pick: arr => arr[Math.floor(next() * arr.length)],
      shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    };
  }

  // ============================================================================
  // DIALS — single source of truth for every tunable. Strawman values; the sweep
  // validates them. Change here, re-run scripts/oil-sweep.js. (Charter E4.)
  // ============================================================================
  const DIALS = {
    // --- the DICE themselves (model A, LOCKED — designable in THE DICINER) -------
    // The three core bodies (canonically Supply/Weather/World) are INTERCHANGEABLE:
    // each rolls the same faces, read as one emergent shove. Defaults = standard d6
    // + the three_body.py weights, so the classic edition stays byte-identical.
    DIE_FACES: [1, 2, 3, 4, 5, 6],   // faces shared by the 3 bodies (design them here)
    SHOVE_W: [1, -2, 1],             // weights on the SORTED dice (a<=b<=c): a - 2b + c
    GREEN_TRIGGER: 5,                // expansion green die intervenes when it rolls >= this
    // ---- THE ANDERS DIE, PUNITIVE (docs/THE-CONTROL-LAYER.md §5) -------------
    // The three bodies are nature and markets: symmetric, untargeted, and they do not know your
    // name. Anders does. This is the one roll that can reach across the table and TAKE something
    // from a named company — which is the game admitting the house is a participant, and why it
    // belongs in the expansion, breaking a rule the core needs.
    //
    // It is AIMED AT THE LEADER on purpose. Random cruelty is just noise; leaning on whoever is
    // winning is a hand on the scale, which is the point. And it fires only on the top face of a
    // die that is already gated to CHAOTIC expansion turns — roughly a sixth of a third — because
    // punitive AND frequent is just misery.
    GREEN_PUNITIVE_AT: 6,            // only the top face punishes; 5 stays the old price shove
    GREEN_SEIZE_HEAT: 3,             // 'assign the blame' — heat dumped on ground the leader holds
    GREEN_LEVY: 6,                   // 'call the loan' — value taken from the leader
    // --- price (the shared market) ---
    PRICE_START: 50, PRICE_MIN: 5, PRICE_MAX: 120,
    // three-body era threshold: CHAOTIC when |shove| >= T_CHAOS (three_body.py sweep)
    T_CHAOS: 3,
    // --- oil remaining (the monotonic collapse clock) ---
    OIL_START: 60,
    BURN_BASE: 1,            // floor burn every turn -> guarantees reachability (>=1)
    BURN_PER_PRICE: 40,      // +1 burn for each full PRICE/40 (higher price = faster extraction)
    // --- scarcity premium: as the oil runs out, PRICE CLIMBS (the oil-market truth).
    //     Explicit + visible (not a hidden drift) — it makes the price+instability
    //     E.D.D. path reachable instead of decorative, and models the scarcity spike.
    SCARCITY_BAND: 30,       // premium kicks in once oil drops to/below this
    SCARCITY_DIV: 2,         // premium this turn = ceil((BAND - oil) / DIV)
    // --- E.D.D. trigger ---
    EDD_PRICE: 88,           // price at/above this + CHAOTIC era arms E.D.D. (the spike path)...
    EDD_OIL: 6,              // ...and E.D.D. also arms when oil drops to/below this (the backstop)
    EDD_ROLL: { 1: 'EAT', 2: 'EAT', 3: 'DIVIDE', 4: 'DIVIDE', 5: 'DESTROY', 6: 'DESTROY' },
    // --- player layer (MINIMAL strawman; the G3/G5 slots are still open) ---
    BARRELS_START: 2, PIPS_START: 3, PIP_REGEN_EVERY: 3,
    PIP_CAP: 'start',        // carry-over #12 (2026-11-10): what the pip cards top you up to. 'start' = PIPS_START for
                             // everyone (frozen; Milecastle's 5 is clamped to 3+1) · 'own' = your own starting count
    HOLD_PENALTY: 4,         // "always move or take a penalty": skip your action -> price-points of value lost
    CLAIM_COST: 1,           // barrels spent to claim/produce

    // ---- CONTROL (docs/THE-CONTROL-LAYER.md §2) -----------------------------
    // Territory measured in the only unit this game already trusts: barrels moved
    // through a place. Read off the claim/sell action that already exists — it adds
    // NO decision (LAB 11's one-page budget), which is the whole constraint.
    // ---- THE RATCHET — BUILT, MEASURED, AND REMOVED (docs/THE-CONTROL-LAYER.md §3) --------
    // The brief asked for player action to "ratchet up or down" the price. It was built here and
    // taken back out, because the measurement said it cannot work in THIS economy:
    //
    //   · Charter E1 rejected it immediately — oil-rich drift went to -0.43/turn against a 0.15
    //     tolerance. A lean that only points one way IS a house drift; that is what E1 is for.
    //   · The reason it only points one way is the barrel economy. Players start with 2 barrels
    //     and spend them one at a time. Measured over 60 games: 6,845 seat-turns holding ZERO
    //     barrels, 1,475 holding one, 600 holding two, and NOT ONE holding four.
    //   · So §3's two sides do not exist here. "Sell a large lot" is impossible — every sale is
    //     one barrel. "Withhold and stockpile" is impossible — there is nothing to withhold.
    //     Only the down-lean can ever fire, so only drift can result.
    //
    // A LEGAL ratchet needs a two-sided pressure source that this economy actually has. The
    // candidates are on the board already and are NOT barrel-flow: CONTROL of a place (§2), a
    // gate shut by somebody who holds it, and fire destroying supply. Those can push both ways
    // and fire independently of sales. That is the next attempt, and it is a design decision
    // about what "pressure" means — not a threshold to tune until E1 stops complaining.
    //
    // Dials kept, unused, so the attempt is legible rather than silently lost.
    THROUGHPUT_DECAY: 0.85,  // control ROTS without trade. You hold ground by working it.
    CONTROL_MARGIN: 1.25,    // you must beat second place by this to hold it outright...
    CONTROL_MIN: 2,          // ...and clear this floor, so one stray barrel owns nothing.
                             // Below either bar the place is CONTESTED — a state, not a tie-break.
  };

  // ---- EDITIONS (matches the ER$N pattern) -----------------------------------
  // 'classic'   = the frozen, validated baseline. Reference. Do not tune.
  // 'benchmark' = the TUNABLE balance lane for reversible experiments. Currently:
  //   (1) LEADER RUBBER BAND (Charter L3) — the control leader takes +1 exposure
  //       each turn, so leading carries danger BY RULE (the design's "#1 risk").
  //   (2) HOTTER MARKET — scarcity bites sooner + E.D.D. arms earlier, so the
  //       price-spike collapse path fires more often (cranks the intensity, G11).
  // Both are validated by scripts/oil-sweep.js to still pass every franchise law.
  const EDITIONS = {
    classic:   { rubberBand: false, dials: {} },
    benchmark: { rubberBand: true,  dials: { SCARCITY_BAND: 36, EDD_OIL: 4, EDD_PRICE: 84 } },
  };

  // ---- THE SEAT CLOCK (round 8; docs/THE-EXPANSION.md "Round 8") --------------------------
  // Designer, round 8: "yes on scaling, EDD starts earlier". With a fixed 60 oil the game was
  // ~6 rounds at 4 seats, ~4 at 6, ~3 at 8 (and 12 at 2): the burn is per TURN, so more seats
  // drain the same well in fewer rounds. opts.clock (true | { overrides }) scales the clock with
  // the seats so every table plays ~6 rounds, and arms E.D.D. a round from the end (the "last
  // lap"). ★ THE FULL EXPANSION turns it on. Off -> nothing here runs and the frozen baseline is
  // byte-identical. Every value is 'per seat' and REPLACES the matching DIALS entry at setup
  // (explicit opts.dials still win). No new meter: the same oil, price, era and heat.
  const CLOCK_DIALS = {
    OIL_PER_SEAT: 15,        // OIL_START = this × seats (60 at 4 seats — the old fixed well)
    EDD_OIL_PER_SEAT: 3.5,   // EDD_OIL = this × seats: E.D.D. arms with ~a round of oil left (14 at 4)
    SCARCITY_PER_SEAT: 7.5,  // SCARCITY_BAND = this × seats (30 at 4): the premium starts at the same FRACTION of the well
    SCARCITY_DIV_PER_SEAT: 0.5,   // SCARCITY_DIV = this × seats (2 at 4): over more turns, a gentler premium per turn
    // ---- ROUND 10 — THE 8-SEAT FIXES (designer: "make the 3 changes as well") ----------------------
    // Diagnosis (1000 games per seat count): the burn per seat-turn rose 2.30 (2p) -> 2.63 (8p) because the
    // chaotic season's gate heat (CRISIS HEAT_CHAOS_GATES on every open strait) fired on EVERY seat-turn:
    // 8-seat boards took ~150 heat a game vs 34 at 2, the shut straits spilled into the yards, and fires ran
    // 1.44 a game vs 0.04. And the longer price walk at big tables took the spike from 0% (2p) to 30% (8p).
    CHAOS_GATES_PER_ROUND: true,  // (1) the chaotic season heats the straits only on the FIRST chaotic roll of each
                                  //     round (round = floor((turn-1)/seats)); the roller's own water (HEAT_CHAOS_LOCAL)
                                  //     still heats on every chaotic roll. false = round 8 (every chaotic roll)
    EDD_PRICE: null,              // (3) a flat spike override ($, in a CHAOTIC era). null = the per-seat line below.
                                  //     Round 8 ran a flat $78 (was 88 before the clock — unreachable once oil arms first)
    EDD_PRICE_BASE: 66, EDD_PRICE_PER_SEAT: 3,   // the spike = $66 + $3 × seats (72 at 2 · 78 at 4 · 90 at 8)
    // (2) the two board-heat lines are FLAT again once the season heat no longer scales with the seats.
    //     Round 8's per-seat formulas (fire 24 + 8/seat, wartime 20 + 5/seat) were measured and RETIRED in round 10.
    ANNIHILATION_AT: 36,          // CRISIS ANNIHILATION_AT ("too much of the world on fire") at every table size
    GOV_HEAT_AT: 26,              // THE PRIVILEGE's wartime board-heat line at every table size
  };

  // ---- HEGEMONY — the designed 2-player game (round 11; docs/THE-HEGEMONY.md; CONCEPT, CORE-026) ----
  // Designer, verbatim: "the function of having all companies on the board and introducing a matrix of
  // partners that will hurt the other player if these sitting duck pawns are collected off the board in a
  // tough but designed process for 2 player codename Hegemony". opts.hegemony (true | { overrides }),
  // 2 seats only. All 8 companies are on the board: the 2 players run one each; the other 6 sit at their
  // HQs as SITTING-DUCK PAWNS (no turns). A MATRIX of partnerships ties each pawn to the players; a pawn
  // is a STAKE of control ▰ for its backer(s), counted in the verdict. COLLECTING a pawn takes it off the
  // board: the rival's stake in it is lost (the hurt), yours is banked, and you take its ground (+▰, EAT's
  // "acquire territory"). The process rides existing steps — sail in, stay (camp), stay clean — and asks
  // nothing new. Off -> nothing here runs (the baseline is byte-identical). Every number is a DIAL.
  const HEG_DIALS = {
    MATRIX: 'cross',         // 'simple' — 3 partners each, open (weight 1 to its one backer)
                             // 'cross'  — every pawn backs BOTH players with unequal weight: two lean to each
                             //            player (2 vs 1) and two are CONTESTED (1 vs 1)
    STAKE: 1,                // control ▰ per point of matrix weight
    COLLECT_TURNS: 2,        // consecutive own turns ending docked at the pawn's HQ (arrive, then stay — CAMP)
    COLLECT_PRIV: 3,         // ...holding this many of your OWN bodies (clean: ●●●) on each of them
    EDD_TURNS: 1,            // in the collapse (E.D.D. armed) the ducks are loose: a collection needs this many turns
                             // instead (null = the same as before). Tuned round 11: the only lever that moved the last lap
    LEADER_EXTRA: 0,         // L3 lever: the LEADER (verdict order) needs this many MORE turns in the yard (99 = only the
                             // trailer may collect). Round 11 ran 1; ROUND 12 OFF (designer: "perhaps we lose the leader
                             // extra turn that seems too much") — kept behind the dial, measured both ways in THE-HEGEMONY.md.
                             // LOCKED OFF 2026-10-23 (designer: "no extra turns unless driven by card or game chain")
    OIL_PER_DUCK: 5,         // round 12 ("yes count all for oil"): each duck adds this much oil to the 2-player well.
                             // 5 -> 60 oil, ~13 rounds; 15 (the seat rate: all eight companies) -> 120 oil, ~25 rounds
    // ---- THE RICO PROTOCOL (round 12; designer: "protocol should hit ducks and partners almost in a RICO, ducks on
    //      a pond we all go down kind of thing. simulates ruthlessness or shunning of allies or bad deals. if it gets
    //      that bad or a card wills it, it can hurt"). An E.D.D. strike that lands can SPREAD, once, one level:
    //        · to the struck seat's PARTNERS (standing deals, THE TABLE): each loses ▰RICO_CONTROL and takes +RICO_EXPOSURE;
    //        · to the struck seat's DUCK — 2 players: the duck it has the biggest stake in is knocked off the pond and
    //          EVERYONE backing it loses that stake; 3–7: RICO_DUCKS 'yard' — the duck yard the struck seat holds is
    //          stripped from it (the station is gone, as the firm's SEIZE does); 'none' — ducks are scenery at 3–7.
    //      ONLY "if it gets that bad" — the board at wartime heat (privilege GOV_HEAT_AT), or the firm filed the strike
    //      (THE PROTOCOL, ANDERS_ROLE) — "or a card wills it": a RICO card played while E.D.D. is armed arms the next
    //      strike. The way out already exists: break the deal before the hit (and carry the grudge). Never chains (L4).
    RICO: true,
    RICO_CONTROL: 1, RICO_EXPOSURE: 1,
    RICO_DUCKS: 'none',      // 3–7 players: 'none' (ducks are scenery — round 12 measured 'yard' at 0.05–0.16 yards a game,
                             // indistinguishable from none at 1,000 games a seat count) | 'yard' (the struck seat's duck yard is stripped)
    RICO_HEAT: true,         // "that bad": the board at wartime heat...
    RICO_HEAT_AT: 36,        // ...this much board heat (the clock's flat fire line; null = privilege GOV_HEAT_AT, which
                             // fired 2× as often in the long 2-player game — "not always")
    EDD_BY_WELL: true,       // 2-player HEGEMONY: E.D.D. arms with 3.5 oil per 15 of the WELL (14 at 60), i.e. a real last lap
    SCARCITY_BY_WELL: false, // ...the scarcity band and divisor stay on the seats (bisect: following the well cost 5 points)
    SPIKE_BY_WELL: false,    // 2-player HEGEMONY: the spike line reads the well's size (as if seats = well / 15) instead of the seats
    ANNIHILATION_AT: 44,     // 2-player HEGEMONY only: the fire line for the bigger well (null = the clock's flat 36, which
                             // armed 24% of 60-oil games — clearly too much; 44 -> ~14%)
    RICO_FIRM: true,         // ...or the firm filed the strike
    RICO_CARDS: ['Catastrophe', 'Dog-Wagged', 'All Yours'],   // ...or a card wills it (data.py: "multi-region impact" ·
                             // "small action causes large effect" · "transfer liability; pass crisis effect to another player")
    // ---- round 12 addendum (designer: "rolling for every company is an idea, but perhaps you would roll for your
    //      ally influence instead. and for expansion franchises, they can ally with certain ones in the core as well"
    //      + "but not each other"). Ducks never roll for themselves; YOU roll for your influence in them.
    STAKES: 'printed',       // 'printed' — THE BACKYARD (round 13, Joe 2026-10-23: "I would like the 2 player duck layout fixed"):
                             //            a fixed table, each company ◇2 in its BACKYARD[code] nearest ducks, ◇1 elsewhere (CONCEPT)
                             // 'rolled' — at setup each player throws a body (d6) per duck: 4+ = ◇2, else ◇1 (round 12)
                             // 'near' / 'far' — ◇2 to the closer / farther seat (measured round 13: no help, sd 13.4 / 11.2)
                             // 'fixed'  — round 11's dealt layout (2:1 ×2, 1:2 ×2, 1:1 ×2)
    BACKYARD_DEFAULT: 3,     // STAKES 'printed': ducks a company holds ◇2 in, unless BACKYARD names it. Tuned round 13
    BACKYARD: { MINA: 1, PETRO_SUR: 1, HARTSTARR: 2, MC: 3, STOCK: 4, HADDAD: 5, NIK: 5, BRIGHT: 6 },   // (1,600 games: the
                             // strong companies hold few, the weak many; spread 73%->37% became 59%->44%, below 2p FULL's 63->41)
    MINA_RICHER: true,       // 2p only: Mina's Chokepoint fires only under a rival richer than Mina (oil-factions.js)
    COURT: 'dock',           // 'dock' — the 2-turn dock (arrive, then stay) holding ●●●
                             // 'roll' — every docked turn is an INFLUENCE THROW: your best own body vs the rival's
                             //          best own body + its ◇ in the duck (the dispute throw's shape); win = collected
    AFFINITY: true,          // the expansion franchises' standing allies in the core (pairings CONFIRMED by Joe 2026-10-23):
    AFFINITIES: { PETRO_SUR: ['BRIGHT', 'MINA'],   // state petro-nationalist <-> the state champions (all HELD_BY_STATE)
                  HADDAD: ['STOCK', 'MC'] },       // Gulf sovereign <-> the Western majors that built the Gulf fields
                             // HARD RULE (designer: "but not each other"): PETRO_SUR and HADDAD are NEVER allies
    COLLECT_CONTROL: 1,      // the collector takes the pawn's ground: +▰ (EAT "acquire territory")
    COLLECT_EXPOSURE: 2,     // ...and it is on the record (+exposure)
    // the rival's answers are moves that already exist: dock in the same yard (no collection while
    // both ships are there), or lay a SNARE on the collector (a standing snare stops the collection)
    SNARE_STOPS: true,       // false: a snare only does what a snare does (springs when you lose a body)
    // bot temperament (not rules)
    BOT_PULL: 10,            // how much a bot wants a pawn's yard (+ 4 per point of the rival's stake in it)
    BOT_STAY: 25,            // ...and wants to stay once a collection has begun
    BOT_BLOCK: 8,            // ...and wants to dock where the rival is collecting
    RANDOM_FOCUS: 0.5,       // the 'random' temperament plays the hegemony this often (else sails at random)
  };

  // ---- OIL LEVELS (open call O2, PROTOTYPE 2026-11-10; docs/RESUME-2026-11-10.md) -------------
  // Joe 2026-11-02 (Talisman): nested regions you work inward through; each pays more and is
  // harder; a gate between; losing pushes you back ONE region out. ER$N built it as a tower
  // (BENCHMARK-LEVELS.md). OiL's catch is length (CORE-022: ~5 turns, 1-2 voyages a seat), so
  // two shapes are built, both behind opts.levels (default OFF -> no branch, no RNG, the
  // baseline fingerprint is byte-identical):
  //   'two'    — a CAREER, two levels. WILDCAT (your HQ, the ground, open water, the pipes)
  //              -> THE LANES (the gates, the capes, the ice, the megastructures). The licence
  //              is a landed cargo + a clean-enough record; an enforcement hit (seizure, pirates,
  //              requisition, a dirty inspection) or a record over the ceiling revokes it and
  //              tows you home.
  //   'voyage' — a VOYAGE climbs. Every cargo starts at WILDCAT; sailing through a gate or a
  //              cape lifts it to THE LANES, the ice or a megastructure to THE CARTEL; it is paid
  //              by the deepest level it reached. Each incident on the way (peril, storm, a
  //              dirty inspection, pirates, a seizure) knocks it one level back. Landing resets.
  //              No new prompt: the route you pick IS the climb.
  // Every number is a DIAL (CONCEPT).
  const LEVEL_DIALS = {
    // DEFAULTS as of round 3 (2026-11-10; QUESTIONS-MASTER OiL! #12/#14, building on): VOYAGE has TWO tiers
    // (the third, CARTEL, measured as no change — ice + megastructures count as THE LANES); the licence is
    // 1 cargo + $40. Restore 3 tiers with TIER {arctic:3, built:3} + VOY_PCT [0,35,70].
    TIER: { hq: 1, onshore: 1, ocean: 1, gate: 2, cape: 2, arctic: 2, built: 2 },   // place kind -> level
    // 'two'
    LICENCE_SALES: 1,        // cargoes landed at WILDCAT (since your last fall) to earn THE LANES
    LICENCE_FEE: 40,         // $ paid when the licence is granted (0 = free); a seat that can't pay waits a turn
    LICENCE_GAP: 8,          // ...and your exposure above the cleanest seat must be under this (= PRIV_STEP: all 3 bodies)
    LICENCE_KEEP: 16,        // ...and over THIS at the start of your turn the licence is revoked (works with no privilege;
                             // false = never). A2 of 2026-11-10: at 8 (earn = keep) it flapped 1.6 times a game in core
    TWO_FALLS: ['seize', 'pirates', 'requisition', 'inspection'],   // enforcement events that revoke it
    TOW_HOME: true,          // a revoked ship on LANES water (or under way) is towed back to its yard
    LICENCE_BARREL: 0,       // DECISIONS-1110 (the core TWO empty hold): barrels loaded when the licence is granted
                             // (each burns 1 oil, so oil still only goes down). 0 = today.
    // 'voyage'
    VOY_PCT: [0, 35],        // % added to the sale by the deepest level the cargo reached (WILDCAT/LANES[/CARTEL])
    VOY_FALLS: ['peril', 'storm', 'inspection', 'pirates', 'seize', 'requisition'],
    VOY_BOT: 8,              // bot temperament: pull per level a route climbs, with cargo aboard
  };

  // ---- THE PRIVILEGE (docs/THE-PRIVILEGE.md; CONCEPT, logged as CORE-023) --------
  // "In OiL! you may only get to roll 1 of the 3 dice if penalties accrue." The number of
  // the three bodies a seat rolls ITSELF is a function of its penalties: clean, you roll all
  // three; carrying penalties, two, then one. The bodies you cannot roll are rolled FOR you
  // by the STEWARD — the cleanest seat at the table. Model A is untouched: three bodies,
  // one emergent price, the same three dice off the same RNG. What privilege moves is WHO
  // HOLDS THEM: you may bend the market (the pip-flip) only if the MIDDLE body is in your
  // hand, and with THE MAP on you sail on the spread of your own bodies only.
  // Default OFF (opts.privilege) -> no branch, no RNG, the frozen baseline is byte-identical.
  // Every number is a DIAL.
  const PRIV_DIALS = {
    PRIV_MEASURE: 'gap',     // what counts as a penalty:
                             //   'gap'    — your EXPOSURE above the cleanest seat (relative)
                             //   'abs'    — your exposure on the record (absolute thresholds)
                             //   'recent' — exposure you took since your last turn (a round)
    PRIV_STEP: 8,            // 'gap': each full STEP of exposure above the cleanest seat costs a body
    PRIV_ABS: [12, 24],      // 'abs': at/above these totals you roll 2, then 1
    PRIV_RECENT: [3, 6],     // 'recent': exposure taken in the last round at/above these -> 2, then 1
    PRIV_FLOOR: 1,           // never fewer than this (L4: a floor — nobody is shut out of the roll)
    PRIV_WHO: 'house',       // who rolls the bodies you can't (DESIGNER 2026-10-22: NOBODY by default):
                             //   'house'   — thrown unowned: same dice, same price, nobody may bend them
                             //   'held'    — nobody: they stay where the last roller left them
                             //   'steward' — REJECTED by the designer (an automatic cleanest-rival roller);
                             //               kept only so the first measurement can be reproduced
    // ---- WHEN A RIVAL GETS YOUR BODY — only by a SPECIFIC trigger (designer, 2026-10-22) ------
    // "SOMETIMES one of your rivals gets to roll your penalized die, but the triggers must be
    //  specific, card driven, and/or a trap or attack set by another" — and the second variant,
    // "or make them roll it and have another benefit from the work that turn under certain chains
    //  or circumstances." Both are built; PRIV_RIVAL picks.
    PRIV_RIVAL: 'both',      // 'seize' | 'toll' | 'both' | 'none'
    //  SEIZE — a rival THROWS your missing body, and while they hold it the pip-flip on your turn is
    //  theirs (on any CHAOTIC roll), not yours. Triggers: the SNARE (a trap on THE TABLE) and three
    //  cards (Leviathan Knows · Boots On The Ground · Dog-Wagged).
    SEIZE_ROLLS: 3,          // lasts this many of the victim's rolls — or until they regain the body
    SEIZE_BEND: 'always',    // 'always': the seizer holds your flip on any chaotic roll · 'median': only if theirs is the middle body
    SNARE_PIP: 1,            // setting a snare costs the setter a pip...
    SNARE_HEAT: 1,           // ...and is on the record (setting traps is dirty: it can cost YOU a body)
    SNARE_LIFE: 4,           // a set snare rusts after this many of the victim's turns without springing
    SNARE_RATE: 0.25,        // bot temperament: chance a greedy seat lays a snare when it can
    //  TOLL — you THROW the body yourself, but a rival takes what it earns: the pip-flip if it lands
    //  as the middle body, and TOLL_CUT% of the sale you make that turn. Triggers are CHAINS that
    //  already exist: you PAY TRIBUTE to them while short a body (the protector skims the work); they
    //  named you the SCAPEGOAT while you were short (they pinned it on you, now they bill you); and two
    //  cards (I've Travelled Across For You · Oligarcheology).
    TOLL_CUT: 50,            // % of the tolled seat's sale value that turn
    TOLL_TAKES: 'cash',      // 'cash' (TOLL_CUT% of the sale) | 'cash+control' (and the sale's ▰) — the bite dial
    TOLL_TURNS: 3,           // card / scapegoat tolls last this many of the victim's turns — or until regained
    // ---- THE SEA'S OWN LAW (designer round 3: "tie it to maritime law… canals and waterways
    //      perhaps will make you have to roll less dice? build it in to the whole fabric") --------
    PRIV_WATER: 'body',      // a voyage THROUGH a gate (canal or strait) costs a body on your next roll:
                             //   'body' — the body is lost to the house, nobody collects (ROUND 7 DEFAULT)
                             //   'dues' — and the gate's WARDEN (the seat holding the yard beside it) tolls
                             //            that body: TRANSIT DUES; a warden's own gate costs it nothing.
                             //            Suez / Bab el-Mandeb have no warden at this table.
                             //   false  — waterways do not touch privilege
                             // ROUND 7 — THE CHISEL ("if the rules are getting too complicated, its time to chisel
                             // it down"): 'dues' was measured (oil-crunch, 200 paired games) at 0.21 dues a game
                             // and no measurable effect on length, ending, balance or decisions — pure rules
                             // weight. Cut to 'body': the canal still costs a die (LOCKED), it goes to the house,
                             // and there is no warden. The 'dues' code stays here, dormant, behind this dial.
                             // The long way round (a CAPE, the ice) costs NO body: the escape route.
    WATER_AVOID: 2,          // bot temperament: how much a seat dislikes a destination behind a gate it doesn't ward
    PRIV_ARREST: false,      // ADMIRALTY ARREST: end a voyage docked in a rival's HOME yard while short a
                             // body, and the port's company seizes it. Open water is nobody's jurisdiction.
                             // ROUND 7 — CUT (measured 0.47 a game, no measurable effect): dormant behind
                             // this dial. The one arrest left is MOMENTUM's dirty-inspection arrest below.
    INSPECT_ARREST: true,    // MOMENTUM's inspection arrest: a DIRTY ship halted at a rival's customs is
                             // seized by that port's company (was gated on PRIV_ARREST until round 7 split them)
    PRIV_SALVAGE: false,     // SALVAGE: call IWS on a fire in a rival's yard, and if they are short a body
                             // the salvor tolls them — the firefighter's bill becomes a salvage award.
                             // ROUND 7 — CUT (measured 0.03 a game: almost never fires): dormant behind this dial.
    PRIV_EDD: true,          // E.D.D.: EAT seizes the eaten's short body; DIVIDE tolls it.
    // ---- GOVERNMENT SEIZURE (designer round 3: "seize can be player directed or government,
    //      especially in late game scenarios where the global heat or nuclear war looms") -----------
    GOV: true,               // requisition: in WARTIME the state takes a body (on top of exposure)
    GOV_HEAT_AT: 40,         // wartime level 1: total board heat this high (annihilation arms at 64)...
    GOV_OIL_AT: null,        // ...or the oil this low — RETIRED (round 6: "some government squeeze, but lets not get
                             // too crazy"): wartime is the designer's own words, "global heat or nuclear war looms"
                             // level 2: E.D.D. is armed.
    GOV_HITS: 'private',     // 'private' — only privately held companies; state-held ones ARE the state
                             //             (they already pay their crises in legitimacy) · 'all'
    GOV_TARGET: 'leader',    // 'leader' (biggest private operator by control — nationalise the giant)
                             //  · 'exposed' (worst record) · 'hot' (standing on the hottest ground)
    GOV_WHO: 'house',        // who throws a requisitioned body: 'house' (the state is not at the table —
                             //  nobody bends it) · 'state' (the nearest state-held seat throws it, and bends)
    GOV_ROLLS: 2,            // a requisition lasts this many of the victim's rolls
    GOV_PER_ROUND: 1,        // requisitions per round: a flat 1 (round 6) · 'level' = one per wartime level (round 3)
    GOV_MIN_LEVEL: 1,        // the wartime level at which the round requisitions start
    GOV_CARDS: true,         // a war/government card played in wartime requisitions too
    PRIV_EXTRA_MAX: 1,       // L4: the sea and the state take ONE body between them per roll, never two
    // ---- PIRATES (designer round 5: "government or pirates controlled by a house roll, taking them
    //      from private companies") — the non-state seizure: any time, at sea, where piracy lives ----
    PIRATES: true,
    PIRATE_AT: 6,            // the HOUSE throws a d6 once per voyage that crosses pirate water: a 6 = boarded (DECIDED, CORE-025 #4)
    PIRATE_PLACES: ['BAB', 'MALACCA'],   // Bab el-Mandeb / the Gulf of Aden; Malacca (+ the routes in OIL_MOMENTUM.PIRATE_WATERS)
    PIRATE_AT_SEA: null,     // RETIRED (designer, round 6): open Pacific/Atlantic crossings are never boarded —
                             // pirates live only in pirate water (a number here restores the old at-sea throw)
    // PIRATES READ THE STATE OF THE WORLD (round 6: "it must be rare or a board condition allows there to
    // be pirate activity… mimic the state of the world as it becomes less stable or more stable"). No meter:
    //   QUIET    a STABLE world: no boarding — unless the pirate water is itself HOT (crisis heat), then a 6
    //   AWAKE    a CHAOTIC season, or a pirate strait (or its neighbour) shut: a 6. They stay awake a round.
    //   SEVERE   WARTIME (the state's own reading) or E.D.D. armed: 5-6
    PIRATE_HOT: 2,           // crisis heat on a pirate strait (or a yard beside it) at/above this = hot water
    PIRATE_SEVERE_AT: 5,     // the severe threshold
    PIRATE_WAKE_ROUNDS: 1,   // a chaotic season keeps the pirates awake this many rounds
    PIRATE_ROLLS: 2,         // held for ransom: the body is the house's for this many of your rolls
    PIRATE_HITS: 'private',  // 'private' (state ships sail with a navy) · 'all'
    // ---- THE DISPUTE DECK (round 5): the 7 claim cards become their own deck, held to CONTEST claims
    DISPUTE_HAND: 2,         // dispute cards a seat may hold
    // ---- GREEN ANDERS in the expansion: unaffected by privilege, but the firm has two jobs —
    ANDERS_ARBITER: true,    // a TIED dispute: the green die decides (>= GREEN_TRIGGER: the defender — "the firm decides")
    ANDERS_BRIBE: true,      // a DIRTY inspection: the green die (>= GREEN_TRIGGER) waves you through — no fine, no arrest, +1 exposure
    // ---- ROUND 9 — "the anders die needs a new diabolical function" (designer). THREE PROTOTYPES, one
    //      dial, default 'none' until Joe picks. Each is a HOUSE throw of the green die (>= GREEN_TRIGGER)
    //      read off a step that already happens — never a new ask — and each lives on the privilege system.
    //      The firm is unaffected by privilege (LOCKED): it is nobody's body; it takes, holds and books them.
    //   'books'    THE BOOKS — when your record would cost you a body, the firm CERTIFIES it: the body
    //              stays, the exposure is written off, you pay its fee — and the debt is booked. When
    //              E.D.D. arms, every booked point comes due ×ANDERS_DEBT_MULT. (Charter §0: A&P "file,
    //              zone, certify… renaming the impossible until it fits a form"; THE-CONTROL-LAYER §5
    //              "call the loan — force a mortgage due"; EXPANSION-NOTES: the green die's "corruption ·
    //              unexpected consequences · double-check your career moments".)
    //   'hand'     THE HAND ON THE SCALE — every time the green die intervenes (the core roll), the firm
    //              also takes a body from the LEADER (verdict order) for ANDERS_ROLLS rolls, and skims
    //              TOLL_CUT% of every sale they make while it holds it. (THE-CONTROL-LAYER §5: "aimed at
    //              the leader on purpose… a hand on the scale", "seize"; CORE-023 (l)/(m): a house roll
    //              takes a body; the firm is not the state, so state companies pay too.)
    //   'protocol' THE FIRM FILES THE PROTOCOL — at every E.D.D. strike the green die is thrown: on a hit
    //              the firm aims the strike at the LEADER (no grudge, no partner shield — the firm has no
    //              partners) and the struck body goes to the firm, not the striker. (EDD_PROTOCOL in
    //              data.py: "late-game predatory capitalism"; EXPANSION-NOTES: the expansion's question is
    //              "who exploited it?"; THE-CONTROL-LAYER §5: aimed at the leader.)
    ANDERS_ROLE: 'protocol', // DECIDED round 9 (designer: "go with c, the protocol"). Measured (200/1000 paired games):
                             //   'protocol' — the leader when E.D.D. arms wins 51% -> 44%, lead changes in E.D.D. 0.9 -> 1.3,
                             //                ~1.9 filings a game, struck seats still win 28% (no doom loop). CHOSEN.
                             //   'books'    — kept, NOT chosen: nets to zero at the table (certified seats win their fair
                             //                share, 17.5 vs 17.7%; endgame unchanged). Dormant behind this dial.
                             //   'hand'     — kept, NOT chosen: repeats the top face's punishment (leader-at-arm 52%,
                             //                no endgame change). Dormant behind this dial.
                             //   'none'     — round 8 as shipped (the bribe only).
    ANDERS_DEBT_MULT: 2,     // 'books': each written-off point comes due this many times over when E.D.D. arms
    ANDERS_FEE: 6,           // 'books': the firm's fee for certifying the record ($, = GREEN_LEVY 'call the loan')
    ANDERS_ROLLS: 2,         // 'hand' / 'protocol': rolls the firm holds the body (= GOV_ROLLS)
    PRIV_MOM_MIN: 2,         // a floor (in steps) under the own-bodies momentum (round 6 sanity check: without it a
                             // ●○○ Mainland seat crawled to 5% — the L4 floor; with it every company keeps teeth AND a way on)
    PRIV_MOM: 'own',         // MOMENTUM teeth: 'own' — your momentum is the spread of YOUR bodies (●○○ = drift) · 'cap' (round 4)
    TOLL_FORCE: null,        // LAB ONLY: { victimIdx: tollerIdx } — a permanent toll
    SEIZE_FORCE: null,       // LAB ONLY: { victimIdx: seizerIdx } — a permanent seizure (the worst-case L4 probe)
    PRIV_MOVE: 'cap',        // THE MAP — how far a penalized seat sails:
                             //   'cap'  — the full three-body spread, but no farther than PRIV_MOVE_CAP[k]
                             //   'own'  — the spread of YOUR bodies only (1 body = MOVE_MIN: brutal, see doc)
                             //   false  — movement ignores privilege
    PRIV_MOVE_CAP: [0, 2, 3, 99],   // indexed by bodies held: 1 body -> <=2 steps, 2 -> <=3, 3 -> uncapped
    PRIV_BEND: true,         // the pip-flip belongs to whoever holds the middle body
    PRIV_FORCE: null,        // LAB ONLY: { seatIndex: k } pins a seat at k bodies (the cost-of-a-body probe)
  };

  // ---- three-body price shove (THE market function) --------------------------
  // sort the dice; shove = w0*a + w1*b + w2*c (weights on the SORTED dice).
  // Default weights [1,-2,1] => a - 2b + c (the three_body.py read). instability = |shove|.
  function shoveOf(dice, w) {
    const s = dice.slice().sort((x, y) => x - y);
    const W = w || [1, -2, 1];
    let v = 0; for (let i = 0; i < s.length; i++) v += (W[i] != null ? W[i] : 0) * s[i];
    return v;
  }
  // roll one body from a faces table (defaults to a d6 -> identical RNG draw)
  function rollFace(rng, faces) {
    const F = (faces && faces.length) ? faces : [1, 2, 3, 4, 5, 6];
    return F[Math.floor(rng.random() * F.length)];
  }

  class Speculator {
    constructor(id, name, color) {
      this.id = id; this.name = name; this.color = color || '#d6a93f';
      this.barrels = DIALS.BARRELS_START;   // production/holdings (value = barrels * price)
      this.pips = DIALS.PIPS_START;          // slingshot resource
      this.control = 0;                      // territory/HQ claims (score proxy)
      this.value = 0;                        // realized value banked
      this.exposure = 0;                     // how hurt you are at collapse (lower = cleaner exit)
      this.isHuman = false;
      this.policy = 'greedy';
      this.agent = null;                     // input seam (Charter E6); same API for human/bot
      this.faction = null;                   // faction code (CORE-014 asymmetry; null = symmetric)
      this.grudges = [];                     // ids of players who broke a deal with you (THE TABLE)
      this.at = null;                        // where you stand on THE MAP (place code)
      this.longWay = false;                  // you came the long way round past a shut gate
      this.consignedTo = null;               // CONSIGNED CARGO (model): the buyer you owe
    }
    holdings(price) { return this.value + this.barrels * price; }
  }

  // THE TABLE — bots negotiate through src/oil-deals.js (seed-stable; uses g.rng).
  // Falls back to 'pass' if the deal layer isn't loaded, so the engine never
  // silently accepts a deal it has no rules for.
  function dealPick(g, p, ctx) {
    if (ctx.dispute) {                                      // THE DISPUTE DECK: contest the claim?
      const c = ctx.options.filter(o => String(o).indexOf('CONTEST:') === 0);
      if (!c.length) return 'accept';
      if (p.policy === 'random') return g.rng.pick(ctx.options);
      const k = ctx.dispute.kind, worth = k === 'seize' || k === 'pirates' || k === 'requisition' || p.policy !== 'stable';
      return worth ? c[0] : 'accept';
    }
    const R = OilGame._dealsFX(); return (R && R.policy) ? R.policy(g, p, ctx) : 'pass'; }
  const DEAL_KINDS = { table: 1, dealoffer: 1 };

  // THE MAP — where a bot sails. Seed-stable (g.rng only). The read: get to an HQ
  // so you can actually sell; prefer a rival's yard (the incursion pays more);
  // and in a chaotic season the steady hand stays out of the deep water.
  // CONSIGNED CARGO (model): should this seat sell HERE, or carry it to the buyer?
  // Without this the seat sold wherever it stood and 70% of cargo was dumped — the contract
  // existed on paper and changed nobody's behaviour. Hold if the buyer is close enough to be
  // worth the wait; dump if it is far, because a cargo you can never land is worth what the
  // spot market gives you today.
  function shouldLandIt(g, p) {
    if (!g.consign) return true;                            // no contracts: sell as before
    const buyers = g.buyersFor(p);
    if (!buyers.length) return true;
    if (buyers.indexOf(p.at) >= 0) return true;             // you are there. land it.
    // DECISIONS-0928 `botOnshore` (bot policy): you only came to the ground because the buyer was far
    if (g.path && g.path.botOnshore && g.domesticAt(p.at)) return true;
    const MP = OilGame._mapFX();
    const d = g.nearestBuyer(p, p.at).dist;
    return !(d !== undefined && d <= (g.mapDials.LAND_WITHIN || 4));   // within reach soon -> carry it
  }
  function movePick(g, p, ctx) {
    const MP = OilGame._mapFX(), opts = ctx.options;
    if (!MP.BY || !opts.length) return p.at;
    if (p.policy === 'random' && !(g.heg2 && g.rng.random() < g.hegDials.RANDOM_FOCUS)) return g.rng.pick(opts);
    const risky = c => { const k = (MP.BY[c] || {}).kind; return k === 'cape' || k === 'arctic' || k === 'ocean'; };
    const score = c => {
      const pl = MP.BY[c]; if (!pl) return -99;
      // An HQ is still the best sale; ONSHORE ground is the tempting second — it pays a premium
      // and no strait can close on it. Scored just under an HQ so it is a real option rather than
      // a curiosity: at 0 the AI treated Genesee County as open ocean and the ground was never
      // worked in 300 games, which left the whole onshore mechanic dead on the board.
      let v = pl.kind === 'hq' ? 10 : pl.kind === 'onshore' ? 7 : 0;
      // CONSIGNED CARGO (model): the buyer outranks everything — and, crucially, so does GETTING
      // CLOSER TO IT. Scoring only the arrival was not enough: a turn moves you a few steps, so if
      // the buyer is six steps away it is never in the option list and the bonus never applies.
      // The seat just picked the best node in reach, exactly as before, and 73% of cargo was
      // dumped. Rewarding PROGRESS is what turns a move into a voyage — and a voyage is the only
      // thing a shut strait can actually lengthen.
      const P = g.path;
      const buyers = g.consign ? g.buyersFor(p) : [];
      // THE PATH: an empty hold has no buyer. (Plain consign keeps its original read.)
      if (buyers.length && !(P && P.v2 && p.barrels <= 0)) {
        if (buyers.indexOf(c) >= 0) {
          v += 30;
          // the TOLL makes WHO HOLDS the buyer matter: tend your own station, avoid paying a rival's
          if (P && P.toll) { const own = g.ownerOf(c); if (own === p.name) v += 4; else if (own) v -= 6; }
        } else {
          const onward = g.nearestBuyer(p, c).dist;
          if (onward !== undefined) v += Math.max(0, 14 - onward * 2);   // closer is better
        }
      }
      // DECISIONS-0928 (bot policy, not rules — MODEL ONLY):
      //  · supply 'lift': an empty hold heads home to lift, exactly as a full one heads for a buyer
      //  · botOnshore: with the buyer out of reach (> LAND_WITHIN), the ground's +ONSHORE_PCT today
      //    beats a voyage — scored just under a buyer (29 < 30), so a buyer in reach still wins
      if (P && P.supply === 'lift' && p.barrels <= 0) {
        const home = g.hqOf(p);
        if (c === home) v += 30;
        else { const dh = MP.reach(c, 99, g.mapState).dist[home]; if (dh !== undefined) v += Math.max(0, 14 - dh * 2); }
      }
      if (P && P.botOnshore && P.onshore && pl.kind === 'onshore' && p.barrels > 0) {
        const nb = g.nearestBuyer(p, p.at).dist;
        if (nb === undefined || nb > (g.mapDials.LAND_WITHIN || 4)) v += 22;
      }
      // a built megastructure is somewhere you can SELL once the path is on — score it like ground
      if (P && P.mega && pl.kind === 'built' && g.sellableAt(c)) v += 7;
      if (pl.kind === 'hq' && c !== g.hqOf(p)) v += 3;         // somebody else's yard pays more
      if (c === p.at) v -= 4;                                  // always move or suffer
      if (g.heg2) {                                            // HEGEMONY (bot policy): court the pawns, defend your own
        const H = g.hegDials, x = g.hegCollectable(p, c), rv = g.players.find(q => q !== p);
        if (x) v += H.BOT_PULL + 4 * x.w[rv.id] + (c === p.at && p.heg.at === c && p.heg.progress > 0 ? H.BOT_STAY : 0);
        if (rv && g.hegCourting(rv) && rv.heg.at === c) v += H.BOT_BLOCK;
      }
      // THE PRIVILEGE (bot policy, not a rule): a canal costs a body on the next roll, so a seat that
      // can choose weighs ground it can reach WITHOUT transiting a gate — the escape route
      if (g.privilege && g.privDials.PRIV_WATER && c !== p.at) {
        const route = MP.pathOf(MP.reach(p.at, 99, g.mapState), c) || [];
        if (route.slice(1).some(x => g.gateCosts(x, p))) v -= (g.privDials.WATER_AVOID || 0);
      }
      v -= g._trafficAt(c).blocked * 2;                          // don't sail into a squeeze
      if (g.levels === 'voyage' && !ctx.momentum && c !== p.at) v += g._lvBotPull(p, MP.pathOf(MP.reach(p.at, 99, g.mapState), c));
      if (g.era === 'CHAOTIC' && risky(c)) v -= (p.policy === 'stable' ? 8 : 3);
      return v;
    };
    if (ctx.momentum) {                                     // MOMENTUM: choose the fork, or camp
      const MD = g.momDials;
      const val = o => {
        if (o === 'CAMP') return score(p.at) + 4 - 1 - (MD.CAMP_BIAS || 0) * (p.campTurns || 0);
        const w = ctx.momentum[o]; if (!w) return -1e9;
        let v = score(w.at);
        if (w.under) v -= 4 + (w.left || 0);                  // still at sea: no sale this turn
        if (w.halted === 'inspect') v -= 4;
        if (w.landed === 'HAZARD') v -= (p.policy === 'stable' ? 3 : 1);
        if (w.landed === 'CURRENT') v += 1;
        if (w.landed === 'EVENT') v += 2;                     // the only draw at sea
        if (g.levels === 'voyage') v += g._lvBotPull(p, w.trail.filter(x => x.node).map(x => x.node).concat([w.at]));
        return v;
      };
      let best = opts[0], bv = -1e9;
      for (const o of opts) { const v = val(o); if (v > bv) { bv = v; best = o; } }
      return best;
    }
    let best = opts[0], bv = -1e9;
    for (const c of opts) { const v = score(c); if (v > bv) { bv = v; best = c; } }
    return best;
  }

  // RETAINER REWORK (knob, crisisDials.RETAINER_MODE != 'classic'): the automa's read of cover. A bot buys when it can
  // SEE trouble at home (heat, a chaotic season, a fire on the board) and has money to spare. Deterministic — no draw.
  function coverPick(g, p, ctx, temper) {
    const D = g.crisisDials, h = g.heat[g.hqOf(p)] || 0, chaos = g.era === 'CHAOTIC', fires = Object.keys(g.fires || {}).length > 0;
    if (ctx.options.indexOf('retainer') >= 0) {            // R1 THE POLICY
      const spare = p.value - D.POLICY_COST;
      if (temper === 'greedy' ? (spare >= 30 && (h >= 2 || chaos)) : (spare >= 10 && (h >= 1 || chaos || fires))) return 'retainer';
    }
    if (ctx.options.indexOf('cover') >= 0) {               // R2 THE RIDER (only ever instead of a sale the bot would make)
      const spare = p.value - D.RETAINER_COST, sell = temper === 'greedy' ? (p.barrels >= DIALS.CLAIM_COST && shouldLandIt(g, p)) : shouldLandIt(g, p);
      if (sell && (temper === 'greedy' ? (spare >= 20 && (h >= 2 || chaos)) : spare >= 0)) return 'cover';
    }
    return null;
  }

  // ---- default bot policies (the automa; humans plug the same seam) ----------
  const POLICIES = {
    random(g, p, ctx) { return g.rng.pick(ctx.options); },
    // greedy: push price toward your barrels' benefit, claim when cheap
    greedy(g, p, ctx) {
      if (DEAL_KINDS[ctx.kind]) return dealPick(g, p, ctx);
      if (ctx.kind === 'move') return movePick(g, p, ctx);
      if (ctx.kind === 'structure') return ctx.options[0];
      if (ctx.kind === 'action' && ctx.options.indexOf('iws') >= 0) return 'iws';
      if (ctx.kind === 'action' && g.crisisDials.RETAINER_MODE !== 'classic') { const c = coverPick(g, p, ctx, 'greedy'); if (c) return c; }
      else if (ctx.kind === 'action' && ctx.options.indexOf('retainer') >= 0 && g.rng.random() < 0.15) return 'retainer';
      if (ctx.kind === 'action' && ctx.options.indexOf('build') >= 0) return 'build';
      if (ctx.kind === 'slingshot') {
        // spend a pip to flip the shove if it currently hurts your holdings
        const helps = (g.lastShove >= 0) === (p.barrels > 0);
        return (!helps && p.pips > 0 && Math.abs(g.lastShove) >= 1) ? 'flip' : 'keep';
      }
      if (ctx.kind === 'action') return (p.barrels >= DIALS.CLAIM_COST && shouldLandIt(g, p)) ? 'claim' : 'hold';
      if (ctx.kind === 'edd') return ctx.options.includes('EAT') ? 'EAT' : ctx.options[0];
      return ctx.options[0];
    },
    // stabilizer: never flip, always act (the Haddad "steady them" read — symmetric for now)
    stable(g, p, ctx) {
      if (DEAL_KINDS[ctx.kind]) return dealPick(g, p, ctx);
      if (ctx.kind === 'move') return movePick(g, p, ctx);
      if (ctx.kind === 'structure') return ctx.options[ctx.options.length - 1];
      if (ctx.kind === 'action' && ctx.options.indexOf('iws') >= 0) return 'iws';
      // the steward is the one temperament that ever buys cover before the fire
      if (ctx.kind === 'action' && g.crisisDials.RETAINER_MODE !== 'classic') { const c = coverPick(g, p, ctx, 'stable'); if (c) return c; }
      else if (ctx.kind === 'action' && ctx.options.indexOf('retainer') >= 0 && g.rng.random() < 0.35) return 'retainer';
      if (ctx.kind === 'action' && ctx.options.indexOf('build') >= 0) return 'build';
      if (ctx.kind === 'slingshot') return 'keep';
      if (ctx.kind === 'action') return shouldLandIt(g, p) ? 'claim' : 'hold';
      if (ctx.kind === 'edd') return ctx.options.includes('DIVIDE') ? 'DIVIDE' : ctx.options[0];
      return ctx.options[0];
    },
  };

  class OilGame {
    constructor(opts = {}) {
      opts = opts || {};
      this.rng = makeRng(opts.seed || 1);
      this.expansion = opts.expansion !== false;   // Green Anders die present
      this.edition = EDITIONS[opts.edition] ? opts.edition : 'classic';
      const ed = EDITIONS[this.edition];
      this.rubberBand = ed.rubberBand;
      // dial precedence: base DIALS <- edition overrides <- explicit opts.dials
      this.dials = Object.assign({}, DIALS, ed.dials, opts.dials || {});
      const D = this.dials;
      const n = Math.max(2, Math.min(8, opts.n_players || 5));
      // THE SEAT CLOCK (round 8): the well, the last lap and the scarcity band scale with the seats
      this.clock = !!opts.clock;
      this.clockDials = Object.assign({}, CLOCK_DIALS, (opts.clock && typeof opts.clock === 'object') ? opts.clock : {});
      if (this.clock) {
        const C = this.clockDials, mine = k => !(opts.dials && k in opts.dials);
        if (mine('OIL_START')) D.OIL_START = Math.round(C.OIL_PER_SEAT * n);
        if (mine('EDD_OIL')) D.EDD_OIL = Math.round(C.EDD_OIL_PER_SEAT * n);
        if (mine('SCARCITY_BAND')) D.SCARCITY_BAND = Math.round(C.SCARCITY_PER_SEAT * n);
        if (mine('SCARCITY_DIV')) D.SCARCITY_DIV = C.SCARCITY_DIV_PER_SEAT * n;
        if (mine('EDD_PRICE')) D.EDD_PRICE = C.EDD_PRICE != null ? C.EDD_PRICE : Math.round(C.EDD_PRICE_BASE + C.EDD_PRICE_PER_SEAT * n);
      }
      const names = opts.names || Array.from({ length: n }, (_, i) => 'SPEC ' + (i + 1));
      this.players = names.slice(0, n).map((nm, i) => new Speculator(i, nm));
      if (opts.policies) this.players.forEach((p, i) => p.policy = opts.policies[i] || p.policy);

      this.price = D.PRICE_START;
      this.oil = D.OIL_START;
      this.era = 'STABLE';
      this.lastShove = 0; this.lastDice = [0, 0, 0];
      this.edd = false; this.eddLog = [];
      this.turn = 0; this.round = 0; this.idx = 0;
      this.pressure = 0;                     // THE RATCHET: player lean on next turn's price
      this.throughput = {};                  // place -> { playerName: barrels }, decayed each round
      this.controlOwner = {};                // place -> playerName | null (null = CONTESTED/none)
      this.done = false; this.winner = null; this.end_reason = null;
      this.log = []; this.events = [];
      this.maxTurns = opts.maxTurns || 400;   // safety only; oil depletion ends it far sooner
      this.cards = !!opts.cards;              // optional card layer (src/oil-cards.js)
      // MODEL: consigned cargo (see the CONSIGN_* dials). opts.path (docs/THE-PATH.md) is the
      // consign model grown into the game path; either flag turns contracts on. Both OFF by
      // default -> no new branch, no extra RNG, the frozen baseline stays byte-identical.
      this.consign = !!(opts.consign || opts.path);
      this.path = opts.path ? OilGame.pathRules(opts.path) : null;
      if (this.path && opts.west) this.path = Object.assign({}, this.path, { west: opts.west });   // WEST COAST (model): preview seam, e.g. gateway #west=rim
      this.market = [];                      // THE PATH: the face-up contracts (buyer place codes)
      this.structureOwner = {};              // THE PATH: STRUCT -> the seat that raised it
      this.pathStats = { landed: 0, dumped: 0, tolls: 0, tollPaid: 0, passages: 0, passagePaid: 0,
        contractPoints: 0, megaPoints: 0, megaLandings: 0, domestic: 0, voyageTurns: 0, detourTurns: 0, detourSteps: 0,
        bypass: 0 };
      if (this.cards) this._buildDecks();

      // ---- optional THE TABLE (negotiation layer; src/oil-deals.js) ----------
      // Off by default -> the engine takes NO new branch and draws NO extra RNG,
      // so every frozen sweep number stays byte-identical.
      this.deals = !!opts.deals;
      this.dealDials = Object.assign({}, (OilGame._dealsFX().DEAL_DIALS || {}), opts.dealDials || {});
      this.standing = [];        // live deals: {uid,type,a,b,ticks,paid,carried}
      this.dealFreeze = 0;       // turns during which no NEW deal may be offered
      this._dealUid = 0;
      this.dealStats = { offers: 0, formed: 0, declined: 0, ticks: 0, broken: 0, lapsed: 0, spared: 0, revenge: 0 };

      // ---- optional THE MAP (shipping world; src/oil-map.js) ----------------
      // Off by default -> no new branch, no extra RNG, baseline byte-identical.
      const MP = OilGame._mapFX();
      this.map = !!(opts.map && MP.PLACES);
      this.mapDials = Object.assign({}, MP.MAP_DIALS || {}, opts.mapDials || {});
      this.mapState = { closed: {}, disabled: {}, built: Object.assign({}, opts.built || {}) };
      // DECISIONS-0928 `geo`: an optional route exists only in this game (never in the baseline)
      if (this.path && this.path.geo === 'btc') this.mapState.opts = { BTC: true };
      // WEST COAST REACH (MODEL ONLY; docs/DECISIONS-1110.md): 'rim' | 'demand' | 'both' opens OIL_MAP.OPTIONAL_PLACES
      if (this.path && this.path.west) {
        const w = this.path.west; this.mapState.opts = Object.assign({}, this.mapState.opts || {});
        if (w === 'rim' || w === 'both') this.mapState.opts.W_RIM = true;
        if (w === 'demand' || w === 'both') this.mapState.opts.W_DEMAND = true;
        this._westCodes = (MP.OPTIONAL_PLACES || []).filter(q => this.mapState.opts[q.set]).map(q => q.code);
      }
      this.mapStats = { moves: 0, steps: 0, stayed: 0, perils: 0, barrelsLost: 0, longWay: 0,
        premiums: 0, incursions: 0, squeezed: 0, closures: 0, atSea: 0, structures: 0 };
      if (this.map) {
        // you start at your faction's HQ; symmetric games spread round the 8 HQs.
        // (Seats are placed BEFORE factions are assigned below, so q.faction is still null here and
        // everyone lands on HQS[i]. That is the frozen baseline. THE PATH's `home` rule reads the
        // roster directly, so a company really does start in its own yard.)
        const homeOf = (q, i) => q.faction || (this.path && this.path.home && Array.isArray(opts.factions) ? this._hqCode(opts.factions[i]) : null);
        this.players.forEach((q, i) => { const f = homeOf(q, i); q.at = (f && MP.BY[f]) ? f : MP.HQS[i % MP.HQS.length]; });
        // CONSIGNED CARGO (model): everybody starts holding a contract, or the first sale has
        // nowhere to be and the whole experiment starts a turn late.
        if (this.consign) {
          if (this.path && this.path.mode === 'market') this._fillMarket();
          else this.players.forEach(q => this._consign(q));
        }
      }

      // ---- optional MOMENTUM (docs/THE-MOMENTUM.md; src/oil-momentum.js) ------------
      // The ocean carries you: routes are subdivided into typed spaces, you MUST spend the roll,
      // and staying put is CAMPING (demurrage). Needs THE MAP. Off -> no branch, no RNG.
      const MOM = OilGame._momFX();
      this.momentum = !!(opts.momentum && this.map && MOM.walks);
      this.momDials = Object.assign({}, MOM.MOM_DIALS || {}, (opts.momentum && typeof opts.momentum === 'object') ? opts.momentum : {});
      this.momStats = { walks: 0, spaces: 0, stops: 0, putIns: 0, underway: 0, inspectClean: 0, inspectDirty: 0,
        inspectFines: 0, inspectArrests: 0, events: 0, currents: 0, storms: 0, calms: 0, closedAhead: 0,
        camps: 0, campRuns: 0, demurrage: 0, stuck: 0, forcedOnly: 0 };

      // ---- optional CRISIS (flashpoints / blowouts / IWS; src/oil-crisis.js) ----
      // Needs the map (heat lives on places). Off by default -> no new branch, no
      // extra RNG, and no new decision on the turn (docs/THE-FOLDS.md budget).
      const CR = OilGame._crisisFX();
      this.crisis = !!(opts.crisis && this.map && CR.CRISIS_DIALS);
      this.crisisDials = Object.assign({}, CR.CRISIS_DIALS || {}, opts.crisisDials || {});
      if (this.clock && !(opts.crisisDials && 'ANNIHILATION_AT' in opts.crisisDials)) this.crisisDials.ANNIHILATION_AT = this.clockDials.ANNIHILATION_AT;
      this.heat = {};            // place code -> stress
      this.fires = {};           // place code -> turns burning
      this.retainer = {};        // player id -> turns of IWS cover remaining
      this.crisisStats = { heated: 0, cooled: 0, gateShuts: 0, blowouts: 0, fireTurns: 0,
        oilBurnedByFire: 0, callOuts: 0, callOutSpend: 0, retainers: 0, retainerSaves: 0,
        stateAbsorb: 0, privateAbsorb: 0, annihilation: 0 };

      // ---- optional THE PRIVILEGE (docs/THE-PRIVILEGE.md) ----------------------
      // opts.privilege: true | { ...PRIV_DIALS overrides }. Off -> nothing below runs.
      this.privilege = !!opts.privilege;
      this.privDials = Object.assign({}, PRIV_DIALS, (opts.privilege && typeof opts.privilege === 'object') ? opts.privilege : {}, opts.privDials || {});
      if (this.clock && !((opts.privilege && typeof opts.privilege === 'object' && 'GOV_HEAT_AT' in opts.privilege) || (opts.privDials && 'GOV_HEAT_AT' in opts.privDials)))
        this.privDials.GOV_HEAT_AT = this.clockDials.GOV_HEAT_AT;
      this.privStats = { turns: { 1: 0, 2: 0, 3: 0 }, drops: 0, restores: 0, stewardRolls: 0,
        bendOwn: 0, bendSteward: 0, bendLost: 0, heldBodies: 0,
        seizeCard: 0, seizeSnare: 0, seizedRolls: 0, seizerBends: 0, seizeEnds: 0,
        snaresSet: 0, snaresSprung: 0, snaresRusted: 0,
        tollCard: 0, tollTribute: 0, tollScapegoat: 0, tollTurns: 0, tollCash: 0, tollBends: 0 };
      // THE DISPUTE DECK — ROUND 8: CUT from ★ THE FULL EXPANSION (designer: "cut the dispute deck").
      // The crunch (200 paired games): without it the faction spread is TIGHTER (round 6: 22->16 vs 27->15;
      // round 7: 23->18 vs 25->17) with fewer decisions (3.36 vs 3.38 a turn) — rules weight that bought
      // nothing. Green Anders keeps its package role on the dirty-inspection bribe. Off, the
      // 7 claim cards stay in their normal decks with their normal effects, and claims just land.
      // opts.disputes (default off) still turns the dormant code back on.
      this.disputes = !!(opts.disputes && this.privilege);
      this.disputeStats = { claims: 0, contested: 0, won: 0, lost: 0, ties: 0, andersDefender: 0, played: 0, drawn: 0, bribes: 0, bribeTries: 0 };
      this.seized = {};          // victim id -> { by: seat, rolls, cause }
      this.snares = {};          // victim id -> { by: seat, life }
      this.tolls = {};           // victim id -> { by: seat, turns, cause } (card / scapegoat)
      this._turnSeizer = null; this._turnToller = null; this._tolledIdx = -1;
      if (this.disputes) this._dealDisputes();
      if (this.momentum && this.privilege && this.privDials.PIRATES) this.momDials.PIRATES = true;
      this.diceOwner = null;     // per body: the seat that rolled it this turn (privilege on)
      this._held = null;         // 'held' mode: the three bodies as they lie on the table
      this._heldAge = [0, 0, 0];

      // ---- optional FACTION ASYMMETRY (CORE-014; src/oil-factions.js) --------
      // opts.factions = [code,...] aligned to seats; opts.asym defaults ON when
      // present. Off (no factions) -> path is byte-identical to the symmetric
      // baseline, so the frozen sweep is untouched.
      this.factions = opts.factions || null;
      this.asym = this.factions ? (opts.asym !== false) : false;
      if (this.factions) {
        const FX = OilGame._factionFX();
        this.players.forEach((p, i) => { p.faction = this.factions[i] || null; });
        if (this.asym) this.players.forEach(p => { const f = p.faction && FX[p.faction]; if (f && f.setup) f.setup(this, p); });
        if (this.dials.PIP_CAP === 'own') this.players.forEach(p => { p.pipsStart = p.pips; });   // carry-over #12 knob
      }
      // ---- optional HEGEMONY (round 11): 2 seats, all 8 companies on the board ----
      // round 12 (designer: "have the ducks be there for all modes too… anything under 8 players"): the ducks
      // sit on the board at EVERY table under 8; only the 2-player game (heg2) gets the matrix, the collection
      // and the oil count. At 3–7 the ducks matter only when THE RICO PROTOCOL reaches them.
      this.hegemony = !!(opts.hegemony && this.players.length < 8 && this.map);
      this.heg2 = this.hegemony && this.players.length === 2;
      this.hegDials = Object.assign({}, HEG_DIALS, (opts.hegemony && typeof opts.hegemony === 'object') ? opts.hegemony : {});
      if (this.hegemony) this._hegSetup(opts);
      // ---- optional OIL LEVELS (O2 prototype; LEVEL_DIALS) — off: nothing below ever runs ----
      this.levels = (opts.levels && this.map) ? (typeof opts.levels === 'string' ? opts.levels : (opts.levels.mode || 'two')) : null;
      if (this.levels) {
        this.lvDials = Object.assign({}, LEVEL_DIALS, typeof opts.levels === 'object' ? opts.levels : {});
        this.lvStats = { promoted: 0, falls: 0, tows: 0, revokedDirty: 0, firstLicenceTurn: [], salesAt: { 1: 0, 2: 0, 3: 0 },
          voyagesAt: { 1: 0, 2: 0, 3: 0 }, knocked: 0, bonus: 0, fallBy: {} };
        this.players.forEach(q => { q.level = 1; q.voyLevel = 1; q.lvSales = 0; q._lvHome = q.at; q._lvPend = 0; });
      }
    }

    // ---- OIL LEVELS ---------------------------------------------------------------
    _lvTier(code) { const pl = (OilGame._mapFX().BY || {})[code]; return pl ? (this.lvDials.TIER[pl.kind] || 1) : 1; }
    _lvTierOf(nodes) { let t = 1; for (const c of nodes || []) t = Math.max(t, this._lvTier(c)); return t; }
    // the map as THIS seat may sail it: a WILDCAT seat under 'two' cannot enter LANES water
    // (the place it stands on is never shut on it, so a seat can always leave)
    _lvState(p) {
      if (this.levels !== 'two' || !p || p.level >= 2) return this.mapState;
      const MP = OilGame._mapFX(), forbid = {};
      for (const c of MP.CODES || []) if (this._lvTier(c) >= 2 && c !== p.at) forbid[c] = 1;
      return Object.assign({}, this.mapState, { forbid });
    }
    // bot temperament (not a rule): with cargo aboard, a route that climbs is worth a little more
    _lvBotPull(p, nodes) {
      if (p.barrels <= 0) return 0;
      return Math.max(0, this._lvTierOf(nodes) - (p.voyLevel || 1)) * this.lvDials.VOY_BOT;
    }
    _lvGap(p) { const clean = Math.min.apply(null, this.players.map(q => q.exposure)); return p.exposure - clean; }
    _lvUpkeep(p) {      // start of your turn: earn (or lose) the licence
      if (this.levels !== 'two') return;
      const L = this.lvDials, S = this.lvStats;
      if (p.level === 1 && p.lvSales >= L.LICENCE_SALES && this._lvGap(p) < L.LICENCE_GAP && p.value >= (L.LICENCE_FEE || 0)) {
        if (L.LICENCE_FEE) { p.value -= L.LICENCE_FEE; S.fees = (S.fees || 0) + L.LICENCE_FEE; }
        if (L.LICENCE_BARREL) { const n = Math.min(L.LICENCE_BARREL, this.oil); p.barrels += n; this.oil -= n; S.licenceBarrels = (S.licenceBarrels || 0) + n; }
        p.level = 2; S.promoted++; if (!p._lvEver) { p._lvEver = true; S.firstLicenceTurn.push(p.ownTurns || 0); }
        this.emit('level_up', { player: p.name, level: 2, name: 'THE LANES' });
      } else if (p.level === 2 && L.LICENCE_KEEP && this._lvGap(p) >= L.LICENCE_KEEP) {
        S.revokedDirty++; this._lvFall(p, 'record');
      }
    }
    _lvFall(p, cause) {
      const S = this.lvStats; S.falls++; S.fallBy[cause] = (S.fallBy[cause] || 0) + 1;
      if (this.levels === 'two') {
        p.level = 1; p.lvSales = 0;
        let towed = false;
        if (this.lvDials.TOW_HOME && (p.under || this._lvTier(p.at) >= 2) && p._lvHome) { p.at = p._lvHome; p.under = null; p.campTurns = 0; towed = true; S.tows++; }
        this.emit('level_fall', { player: p.name, level: 1, cause, towed });
      } else {
        const was = p.voyLevel; p.voyLevel = Math.max(1, p.voyLevel - 1); S.knocked++;
        this.emit('level_fall', { player: p.name, level: p.voyLevel, from: was, cause });
      }
    }
    // pending knocks are applied after the move is read (a peril mid-voyage knocks the level the
    // voyage reached, not the one it left with); 'two' revokes only at the end of the turn
    _lvApply(final) {
      for (const q of this.players) {
        if (!q._lvPend) continue;
        if (this.levels === 'two' && !final) continue;
        const n = q._lvPend; q._lvPend = 0;
        if (this.levels === 'two') { if (q.level >= 2) this._lvFall(q, q._lvCause || 'enforcement'); }
        else for (let i = 0; i < n; i++) if (q.voyLevel > 1) this._lvFall(q, q._lvCause || 'incident');
      }
    }
    _lvEvent(t, d) {
      const L = this.lvDials, who = n => this.players.find(q => q.name === n);
      if (t === 'move') {
        const p = who(d.player); if (!p || this.levels !== 'voyage') return;
        const lv = this._lvTierOf(d.path);
        if (lv > p.voyLevel) { p.voyLevel = lv; this.emit('level_up', { player: p.name, level: lv, name: lv >= 3 ? 'THE CARTEL' : 'THE LANES', voyage: true }); }
      } else if (t === 'deliver') {
        const p = who(d.player); if (!p) return;
        if (this.levels === 'two') { this.lvStats.salesAt[p.level]++; if (p.level === 1) p.lvSales++; }
        else { this.lvStats.salesAt[p.voyLevel]++; p.voyLevel = 1; }
      } else {
        const falls = this.levels === 'two' ? L.TWO_FALLS : L.VOY_FALLS;
        if (falls.indexOf(t) < 0 || (t === 'inspection' && d.clean)) return;
        const p = who(t === 'pirates' || t === 'seize' || t === 'requisition' ? d.on : d.player); if (!p) return;
        p._lvPend = (p._lvPend || 0) + 1; p._lvCause = t;
      }
    }

    // ---- HEGEMONY ------------------------------------------------------------
    _hegSetup(opts) {
      const MP = OilGame._mapFX(), H = this.hegDials, FX = OilGame._factionFX() || {}, D = this.dials;
      const placeOf = c => (MP.FACTION_HQ || {})[c] || c;
      const seated = this.players.map(p => p.faction ? placeOf(p.faction) : p.at).filter(Boolean);
      const all = Object.keys(FX).length ? Object.keys(FX) : (MP.HQS || []);
      let codes = all.filter(c => seated.indexOf(placeOf(c)) < 0);
      // the 2-player matrix is dealt (a shuffle); at 3–7 the ducks just sit there — no draw, so the game's
      // own random stream is untouched until THE RICO PROTOCOL reaches one
      if (this.heg2) codes = this.rng.shuffle(codes).slice(0, 6);
      let W = !this.heg2 ? codes.map(() => this.players.map(() => 0))
        : H.MATRIX === 'simple' ? [[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 1]]
        : [[2, 1], [2, 1], [1, 2], [1, 2], [1, 1], [1, 1]];
      // "roll for your ally influence": each player throws a body per duck (cross matrix only)
      if (this.heg2 && H.MATRIX !== 'simple' && H.STAKES === 'rolled') W = codes.map(() => this.players.map(() => (this.rng.d6() >= 4 ? 2 : 1)));
      // 'near' / 'far' — a printed layout read off the map: the seat whose HQ is CLOSER (sailing cost) to a duck holds
      // ◇2 in it and the other ◇1 ('far' flips it); a tie is ◇1 each. No dice.
      if (this.heg2 && H.MATRIX !== 'simple' && (H.STAKES === 'near' || H.STAKES === 'far')) {
        const d = this.players.map(p => (MP.reach(placeOf(p.faction || p.at), 999, {}) || {}).dist || {});
        W = codes.map(c => { const a = d[0][placeOf(c)], b = d[1][placeOf(c)];
          if (a === b) return [1, 1]; const near = a < b ? [2, 1] : [1, 2]; return H.STAKES === 'near' ? near : near.slice().reverse(); });
      }
      // 'printed' — THE BACKYARD: each company's placard prints how many ducks it holds ◇2 in (BACKYARD[code]); they are
      // its NEAREST ducks by sailing cost (ties: the duck's code). Every other duck is ◇1. No dice; the same every game.
      if (this.heg2 && H.MATRIX !== 'simple' && H.STAKES === 'printed') {
        W = codes.map(() => this.players.map(() => 1));
        this.players.forEach((p, k) => {
          const d = (MP.reach(placeOf(p.faction || p.at), 999, {}) || {}).dist || {}, n = (H.BACKYARD || {})[p.faction] != null ? H.BACKYARD[p.faction] : H.BACKYARD_DEFAULT;
          codes.map((c, i) => [d[placeOf(c)] != null ? d[placeOf(c)] : 99, c, i]).sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1)).slice(0, n).forEach(([, , i]) => { W[i][k] = 2; });
        });
      }
      // an allied duck leans to its ally: +1 (never between the two franchises)
      if (this.heg2 && H.AFFINITY && H.MATRIX !== 'simple') W = W.map((row, i) => row.map((w, k) => w + (this.allied(codes[i], this.players[k].faction) ? 1 : 0)));
      this.pawns = codes.map((c, i) => ({ code: c, hq: placeOf(c), w: W[i].map(x => x * H.STAKE), by: null, turn: null }));
      this.players.forEach(p => { p.heg = { at: null, progress: 0, collected: 0, gained: 0, hurt: 0 }; });
      this.hegStats = { collections: 0, byLeader: 0, byTrailer: 0, blocked: 0, snared: 0, started: 0, broken: 0 };
      this.ricoStats = { fired: 0, why: {}, partners: 0, ducks: 0, yards: 0, hitLeader: 0, splashedWon: 0, brokeBefore: 0 };
      // round 12 (designer: "yes count all for oil"): in the 2-player game every company counts toward the well.
      // OIL_PER_DUCK per duck (default 5: 30 + 30 = 60 oil, ~13 rounds; 15 = all eight at the seat rate, 120 oil).
      // The scarcity band and its divisor follow the same well, so the price curve keeps its shape.
      if (this.heg2 && H.OIL_PER_DUCK) {
        const mine = k => !(opts.dials && k in opts.dials), extra = codes.length * H.OIL_PER_DUCK;
        if (mine('OIL_START')) D.OIL_START += extra;
        if (this.clock) { const W2 = D.OIL_START / this.clockDials.OIL_PER_SEAT;
          // round-12 bisect (1,200 paired games each): E.D.D. must arm at the WELL's last lap (14 at 60 oil), not the
          // seats' (7) — at 7 the last lap shrank 3.3 -> 2.3 rounds and the leader at arm won +4 points; and the
          // scarcity band must stay on the SEATS (15 / div 1) — following the well (30 / 2) cost +5 points
          if (mine('EDD_OIL') && H.EDD_BY_WELL) D.EDD_OIL = Math.round(this.clockDials.EDD_OIL_PER_SEAT * W2);
          if (mine('SCARCITY_BAND') && H.SCARCITY_BY_WELL) D.SCARCITY_BAND = Math.round(this.clockDials.SCARCITY_PER_SEAT * W2);
          if (mine('SCARCITY_DIV') && H.SCARCITY_BY_WELL) D.SCARCITY_DIV = this.clockDials.SCARCITY_DIV_PER_SEAT * W2;
          if (mine('EDD_PRICE') && H.SPIKE_BY_WELL && this.clockDials.EDD_PRICE == null) D.EDD_PRICE = Math.round(this.clockDials.EDD_PRICE_BASE + this.clockDials.EDD_PRICE_PER_SEAT * W2); }
        this.oil = D.OIL_START;
      }
      if (this.heg2 && H.ANNIHILATION_AT != null && this.crisis) this.crisisDials.ANNIHILATION_AT = H.ANNIHILATION_AT;
      this.emit('hegemony', { pawns: this.pawns.map(x => ({ code: x.code, hq: x.hq, w: x.w.slice() })), matrix: this.heg2 ? H.MATRIX : 'none', oil: this.oil });
    }
    // THE RICO PROTOCOL (round 12): "ducks on a pond, we all go down" — one level, never a chain (L4)
    _rico(striker, target, outcome, filed) {
      const H = this.hegDials, R = this.ricoStats;
      const bad = H.RICO_HEAT && this.crisis && this.privilege && this.totalHeat() >= (H.RICO_HEAT_AT != null ? H.RICO_HEAT_AT : this.privDials.GOV_HEAT_AT);
      const firm = H.RICO_FIRM && filed, card = this._ricoCard;
      if (!(bad || firm || card)) return;
      this._ricoCard = null;
      const why = card ? 'card: ' + card : firm ? 'the firm filed it' : 'wartime heat';
      R.fired++; R.why[why.split(':')[0]] = (R.why[why.split(':')[0]] || 0) + 1;
      if (this._verdictLeader() === target) R.hitLeader++;
      const hit = [];
      // the struck seat's partners (THE TABLE) and its allies at the table (the franchises' standing affinities)
      const near = (this.deals ? this.partnersOf(target) : []).concat(this.players.filter(q => q !== target && this.allied(q.faction, target.faction)));
      [...new Set(near)].filter(q => q !== striker).forEach(q => {
        q.control = Math.max(0, q.control - H.RICO_CONTROL); q.exposure += H.RICO_EXPOSURE; q._ricoHit = (q._ricoHit || 0) + 1;
        R.partners++; hit.push(q.name);
      });
      // the struck seat's duck
      let duck = null;
      if (this.heg2) {
        const st = this.pawns.filter(x => x.by === null).sort((a, b) => b.w[target.id] - a.w[target.id])[0];
        if (st) { st.by = 'RICO'; st.turn = this.turn; duck = st.code; R.ducks++;
          this.players.forEach(q => { if (st.w[q.id] > 0) { q.heg.hurt += st.w[q.id]; q._ricoHit = (q._ricoHit || 0) + 1; } }); }
      } else if (H.RICO_DUCKS === 'yard') {
        const yards = this.pawns.filter(x => this.controlOwner[x.hq] === target.name);
        const st = yards[0];
        if (st) { const t = this.throughput[st.hq] || {}; delete t[target.name]; this.controlOwner[st.hq] = this.controlOf(st.hq); duck = st.code; R.yards++; }
      }
      this.emit('rico', { player: striker.name, on: target.name, outcome, why, hit, duck });
    }
    // the franchises' standing allies (HEG_DIALS.AFFINITIES; symmetric; PETRO_SUR <-> HADDAD never)
    allied(a, b) {
      const A = this.hegDials && this.hegDials.AFFINITY && this.hegDials.AFFINITIES; if (!A || !a || !b || a === b) return false;
      if ((a === 'PETRO_SUR' && b === 'HADDAD') || (a === 'HADDAD' && b === 'PETRO_SUR')) return false;   // "but not each other"
      return (A[a] || []).indexOf(b) >= 0 || (A[b] || []).indexOf(a) >= 0;
    }
    // a seat's stake in the board: its weight in every pawn still standing, plus every pawn IT collected
    _hegStake(p) { return this.heg2 ? this.pawns.reduce((a, x) => a + ((x.by === null || x.by === p) ? x.w[p.id] : 0), 0) : 0; }
    // the verdict's control: what you hold, plus your stake in the matrix (HEGEMONY only)
    verdictControl(p) { return p.control + (this.heg2 ? this._hegStake(p) : 0); }
    pawnAt(code) { return this.heg2 ? this.pawns.find(x => x.by === null && x.hq === code) || null : null; }
    // may p collect the pawn standing in this yard? (simple: only a pawn that backs the rival)
    hegCollectable(p, code) {
      const x = this.pawnAt(code); if (!x) return null;
      const rv = this.players.find(q => q !== p);
      return x.w[rv.id] > 0 ? x : null;
    }
    // read at the END of the seat's turn — never asked
    _hegTick(p) {
      const H = this.hegDials, S = this.hegStats, rv = this.players.find(q => q !== p), h = p.heg;
      const x = (!p.under && p.at) ? this.hegCollectable(p, p.at) : null;
      const clean = H.COURT === 'roll' || (this.privilege ? this.privilegeBase(p) >= H.COLLECT_PRIV : true);
      const blocked = x && rv && !rv.under && rv.at === p.at;
      const snared = x && H.SNARE_STOPS && this.snares && this.snares[p.id];
      if (!x || !clean || blocked || snared) {
        if (h.progress > 0) { S.broken++; if (blocked) S.blocked++; if (snared) S.snared++; this.emit('heg_broken', { player: p.name, at: h.at, why: blocked ? 'blocked' : snared ? 'snared' : !clean ? 'on the record' : 'sailed' }); }
        h.progress = 0; h.at = null; return;
      }
      if (h.at === p.at) h.progress++; else { h.at = p.at; h.progress = 1; S.started++; this.emit('heg_courting', { player: p.name, pawn: x.code, at: p.at, need: H.COLLECT_TURNS }); }
      const lead = this._verdictLeader();
      const need = (this.edd && H.EDD_TURNS != null ? H.EDD_TURNS : H.COLLECT_TURNS) + (lead === p ? H.LEADER_EXTRA : 0);
      let won = h.progress >= need;
      if (H.COURT === 'roll') {   // the influence throw: your own bodies vs theirs + their ◇ in the duck (house throws nothing)
        const kp = this.privilege ? this.privilegeBase(p) : 3, kr = this.privilege ? this.privilegeBase(rv) : 3;
        const mine = Math.max(...Array.from({ length: kp }, () => this.rng.d6())), theirs = Math.max(...Array.from({ length: kr }, () => this.rng.d6())) + x.w[rv.id];
        won = mine > theirs; S.throws = (S.throws || 0) + 1;
        this.emit('heg_throw', { player: p.name, pawn: x.code, mine, theirs, won });
      }
      if (won) {
        x.by = p; x.turn = this.turn; p.control += H.COLLECT_CONTROL; p.exposure += H.COLLECT_EXPOSURE;
        h.collected++; h.gained += H.COLLECT_CONTROL; rv.heg.hurt += x.w[rv.id];
        S.collections++; if (lead === p) S.byLeader++; else S.byTrailer++;
        this.emit('heg_collect', { player: p.name, pawn: x.code, at: x.hq, hurt: x.w[rv.id], on: rv.name, banked: x.w[p.id] });
        h.progress = 0; h.at = null;
      }
    }
    // is this seat part-way through a collection? (the bots' defence reads this)
    hegCourting(q) { return !!(this.heg2 && q && q.heg && q.heg.progress > 0); }

    // a seat's home yard as a PLACE code. Baseline: the raw faction code (so MC/NIK never match
    // their HQ — frozen). THE PATH `home` rule: MC -> MILECASTLE, NIK -> NIKOYL (MP.FACTION_HQ).
    _hqCode(f) {
      if (!f || !(this.path && this.path.home)) return f || null;
      return (OilGame._mapFX().FACTION_HQ || {})[f] || f;
    }
    hqOf(p) { return p ? this._hqCode(p.faction) : null; }
    // the pip ceiling a card tops you up to (carry-over #12; PIP_CAP 'start' = frozen)
    pipCap(p) { return this.dials.PIP_CAP === 'own' ? Math.max(this.dials.PIPS_START, (p && p.pipsStart) || 0) : this.dials.PIPS_START; }
    seatAtHQ(code, except) { return this.players.find(q => q !== except && this.hqOf(q) === code) || null; }

    // the momentum registry (src/oil-momentum.js); {} when the layer isn't loaded
    static _momFX() { return (typeof global !== 'undefined' && global.OIL_MOMENTUM) || OilGame.MOM_FX || {}; }

    // the crisis registry (src/oil-crisis.js); {} when the layer isn't loaded
    static _crisisFX() { return (typeof global !== 'undefined' && global.OIL_CRISIS) || OilGame.CRISIS_FX || {}; }

    // the map registry (src/oil-map.js); {} when the layer isn't loaded
    static _mapFX() { return (typeof global !== 'undefined' && global.OIL_MAP) || OilGame.MAP_FX || {}; }

    // the deal-layer registry (src/oil-deals.js); {} when the layer isn't loaded
    static _dealsFX() {
      return (typeof global !== 'undefined' && global.OIL_DEALS_FX) || OilGame.DEALS_FX || {};
    }

    static _factionFX() {
      const reg = OilGame.FACTION_FX || (typeof global !== 'undefined' && global.OIL_FACTIONS_FX) || null;
      return (reg && reg.FACTIONS) || reg || {};
    }
    // a faction player's once-per-turn power (law-safe: never adds oil)
    _factionPassive(p) {
      if (!this.asym || !p.faction) return;
      const f = OilGame._factionFX()[p.faction];
      if (f && f.passive) { f.passive(this, p); this.emit('faction', { player: p.name, code: p.faction, power: f.power }); }
    }

    // ---- THE PRIVILEGE — penalties -> how many of the three bodies you roll --------
    // Pure read of state that already exists (exposure); adds no decision.
    privilegeOf(p) {
      if (!this.privilege || !p) return 3;
      const D = this.privDials;
      // LAB ONLY: pin a seat's privilege (seat index -> 1..3) to measure what a body is worth
      if (D.PRIV_FORCE && D.PRIV_FORCE[p.id] != null) return this._privCircumstance(p, Math.max(1, Math.min(3, D.PRIV_FORCE[p.id] | 0)));
      let lost = 0;
      if (D.PRIV_MEASURE === 'abs') {
        lost = (D.PRIV_ABS || []).filter(t => p.exposure >= t).length;
      } else if (D.PRIV_MEASURE === 'recent') {
        const taken = p.exposure - (p._privMark == null ? 0 : p._privMark);
        lost = (D.PRIV_RECENT || []).filter(t => taken >= t).length;
      } else {
        const clean = Math.min.apply(null, this.players.map(q => q.exposure));
        lost = Math.floor((p.exposure - clean) / Math.max(1, D.PRIV_STEP));
      }
      return this._privCircumstance(p, Math.max(Math.max(1, D.PRIV_FLOOR | 0), Math.min(3, 3 - lost)));
    }
    // exposure privilege (what you EARNED); privilegeOf also takes off the sea and the state
    privilegeBase(p) {
      const save = { t: p._transit, r: p._requisition }; p._transit = null; p._requisition = null;
      const k = this.privilegeOf(p); p._transit = save.t; p._requisition = save.r; return k;
    }
    _privCircumstance(p, k) {
      const D = this.privDials;
      let extra = 0;
      if (D.PRIV_WATER && p._transit) extra++;
      if (p._requisition) extra++;
      extra = Math.min(extra, D.PRIV_EXTRA_MAX == null ? 1 : D.PRIV_EXTRA_MAX);
      return Math.max(Math.max(1, D.PRIV_FLOOR | 0), k - extra);
    }
    // the WARDEN of a gate: the seat holding the yard beside it (a held place first, else the
    // company whose home yard it is). Suez / Bab el-Mandeb border no yard: no warden.
    // does this gate cost seat p a body? every gate costs every ship — except, under 'dues' only,
    // the gate's own WARDEN (round 7 cut the warden with the dues: 'body' has no warden at all)
    gateCosts(gate, p) {
      const MP = OilGame._mapFX();
      if ((MP.BY[gate] || {}).kind !== 'gate') return false;
      return !(this.privDials.PRIV_WATER === 'dues' && this.gateWarden(gate) === p);
    }
    gateWarden(gate, except) {
      const MP = OilGame._mapFX();
      const yards = (MP.ADJ[gate] || []).map(r => r.to).filter(c => (MP.BY[c] || {}).kind === 'hq').sort();
      for (const c of yards) {
        const own = this.controlOwner[c]; const q = own && this.players.find(z => z.name === own);
        if (q && q !== except) return q;
      }
      for (const c of yards) { const q = this.seatAtHQ(c, except); if (q) return q; }
      return null;
    }
    alignmentOf(p) { const CR = OilGame._crisisFX(); return (CR.alignmentOf && p.faction && CR.alignmentOf(p.faction)) || 'private'; }
    // the STEWARD rolls what the penalized cannot: the cleanest rival (tie -> next in seat order)
    stewardFor(p) {
      const n = this.players.length; let best = null;
      for (let k = 1; k < n; k++) {
        const q = this.players[(p.id + k) % n];
        if (!best || q.exposure < best.exposure) best = q;
      }
      return best;
    }
    // which seat rolled the MIDDLE body (ties go to the active seat: it is your turn)
    _medianOwner(dice, p) {
      const order = dice.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      const mid = order[1][0];
      const idxs = dice.map((v, i) => i).filter(i => dice[i] === mid);
      const mine = idxs.find(i => this.diceOwner[i] === p && i !== this._tolledIdx);
      const i = mine !== undefined ? mine : order[1][1];
      return { idx: i, seat: this.diceOwner[i] };
    }

    emit(t, d) { this.events.push(Object.assign({ type: t, turn: this.turn }, d)); if (this.levels) this._lvEvent(t, d); }
    _log(s) { this.log.push(s); }

    ask(p, kind, options, extra) {
      const ctx = Object.assign({ kind, options }, extra || {});
      if (p.agent && p.agent.decide) return p.agent.decide(this, p, ctx);   // human seat
      return (POLICIES[p.policy] || POLICIES.greedy)(this, p, ctx);
    }

    // ---- card-effect helpers (used by src/oil-cards.js; never ADD oil) --------
    bumpPrice(n) { this.price = Math.max(this.dials.PRICE_MIN, Math.min(this.dials.PRICE_MAX, this.price + n)); }
    burnOil(n) { this.oil = Math.max(0, this.oil - Math.max(0, n)); }
    forceEra(e) { this.era = e; }
    richestOpp(p) { const o = this.players.filter(q => q !== p); return o.length ? o.reduce((a, b) => a.holdings(this.price) >= b.holdings(this.price) ? a : b) : null; }
    leaderOpp(p) { const o = this.players.filter(q => q !== p); return o.length ? o.reduce((a, b) => a.control >= b.control ? a : b) : null; }

    // ---- card deck system (optional; opts.cards) ------------------------------
    _buildDecks() {
      const FX = OilGame.CARD_FX || (typeof global !== 'undefined' && global.OIL_CARD_FX) || {};
      const ALL = (typeof global !== 'undefined' && global.OIL && global.OIL.CARDS) || [];
      this.decks = {}; this.discards = {};
      for (const dk of ['DEEDS', 'FREEDOM-MARKET', 'COMPETITION']) {
        this.decks[dk] = this.rng.shuffle(ALL.filter(c => c.deck === dk && FX[c.name]).map(c => c.name));
        this.discards[dk] = [];
      }
      this.players.forEach(p => { p.hand = []; });
    }
    drawCard(dk) {
      if (!this.decks[dk] || !this.decks[dk].length) {
        if (this.discards[dk] && this.discards[dk].length) { this.decks[dk] = this.rng.shuffle(this.discards[dk]); this.discards[dk] = []; }
        else return null;
      }
      return this.decks[dk].pop();
    }
    playCard(name, p) {
      const FX = OilGame.CARD_FX || (typeof global !== 'undefined' && global.OIL_CARD_FX) || {};
      const e = FX[name]; if (!e || !e.fx) return;
      e.fx(this, p);
      // THE RICO PROTOCOL (round 12): "or a card wills it" — a RICO card played while E.D.D. is armed arms the next strike
      if (this.hegemony && this.hegDials.RICO && this.edd && (this.hegDials.RICO_CARDS || []).indexOf(name) >= 0) { this._ricoCard = name; this.emit('rico_armed', { player: p.name, card: name }); }
      // war-and-government cards land WHERE THE SEAT IS STANDING (src/oil-crisis.js
      // CARD_HEAT); the quiet-imposing ones cool it. The cards are the designer's —
      // crisis only gives them somewhere to land.
      if (this.crisis && p.at) {
        const CH = (OilGame._crisisFX().CARD_HEAT || {})[name];
        if (CH) this.addHeat(p.at, CH > 0 ? Math.min(CH, this.crisisDials.HEAT_CARD) : CH, name);
      }
      if (this.disputes && OilGame.DISPUTE_CARDS.indexOf(name) >= 0) this.disputeDeck.push(name);   // back under the dispute deck
      else this.discards[e.deck] && this.discards[e.deck].push(name);
      this.emit('card', { player: p.name, card: name, deck: e.deck });
      // GOVERNMENT: in wartime a war-or-government card (src/oil-crisis.js CARD_HEAT — the designer's
      // own cards) is the state acting, and the state requisitions. Engine-side: the card's bundle is untouched.
      if (this.privilege && this.privDials.GOV_CARDS && this.wartime() && (OilGame._crisisFX().CARD_HEAT || {})[name]) this.requisition(name);
    }




    // ========================================================================
    // CRISIS — flashpoints, blowouts, IWS (optional; opts.crisis, needs the map).
    // Shapes and dials in src/oil-crisis.js; the RULES are here. Adds NO phase and
    // NO decision: heat accrues in upkeep off events that already happen, a blowout
    // is a consequence rather than a choice, and IWS is a third option on the
    // deliver step that already exists. See docs/CRISIS-AND-IWS.md.
    // ========================================================================

    // Heat lands on a PLACE. When it lands on somebody's HQ, the world acts on the
    // company — and the state and the private firm shed the same heat in different
    // currencies. The state pays in legitimacy; the board pays cash and books it
    // as a cost of doing business.
    addHeat(place, n, cause) {
      if (!this.crisis || !place || !n) return 0;
      const CR = OilGame._crisisFX(), D = this.crisisDials, MP = OilGame._mapFX();
      const pl = MP.BY[place]; if (!pl) return 0;
      let amount = n;
      if (amount >= D.ABSORB_MIN && pl.kind === 'hq') {
        const align = CR.alignmentOf ? CR.alignmentOf(place) : null;
        const seat = this.seatAtHQ(place);
        if (seat && align === 'state') {
          amount -= D.STATE_ABSORB; seat.exposure += D.STATE_EXPOSURE;
          this.crisisStats.stateAbsorb++;
          this.emit('absorb', { how: 'state', at: place, player: seat.name });
        } else if (seat && align === 'private' && seat.value >= D.PRIVATE_FEE) {
          amount -= D.PRIVATE_ABSORB; seat.value -= D.PRIVATE_FEE;
          this.crisisStats.privateAbsorb++;
          this.emit('absorb', { how: 'private', at: place, player: seat.name, fee: D.PRIVATE_FEE });
        }
      }
      const before = this.heat[place] || 0;
      const after = Math.max(0, Math.min(D.HEAT_MAX, before + amount));
      this.heat[place] = after;
      if (after > before) this.crisisStats.heated++; else if (after < before) this.crisisStats.cooled++;
      if (amount !== 0) this.emit('heat', { at: place, by: amount, now: after, cause: cause || '' });
      return after;
    }
    totalHeat() { let t = 0; for (const k in this.heat) t += this.heat[k]; return t; }
    burningAt(place) { return (this.fires[place] || 0) > 0; }

    // upkeep, folded into the gate tick that already runs each turn
    _crisisTick(p) {
      const D = this.crisisDials, MP = OilGame._mapFX();
      // 1. the world's stress bleeds off — slowly. Heat is pressure, not a ratchet,
      //    but a crisis that evaporates faster than the world makes it is no crisis.
      if (this.turn % D.HEAT_DECAY_EVERY === 0) {
        for (const k in this.heat) {
          const v = Math.max(0, this.heat[k] - D.HEAT_DECAY);
          if (v === 0) delete this.heat[k]; else { this.heat[k] = v; this.crisisStats.cooled++; }
        }
      }
      if (D.RETAINER_MODE === 'policy') { /* R1: a policy has no clock — it is spent when it pays out */ }
      else if (D.RETAINER_MODE === 'rider') { if (this.retainer[p.id] && --this.retainer[p.id] <= 0) delete this.retainer[p.id]; }   // R2: own turns
      else if (D.RETAINER_CLOCK === 'own') { if (this.retainer[p.id] && --this.retainer[p.id] <= 0) delete this.retainer[p.id]; }   // carry-over #13 knob
      else for (const id in this.retainer) { if (--this.retainer[id] <= 0) delete this.retainer[id]; }

      // 2. a CHAOTIC season is the world's instability, and the world's instability
      //    lands on the chokepoints — every one of them at once. This is what makes
      //    a strait shut because of events rather than because a card said so.
      if (this.era === 'CHAOTIC') {
        // THE SEAT CLOCK (round 10): the season leans on the straits once a ROUND, not once a seat-turn
        const rd = Math.floor((this.turn - 1) / this.players.length);
        const gatesNow = !(this.clock && this.clockDials.CHAOS_GATES_PER_ROUND) || this._chaosGateRound !== rd;
        if (gatesNow) { this._chaosGateRound = rd; MP.GATES.forEach(gc => { if (!this.mapState.closed[gc]) this.addHeat(gc, D.HEAT_CHAOS_GATES, 'a chaotic season'); });
          if (this._westCodes) { const wh = (this.path.dials && this.path.dials.WEST_HEAT !== undefined) ? this.path.dials.WEST_HEAT : D.HEAT_CHAOS_GATES;   // path dial WEST_HEAT (0 = no flashpoints)
            if (wh > 0) this._westCodes.forEach(c => { if (MP.BY[c].flash && !this.mapState.closed[c]) this.addHeat(c, wh, 'a chaotic season'); }); } }   // WEST COAST: the rim is a flashpoint
        if (p.at) this.addHeat(p.at, D.HEAT_CHAOS_LOCAL, 'a chaotic season');
      }

      // 2b. THE ARROW THAT CLOSES THE LOOP: a shut strait bleeds stress into the
      //     ground beside it. The gate shuts, and the field next to it catches.
      //     (DECISIONS-0928 `spreadRound`: once a ROUND, so a longer closure is not a hotter one.)
      if (!(this.path && this.path.spreadRound) || (this.pathDial('SPREAD_EVERY') > 0 ? this.turn % this.pathDial('SPREAD_EVERY') === 0 : this.idx === 0))
      for (const gc in this.mapState.closed) {
        (MP.ADJ[gc] || []).forEach(r => { if ((MP.BY[r.to] || {}).kind === 'hq') this.addHeat(r.to, D.HEAT_SPREAD, 'the strait is shut'); });
      }

      // 3. heat does its work: straits shut, wells blow
      for (const code in this.heat) {
        const pl = MP.BY[code]; if (!pl) continue;
        const h = this.heat[code];
        if ((pl.kind === 'gate' || (pl.kind === 'port' && pl.flash && this._westCodes)) && h >= D.GATE_SHUT_AT && !this.mapState.closed[code]) {
          if (this.closeGate(code, this.mapDials.CLOSE_TURNS)) {
            this.crisisStats.gateShuts++;
            this.emit('flashpoint', { at: code, name: pl.name, heat: h });
          }
        }
        if (pl.kind === 'hq' && !this.burningAt(code)) {
          const seat = this.seatAtHQ(code);
          if (D.RETAINER_MODE === 'policy' && seat && this.retainer[seat.id] && h >= D.BLOWOUT_AT) {   // R1: the policy pays out
            delete this.retainer[seat.id];
            this.heat[code] = Math.max(0, h - D.BLOWOUT_AT);
            this.crisisStats.retainerSaves++;
            this.emit('retainer_save', { at: code, player: seat.name, policy: true });
            continue;
          }
          const cover = seat && this.retainer[seat.id] ? D.RETAINER_SHIELD : 0;
          if (h >= D.BLOWOUT_AT + cover) {
            this.fires[code] = 1; this.crisisStats.blowouts++;
            this.emit('blowout', { at: code, name: pl.name, player: seat && seat.name });
          } else if (cover && h >= D.BLOWOUT_AT) {
            this.crisisStats.retainerSaves++;
            this.emit('retainer_save', { at: code, player: seat && seat.name });
          }
        }
      }

      // 4. what is alight goes on burning. Fires do not go out on their own.
      for (const code in this.fires) {
        this.fires[code]++;
        this.crisisStats.fireTurns++;
        const seat = this.seatAtHQ(code);
        if (seat) seat.exposure += D.FIRE_HEAT;
      }
    }

    // the fire's share of the turn's burn — oil only ever goes DOWN, so the
    // collapse clock stays monotonic and E.D.D. stays reachable (L2/E3).
    _fireBurn() {
      if (!this.crisis) return 0;
      const n = Object.keys(this.fires).length;
      if (!n) return 0;
      const burn = n * this.crisisDials.FIRE_BURN;
      this.crisisStats.oilBurnedByFire += Math.min(burn, this.oil);
      return burn;
    }

    // ---- IWS: what the deliver step may offer instead of a sale ---------------
    iwsPrice(place) {
      const D = this.crisisDials;
      return D.IWS_BASE + D.IWS_PER_TURN * Math.max(0, (this.fires[place] || 1) - 1);
    }
    canCallIWS(p) { return !!(this.crisis && this.burningAt(p.at) && p.value >= this.iwsPrice(p.at)); }
    canRetain(p) {
      const M = this.crisisDials.RETAINER_MODE;
      if (M === 'cut' || M === 'rider') return false;           // rework knob: cut, or cover rides the sale instead
      if (M === 'policy') return !!(this.crisis && this.atHQ(p) && p.at === this.hqOf(p) && !this.burningAt(p.at)
        && !this.retainer[p.id] && p.value >= this.crisisDials.POLICY_COST);
      // Only once the trouble is VISIBLE at your own ground. The brief's whole point
      // is that the money is always needed now, so cover you cannot yet justify is
      // cover nobody buys — and the sweep has to show that, not assume it.
      return !!(this.crisis && this.atHQ(p) && p.at === this.hqOf(p) && !this.burningAt(p.at)
        && !this.retainer[p.id] && p.value >= this.crisisDials.RETAINER_COST
        && (this.heat[p.at] || 0) >= this.crisisDials.RETAINER_AT);
    }
    callIWS(p) {
      if (!this.canCallIWS(p)) return false;
      const D = this.crisisDials, cost = this.iwsPrice(p.at), turns = this.fires[p.at] || 1;
      p.value -= cost; p.exposure += D.IWS_EXPOSURE;
      delete this.fires[p.at];
      this.heat[p.at] = Math.max(0, (this.heat[p.at] || 0) - D.BLOWOUT_AT);
      this.crisisStats.callOuts++; this.crisisStats.callOutSpend += cost;
      this.emit('iws', { player: p.name, at: p.at, cost, burned: turns });
      // SALVAGE: put out a fire in a rival's yard and the law of the sea gives you a claim on it
      if (this.privilege && this.privDials.PRIV_SALVAGE) { const own = this.seatAtHQ(p.at, p); if (own) this.tollOn(p, own, 'salvage'); }
      return true;
    }
    // R2 THE RIDER: may this sale carry cover for your HQ? (any sale, wherever you land it; your HQ's heat RIDER_AT+,
    // it is not burning, you are not covered, you can pay) — cover is bought on the phone, off the top of the cheque
    canRide(p) {
      const D = this.crisisDials, home = this.hqOf(p);
      return !!(D.RETAINER_MODE === 'rider' && this.crisis && home && !this.burningAt(home)
        && !this.retainer[p.id] && p.value >= D.RETAINER_COST && p.barrels >= this.dials.CLAIM_COST && (this.heat[home] || 0) >= D.RIDER_AT);
    }
    _rideCover(p) {
      const D = this.crisisDials;
      p.value -= D.RETAINER_COST;
      this.retainer[p.id] = D.RIDER_OWN_TURNS + 1;          // +1: this turn's own tick
      this.crisisStats.retainers++;
      this.emit('retainer', { player: p.name, at: p.at, cost: D.RETAINER_COST, rider: true });
    }
    buyRetainer(p) {
      if (!this.canRetain(p)) return false;
      const D = this.crisisDials;
      p.value -= D.RETAINER_MODE === 'policy' ? D.POLICY_COST : D.RETAINER_COST;
      this.retainer[p.id] = D.RETAINER_MODE === 'policy' ? 1 : D.RETAINER_CLOCK === 'own' ? D.RETAINER_OWN_TURNS + 1 : D.RETAINER_TURNS;   // 'own': +1, this turn's own tick
      this.crisisStats.retainers++;
      this.emit('retainer', { player: p.name, at: p.at, cost: D.RETAINER_MODE === 'policy' ? D.POLICY_COST : D.RETAINER_COST, policy: D.RETAINER_MODE === 'policy' || undefined });
      return true;
    }


    // ========================================================================
    // THE MAP — the shipping world (optional; opts.map). Places/routes/dials in
    // src/oil-map.js; the RULES are here: how far a roll carries you, what the
    // sea does to you in a chaotic season, and what a delivery is worth from
    // where you're standing.
    // INVARIANTS (gated in LAB 8 / sweep PART 7): the map NEVER adds oil, every
    // gate closure is FINITE, and the 8 HQs stay mutually reachable no matter
    // what is shut — nobody is ever stranded off the board.
    // ========================================================================
    mapGateTick() {
      const st = this.mapState;
      for (const k in st.closed) { if (st.closed[k] > 0 && --st.closed[k] <= 0) { delete st.closed[k]; this.emit('gate_open', { gate: k }); } }
      for (const k in st.disabled) { if (st.disabled[k] > 0 && --st.disabled[k] <= 0) delete st.disabled[k]; }
    }
    // THE ONE RULE OF THE BOARD: the world can always be made LONGER, but it can
    // never be BROKEN. Any closure that would leave an HQ unable to reach the rest
    // of the table is refused — you can strangle a rival, you cannot delete them.
    // (Gate closures alone can never split the board — LAB 8 proves that statically —
    // but a closure stacked on a DISABLED route can, so every change is checked.)
    _wouldSplit(apply, undo) {
      const MP = OilGame._mapFX();
      apply();
      const ok = !MP.hqsConnected || MP.hqsConnected(this.mapState);
      if (!ok) undo();
      return !ok;
    }
    // close a named gate for n turns (cards / E.D.D. DESTROY / faction powers)
    closeGate(code, turns) {
      const MP = OilGame._mapFX();
      if (!this.map || !MP.BY || !MP.BY[code] || (MP.BY[code].kind !== 'gate' && !(MP.BY[code].kind === 'port' && MP.BY[code].flash && this._westCodes))) return false;
      const n = (this.path && this.path.rounds) ? Math.max(1, this.pathDial('CLOSE_ROUNDS'))
        : Math.max(1, turns || this.mapDials.CLOSE_TURNS);
      const prev = this.mapState.closed[code];
      if (this._wouldSplit(() => { this.mapState.closed[code] = Math.max(prev || 0, n); },
                           () => { if (prev === undefined) delete this.mapState.closed[code]; else this.mapState.closed[code] = prev; })) {
        this.emit('gate_refused', { gate: code, why: 'would strand a seat' });
        return false;
      }
      this.mapStats.closures++;
      this.emit('gate_close', { gate: code, name: MP.BY[code].name, turns: n });
      return true;
    }
    // raise a megastructure — the late-game move that redraws the world
    build(structure) {
      const MP = OilGame._mapFX();
      if (!this.map || !(MP.STRUCTURES || {})[structure] || this.mapState.built[structure]) return false;
      this.mapState.built[structure] = true; this.mapStats.structures++;
      this.emit('structure', { structure, name: MP.STRUCTURES[structure].name, effect: MP.STRUCTURES[structure].effect });
      return true;
    }
    // take one of this player's own routes out of service for a while ("disable route")
    disableRouteNear(victim) {
      const MP = OilGame._mapFX();
      if (!this.map || !victim.at || !MP.ADJ) return false;
      const live = (MP.ADJ[victim.at] || []).filter(r => MP.routeOpen(r, victim.at, this.mapState));
      // take the first route that can be spared without breaking the board
      for (const r of live) {
        const dn = (this.path && this.path.rounds) ? Math.max(1, this.pathDial('CLOSE_ROUNDS')) : this.mapDials.CLOSE_TURNS;
        if (!this._wouldSplit(() => { this.mapState.disabled[r.id] = dn; },
                              () => { delete this.mapState.disabled[r.id]; })) {
          this.emit('route_disabled', { at: victim.at, label: r.label, to: r.to });
          return true;
        }
      }
      return false;
    }
    // ---- megastructures: the late-game move that redraws the world -----------
    // Expansion only (the Green Anders register). You must already hold real ground
    // — this is what regional success BUYS: the power to change everyone's map.
    buildable() {
      const MP = OilGame._mapFX();
      return Object.keys(MP.STRUCTURES || {}).filter(k => !this.mapState.built[k]);
    }
    canBuild(p) {
      // (DECISIONS-0928 CORE-018 middle: build credit counts toward the bar; 0 unless that dial is set)
      return !!(this.map && this.expansion && this.atHQ(p) && (p.control + (this.path ? (p.buildCredit || 0) : 0)) >= this.mapDials.BUILD_CONTROL
        && this.buildable().length);
    }
    placeOf(p) { const MP = OilGame._mapFX(); return (MP.BY && MP.BY[p.at]) || null; }
    atHQ(p) { const pl = this.placeOf(p); return !!(pl && pl.kind === 'hq'); }

    // the movement PHASE: a THIRD read of the same three bodies carries you, the
    // era decides what the sea does, and where you end decides what you can sell.
    async _mapPhase(p) {
      const MP = OilGame._mapFX(), D = this.mapDials;
      // THE PATH 'rounds': a closure's clock runs in ROUNDS, not seat-turns. Ticked on every
      // seat's turn, CLOSE_TURNS 3 never outlasted one round at 5 seats — the strait was open
      // again before most of the table had sailed. (docs/THE-PATH.md, finding 3)
      if (!(this.path && this.path.rounds) || this.idx === 0) this.mapGateTick();
      if (this.crisis) this._crisisTick(p);      // no new phase — upkeep, not a decision
      // THE PRIVILEGE: you sail on the bodies in your hand. Only the 'spread' read is defined
      // on fewer than three; other reads keep all three (stepsFor clamps to MOVE_MIN).
      let steps = MP.stepsFor((this.privilege && D.MOVE_READ === 'spread') ? this.moveDice(p) : this.lastDice, D);
      if (this.privilege) steps = Math.max(D.MOVE_MIN, this.privSteps(p, steps));
      const from = p.at;
      const r = MP.reach(from, steps, this.levels ? this._lvState(p) : this.mapState);
      const options = r.places.slice().sort();
      p.longWay = false; p.stayed = false; p.moved = false;
      if (this.privilege) p._transit = null;     // THE PRIVILEGE: a new voyage — last one's canal is behind you
      if (this.path && this.path.supply === 'lift') this._liftAtYard(p);   // DECISIONS-0928 CORE-022
      if (this.path) this._voyageProbe(p);       // THE PATH: measured, never asked
      // THE EXPANSION's fix (round 5): under MOMENTUM your momentum is YOUR bodies' spread — a seat
      // short of bodies drifts (and the house's bodies carry nobody)
      if (this.momentum && this.privilege && this.privDials.PRIV_MOM === 'own') steps = Math.max(this.privDials.PRIV_MOM_MIN || 0, MP.stepsFor(this._ownDice(p), D));
      if (this.momentum) return this._momentumPhase(p, steps);   // MOMENTUM: the ocean carries you
      if (options.length > 1) {
        const pick = await this.ask(p, 'move', options);
        const to = (options.indexOf(pick) >= 0) ? pick : from;
        const path = MP.pathOf(r, to);
        if (to !== from && path.length > 1) {
          // THE SEA. Every risky place you enter in a CHAOTIC season can take
          // something off you. Peril never touches the oil clock — only cargo.
          let lost = 0, hitCape = false;
          for (let i = 1; i < path.length; i++) {
            const kind = (MP.BY[path[i]] || {}).kind;
            if (kind === 'cape' || kind === 'arctic') hitCape = true;
            const risk = MP.perilOf(path[i], this.era, D);
            if (risk > 0 && this.rng.random() < risk) {
              const n = Math.min(p.barrels, D.PERIL_BARREL);
              p.barrels -= n; lost += n; p.exposure += D.PERIL_HEAT;
              this.mapStats.perils++; this.mapStats.barrelsLost += n;
              this.emit('peril', { player: p.name, place: path[i], name: (MP.BY[path[i]] || {}).name, lost: n });
            }
          }
          // THE LONG WAY ROUND. Not "did you touch a Cape" — did the world's shut
          // gates actually make this trip longer than it should have been? If the
          // same journey would have been cheaper with everything open, you were
          // detoured, and the cargo you land is worth more for it.
          if (Object.keys(this.mapState.closed).length || Object.keys(this.mapState.disabled).length) {
            const openState = { closed: {}, disabled: {}, built: this.mapState.built, opts: this.mapState.opts };
            const openR = MP.reach(from, 99, openState);
            const wouldBe = openR.dist[to];
            if (hitCape || (wouldBe !== undefined && (r.dist[to] || 0) > wouldBe)) {
              p.longWay = true; this.mapStats.longWay++;
              this.emit('longway', { player: p.name, from, to, cost: r.dist[to] || 0, normally: wouldBe });
            }
          }
          if (this.path) this._passageToll(p, path);
          p.at = to; p.moved = true;
          if (this.privilege && this.privDials.PRIV_WATER) {       // THE SEA'S LAW: did you go through a gate?
            // under 'dues', your OWN water costs you nothing: a gate you are warden of is home, not a toll
            const gate = path.slice(1).find(c => this.gateCosts(c, p));
            if (gate) { p._transit = gate; this.privStats.transits = (this.privStats.transits || 0) + 1; }
            else if (path.slice(1).some(c => { const k = (MP.BY[c] || {}).kind; return k === 'cape' || k === 'arctic'; })) this.privStats.capeVoyages = (this.privStats.capeVoyages || 0) + 1;
          }
          if (this.privilege) this._arrestCheck(p);
          if (this.privilege && this.privDials.PIRATES) {          // ☠ the voyage crossed pirate water?
            const rids = []; for (let i = 1; i < path.length; i++) { const rt = (MP.ADJ[path[i - 1]] || []).find(x => x.to === path[i]); if (rt) rids.push(rt.id); }
            if (this._pirateWater(path.slice(1), rids)) this._pirateCheck(p, path.find(c => this.privDials.PIRATE_PLACES.indexOf(c) >= 0) || 'pirate water');
          }
          this.mapStats.moves++; this.mapStats.steps += (r.dist[to] || 0);
          this.emit('move', { player: p.name, from, to, cost: r.dist[to] || 0, steps, path, lost, longWay: p.longWay });
        } else {
          // You had somewhere to be and you stayed. The penalty for that is no longer
          // charged here — see FOLD 1 at the action step: ONE idleness rule, "move or
          // sell", so a seat is never billed twice for a single act of doing nothing.
          p.stayed = true; this.mapStats.stayed++;
          this.emit('stay', { player: p.name, at: from });
        }
      }
    }

    // ---- MOMENTUM (docs/THE-MOMENTUM.md) ------------------------------------------------
    _canPutIn(code) { const MP = OilGame._mapFX(), pl = MP.BY[code]; if (!pl) return false;
      return pl.kind === 'hq' || !!(this.path && (this.sellableAt(code) || this.domesticAt(code))); }
    // "dirty" at an inspection: your exposure this far over the cleanest seat (THE PRIVILEGE's own
    // read when it is on — a seat on the record — else the same gap on its own)
    _dirty(p) {
      if (this.privilege) return this.privilegeBase(p) < 3;
      const clean = Math.min.apply(null, this.players.map(q => q.exposure));
      return p.exposure - clean >= this.momDials.DIRTY_GAP;
    }
    _momentumOptions(p, steps) {
      const M = OilGame._momFX(), MD = this.momDials;
      const points = Math.max(1, steps) * MD.PACE;
      const st = this.levels ? this._lvState(p) : this.mapState;
      const ws = M.walks(p.under ? { under: p.under } : { at: p.at }, points,
        { state: st, dials: MD, dirty: this._dirty(p), canPutIn: c => this._canPutIn(c) });
      // a voyage that ends where it began is not a voyage: that is CAMPING, and camping is billed
      let real = ws.filter(w => !w.stuck && w.trail.length > 0 && !(!p.under && !w.under && w.at === p.at));
      // OIL LEVELS 'two': never leave a WILDCAT ship riding at anchor in front of LANES water
      if (st.forbid) real = real.filter(w => !st.forbid[w.at]);
      return { points, walks: real };
    }
    async _momentumPhase(p, steps) {
      const MP = OilGame._mapFX(), M = OilGame._momFX(), MD = this.momDials, S = this.momStats, D = this.mapDials;
      const from = p.at, fromUnder = p.under;
      if (p._becalmed) {                                   // the doldrums: you sit this one out — not by choice
        p._becalmed = false; S.calms++; p.stayed = true; this.mapStats.stayed++;
        this.emit('becalmed', { player: p.name, at: p.at }); return;
      }
      const { points, walks } = this._momentumOptions(p, steps);
      const meta = {}; walks.forEach(w => { meta['GO:' + w.key] = w; });
      const options = walks.map(w => 'GO:' + w.key);
      if (!p.under) options.push('CAMP');                 // you can anchor at a place, not mid-ocean
      if (!walks.length) {                                 // nowhere the sea can take you: a forced stay, no demurrage
        S.stuck++; p.stayed = true; this.mapStats.stayed++; this.emit('stuck', { player: p.name, at: p.at, under: !!p.under }); return;
      }
      if (options.length === 1) S.forcedOnly++;
      const pick = options.length > 1 ? await this.ask(p, 'move', options, { momentum: meta, points }) : options[0];
      if (pick === 'CAMP' || !meta[pick]) {
        // CAMPING — DEMURRAGE: staying is a strategy, and it is charged, escalating per turn camped
        p.campTurns = (p.campTurns || 0) + 1;
        const t = Math.min(p.campTurns, MD.CAMP_CAP);
        const pay = Math.min(Math.max(0, p.value), MD.DEMURRAGE[t] || 0);
        p.value -= pay; p.exposure += MD.DEMURRAGE_EXP[t] || 0;
        if (this.crisis && t >= 2 && MD.CAMP_HEAT) this.addHeat(p.at, MD.CAMP_HEAT, 'demurrage');
        if (p.campTurns === 1) S.campRuns++;
        S.camps++; S.demurrage += pay; p.camped = true; p.stayed = true; this.mapStats.stayed++;
        p.campLog = (p.campLog || 0) + 1;
        this.emit('camp', { player: p.name, at: p.at, campTurn: p.campTurns, paid: pay, exposure: MD.DEMURRAGE_EXP[t] || 0 });
        return;
      }
      const w = meta[pick];
      p.campTurns = 0; p.camped = false;
      S.walks++; S.spaces += w.trail.length;
      // the places entered on the way: the sea in a chaotic season, as before
      let lost = 0; const entered = w.trail.filter(x => x.node).map(x => x.node);
      const nodes = (fromUnder ? [] : [from]).concat(entered);
      for (const code of entered) {
        const risk = MP.perilOf(code, this.era, D);
        if (risk > 0 && this.rng.random() < risk) {
          const n = Math.min(p.barrels, D.PERIL_BARREL);
          p.barrels -= n; lost += n; p.exposure += D.PERIL_HEAT;
          this.mapStats.perils++; this.mapStats.barrelsLost += n;
          this.emit('peril', { player: p.name, place: code, name: (MP.BY[code] || {}).name, lost: n });
        }
      }
      w.trail.forEach(x => { if (x.type === 'INSPECT') S.inspectClean++; });
      if (this.path) this._passageToll(p, nodes.length ? (fromUnder ? [from].concat(entered) : nodes) : []);
      let under = w.under ? Object.assign({}, w.under) : null, at = w.at;
      // landing on a typed space
      if (under && w.halted === 'inspect') {
        const sp = M.spacesOf(under.rid, MD), port = under.k === 1 ? sp.a : sp.b;
        S.inspectDirty++;
        // GREEN ANDERS — the firm's man in customs: on a dirty inspection the green die is thrown, and
        // at GREEN_TRIGGER+ you are waved through — no fine, no arrest — and it is on the record (+1)
        let bribed = false;
        if (this.expansion && this.privilege && this.privDials.ANDERS_BRIBE) {
          const gd = this.rng.d6(); this.disputeStats.bribeTries++;
          if (gd >= this.dials.GREEN_TRIGGER) { bribed = true; this.disputeStats.bribes++; p.exposure += 1;
            this.emit('anders_bribe', { player: p.name, port, name: (MP.BY[port] || {}).name, die: gd }); }
        }
        const fine = bribed ? 0 : Math.min(Math.max(0, p.value), MD.INSPECT_FINE);
        if (!bribed) { p.value -= fine; p.exposure += MD.INSPECT_HEAT; S.inspectFines += fine;
          this.emit('inspection', { player: p.name, port, name: (MP.BY[port] || {}).name, fine, clean: false }); }
        // in a rival's home water, port-state control is the rival: THE PRIVILEGE's admiralty arrest
        const owner = this.seatAtHQ(port, p);
        if (!bribed && this.privilege && owner && this._seizeOn() && this.privDials.INSPECT_ARREST && !(this.deals && this.dealBetween(owner, p))
          && this.privilegeOf(p) < 3 && this.seizeFrom(owner, p, 'arrest')) S.inspectArrests++;   // (privStats.arrests = home-yard arrests only, round 7)
      } else if (under && w.landed === 'CURRENT') {
        const sp = M.spacesOf(under.rid, MD), weather = this.lastDice[1] || 0;
        const push = MD.CURRENT_PUSH + (weather >= MD.CURRENT_STRONG ? 1 : 0);
        const end = under.dir > 0 ? sp.N : 0;
        const k2 = under.dir > 0 ? Math.min(end, under.k + push) : Math.max(end, under.k - push);
        S.currents++;
        this.emit('current', { player: p.name, name: sp.current, push: Math.abs(k2 - under.k) });
        if (k2 === end && MP.placeOpen(at, this.mapState)) under = null; else under.k = (k2 === end) ? under.k : k2;
      } else if (under && w.landed === 'HAZARD') {
        const weather = this.lastDice[1] || 0;
        if (weather >= MD.STORM_AT) { const n = Math.min(p.barrels, MD.STORM_BARREL); p.barrels -= n; lost += n; S.storms++;
          this.emit('storm', { player: p.name, lost: n }); }
        else if (weather <= MD.CALM_AT) { p._becalmed = true; this.emit('doldrums', { player: p.name }); }
      } else if (under && w.landed === 'EVENT') { p._eventDraw = true; S.events++; this.emit('event_space', { player: p.name }); }
      // ☠ PIRATES (THE PRIVILEGE): landing on a pirate space, or halting at a pirate strait
      if (this.privilege && this.privDials.PIRATES) {
        const sp = under ? M.spacesOf(under.rid, MD) : null;
        const crossed = w.trail.find(x => x.type === 'PIRATE' || (x.node && this.privDials.PIRATE_PLACES.indexOf(x.node) >= 0));
        if (crossed || (sp && sp.types[under.k] === 'PIRATE')) this._pirateCheck(p, crossed && crossed.node ? crossed.node : (M.spacesOf((crossed || {}).rid != null ? crossed.rid : under.rid, MD) || {}).label);
        else if (under && this.privDials.PIRATE_AT_SEA && sp.pirate && sp.types[under.k] !== 'INSPECT') this._pirateCheck(p, sp.label, this.privDials.PIRATE_AT_SEA);   // riding at anchor in pirate water
      }
      if (w.halted === 'stop') S.stops++;
      if (w.halted === 'closed') S.closedAhead++;
      if (w.putIn) S.putIns++;
      if (under) S.underway++;
      p.under = under; p.at = at; p.moved = true;
      if (this.privilege && this.privDials.PRIV_WATER && !under) {   // halting AT a gate is the transit
        if (this.gateCosts(at, p)) { p._transit = at; this.privStats.transits = (this.privStats.transits || 0) + 1; }
      }
      if (this.privilege && !under) this._arrestCheck(p);
      this.mapStats.moves++; this.mapStats.steps += Math.round(w.trail.length / MD.SCALE);
      this.emit('move', { player: p.name, from, to: at, cost: w.trail.length, steps, path: nodes, lost,
        momentum: { under: !!under, halted: w.halted || null, landed: w.landed || null, putIn: !!w.putIn, points } });
    }

    // what one barrel fetches from where this player is standing.
    // A claim is a DELIVERY: blocked routes out of your node cut what you can move,
    // the long way past a shut gate pays a premium, and selling out of a rival's
    // yard pays more and costs you both.
    // ---- CONTROL: throughput in, control out ---------------------------------
    // A station is EVIDENCE OF THROUGHPUT, not a purchase — you get one by selling at a
    // place, so you cannot buy into a region you do not actually supply.
    _addThroughput(p, place, barrels) {
      if (!place || !barrels) return;
      const t = (this.throughput[place] || (this.throughput[place] = {}));
      t[p.name] = (t[p.name] || 0) + barrels;
    }
    // Who holds a place: the leader, if it clears the floor AND beats second by the margin.
    // Anything else is CONTESTED — which is where the deal layer and the flashpoints work.
    controlOf(place) {
      const t = this.throughput[place]; if (!t) return null;
      const D = this.dials;
      const rank = Object.keys(t).map(n => [n, t[n]]).sort((a, b) => b[1] - a[1]);
      if (!rank.length || rank[0][1] < D.CONTROL_MIN) return null;
      const second = rank[1] ? rank[1][1] : 0;
      if (second > 0 && rank[0][1] < second * D.CONTROL_MARGIN) return null;
      return rank[0][0];
    }
    controlTable() {
      const out = {};
      Object.keys(this.throughput).forEach(pl => { const o = this.controlOf(pl); if (o) out[pl] = o; });
      return out;
    }
    controlCount(name) {
      const t = this.controlTable();
      return Object.keys(t).filter(k => t[k] === name).length;
    }
    // Once per round: trade rots, then control is re-read. Emitting only on CHANGE keeps the
    // event stream honest about when ground actually moved.
    _settleControl() {
      const D = this.dials;
      Object.keys(this.throughput).forEach(pl => {
        const t = this.throughput[pl];
        Object.keys(t).forEach(n => {
          t[n] *= D.THROUGHPUT_DECAY;
          if (t[n] < 0.05) delete t[n];
        });
        if (!Object.keys(t).length) delete this.throughput[pl];
      });
      Object.keys(this.throughput).forEach(pl => {
        const now = this.controlOf(pl), was = this.controlOwner[pl] || null;
        if (now !== was) {
          this.controlOwner[pl] = now;
          this.emit('control', { place: pl, from: was, to: now, turn: this.turn });
          if (now && this.path && this.path.shut === 'control') this._holderShuts(pl, now);
        }
      });
    }

    // THE PUNITIVE STROKE. One seat, one effect, survivable — the guardrail from §5 is that this
    // must never become misery, so it takes a bite and never a leg. Which of the three lands is
    // deterministic on the turn, so a replay is a replay.
    _andersPunish() {
      const D = this.dials;
      const lead = this.players.slice().sort((a, b) => b.holdings(this.price) - a.holdings(this.price))[0];
      if (!lead) return;
      const held = Object.keys(this.controlTable()).filter(k => this.controlTable()[k] === lead.name);
      const pick = this.turn % 3;
      let how = null;

      if (pick === 0 && held.length) {              // SEIZE — strip the ground out from under them
        const place = held[0];
        const t = this.throughput[place] || {};
        delete t[lead.name];                        // the station is gone; whoever is next inherits
        this.controlOwner[place] = this.controlOf(place);
        how = { how: 'seize', place };
      } else if (pick === 1 && held.length && this.crisis) {
        this.addHeat(held[0], D.GREEN_SEIZE_HEAT, 'Anders assigns the blame');
        how = { how: 'blame', place: held[0] };     // BLAME — the trouble is booked to your ground
      } else {                                      // LEVY — the loan is called. Always available.
        const take = Math.min(lead.value, D.GREEN_LEVY);
        lead.value -= take;
        how = { how: 'levy', took: take };
      }
      lead.exposure += 1;                           // and it is on the record that Anders had to act
      this.andersStats = this.andersStats || { seize: 0, blame: 0, levy: 0 };
      this.andersStats[how.how]++;
      this.emit('anders', Object.assign({ player: lead.name, turn: this.turn }, how));
    }

    // CONSIGNED CARGO (model). Hand this seat a buyer that is NOT where it is standing —
    // a contract you are already sitting on is not a destination, it is a formality.
    _consign(p) {
      const MP = OilGame._mapFX();
      if (!MP.HQS || !MP.HQS.length) return;
      if (this.path && this.path.v2) {                 // THE PATH: the weighted draw (cluster / mega buyers)
        p.consignedTo = this._drawBuyer([p.at]);
      } else {
        const away = MP.HQS.filter(c => c !== p.at);
        p.consignedTo = away.length ? away[Math.floor(this.rng.random() * away.length)] : MP.HQS[0];
      }
      this.emit('consign', { player: p.name, to: p.consignedTo, from: p.at, turn: this.turn });
    }

    // ========================================================================
    // THE PATH (opts.path — docs/THE-PATH.md). The consign model, grown into the thing a
    // player actually does on the board: take a contract, sail it to the buyer, get paid —
    // and find out who holds the buyer. ALL CONCEPT; every number a MAP_DIALS dial.
    //   mode 'private' — each seat holds its own buyer (the 2026-09-24 model)
    //   mode 'market'  — MARKET_SIZE face-up buyers everybody chases; first to land takes it
    //   cluster  — a buyer's draw weight grows with the barrels already landed there
    //   toll     — whoever HOLDS a buyer (control) takes TOLL_PCT of every rival cargo landed
    //   points   — a landed contract is worth CONSIGN_POINTS extra ▰
    //   mega     — raised structures are places you can sell at, pay their builder a passage
    //              toll, and score MEGA_POINTS ▰ to the builder per contract landed at them
    // ========================================================================
    static pathRules(x) {
      const PRESETS = {
        private: { mode: 'private' },
        cluster: { mode: 'private', cluster: true },
        market:  { mode: 'market' },
        toll:    { mode: 'private', toll: true },
        // THE RECOMMENDED PATH (docs/THE-PATH.md): a shared face-up market dealt where nobody
        // stands, a landed contract counted as a cargo of record on the station meter (×2),
        // the tollbooth, megastructures as destinations — and a landed contract worth ▰1 more
        // than a dump, so the verdict can see the path. (cluster measured ~0 effect: left out.)
        // home + onshore: the two baseline bugs, fixed here only (docs/THE-PATH.md, findings 5–6).
        path:    { mode: 'market', toll: true, mega: true, home: true, onshore: true, dials: { CONSIGN_THROUGHPUT: 2, CONSIGN_POINTS: 1 } },
        // the same WITHOUT touching the score — if the verdict is not to move (Joe's call)
        quiet:   { mode: 'market', toll: true, mega: true, home: true, onshore: true, dials: { CONSIGN_THROUGHPUT: 2 } },
      };
      const base = typeof x === 'string' ? (PRESETS[x] || PRESETS.private) : (x === true ? PRESETS.private : Object.assign({}, x));
      // DECISIONS-0928 (docs/DECISIONS-0928.md) — MODEL-ONLY rule keys for Joe's open calls. No
      // preset sets any of them, so `path` / `quiet` / the baseline are byte-identical:
      //   shut       CORE-020 timing: 'headline' (a flashpoint shuts a gate every round before
      //              E.D.D.) | 'control' (taking a gate-side place shuts its strait) | 'all' (probe)
      //   spreadRound CORE-020 cap: a shut strait heats its shore once a ROUND, not every seat-turn
      //   supply     CORE-022: 'lift' (top up in your own yard) | 'cargo' (a landed contract loads
      //              the backhaul) | 'produce' (yard 1 + 1 per held place, each round)
      //   geo        the Caspian: 'btc' opens the optional BTC pipe (OIL_MAP.OPTIONAL_ROUTES)
      //   botOnshore bot policy, not a rule: the automa weighs a domestic sale against the voyage
      //   squeeze    'shut': the delivery squeeze ignores routes to places not yet built/thawed
      const r = Object.assign({ mode: 'private', cluster: false, toll: false, mega: false, rounds: false, home: false, onshore: false,
        shut: null, spreadRound: false, supply: null, geo: null, west: null, botOnshore: false, squeeze: null, dials: {} }, base);
      if (r.mode !== 'market') r.mode = 'private';
      // v2 = anything beyond the original private model (which must stay exactly as measured)
      r.v2 = r.mode === 'market' || r.cluster || r.toll || r.mega || r.rounds || r.home || r.onshore || !!Object.keys(r.dials).length
        || !!r.shut || !!r.spreadRound || !!r.supply || !!r.geo || !!r.west || !!r.botOnshore || !!r.squeeze;
      return r;
    }
    // the buyers this seat is carrying toward right now
    buyersFor(p) {
      if (!this.consign) return [];
      let b = this.path && this.path.mode === 'market' ? this.market.slice() : (p.consignedTo ? [p.consignedTo] : []);
      // THE SPACE ELEVATOR (CONCEPT): "deliver without a route at all — the map stops applying
      // to you". Its builder's contract counts as landed at ANY place it can sell.
      if (this.path && this.path.mega && this.structureOwner.SPACE_ELEVATOR === p.name) {
        const MP = OilGame._mapFX();
        b = this._codes().filter(c => this.sellableAt(c));
      }
      return b;
    }
    // every place code in THIS game: the board, plus the WEST COAST model's ports when that rule is on
    _codes() { const MP = OilGame._mapFX(); return this._westCodes ? MP.CODES.concat(this._westCodes) : MP.CODES; }
    // nearest buyer from `from`, by the CURRENT map (shut gates and all)
    nearestBuyer(p, from, state) {
      const MP = OilGame._mapFX();
      const r = MP.reach(from, 99, state || (this.levels ? this._lvState(p) : this.mapState));
      let best = null, bd;
      for (const b of this.buyersFor(p)) { const d = r.dist[b]; if (d !== undefined && (bd === undefined || d < bd)) { bd = d; best = b; } }
      return { to: best, dist: bd, reach: r };
    }
    // where a cargo can be landed: an HQ, or (with mega on) a raised megastructure's place
    sellableAt(code) {
      const MP = OilGame._mapFX(), pl = MP.BY && MP.BY[code];
      if (!pl) return false;
      if (pl.kind === 'hq') return true;
      if (pl.kind === 'port') return !!(this._westCodes && MP.placeOpen(code, this.mapState));   // WEST COAST (model)
      return !!(this.path && this.path.mega && pl.kind === 'built' && MP.placeOpen(code, this.mapState));
    }
    // who holds a place: a built structure belongs to its builder; anywhere else it is CONTROL (§2)
    ownerOf(code) {
      const MP = OilGame._mapFX(), pl = MP.BY && MP.BY[code];
      if (pl && (pl.kind === 'built' || pl.kind === 'arctic') && this.path && this.path.mega) {
        const s = pl.kind === 'arctic' ? 'ARCTIC_DEV' : pl.requires;
        if (this.structureOwner[s]) return this.structureOwner[s];
      }
      return this.controlOf(code);
    }
    // THE PATH `onshore` rule: domestic ground can be WORKED (sold at). It is not a buyer — no
    // contract is ever dealt there — but it is not a dump either: nothing is shipped, so the
    // barrel sells at spot + ONSHORE_PCT, and the bill arrives as heat (HEAT_ONSHORE).
    domesticAt(code) {
      const MP = OilGame._mapFX(), pl = MP.BY && MP.BY[code];
      return !!(this.path && this.path.onshore && pl && pl.kind === 'onshore');
    }
    // anywhere this seat's cargo can come off the hull this turn
    canDeliverAt(code) { return this.path ? (this.sellableAt(code) || this.domesticAt(code)) : !!((OilGame._mapFX().BY || {})[code] && OilGame._mapFX().BY[code].kind === 'hq'); }
    pathDial(k) { return (this.path && this.path.dials && this.path.dials[k] !== undefined) ? this.path.dials[k] : this.mapDials[k]; }
    // a buyer, drawn: every sellable place except `exclude`; weighted by landed barrels if clustering
    _drawBuyer(exclude) {
      const MP = OilGame._mapFX();
      const pool = this._codes().filter(c => this.sellableAt(c) && (exclude || []).indexOf(c) < 0);
      if (!pool.length) return MP.HQS[0];
      const w = pool.map(c => {
        if (!(this.path && this.path.cluster)) return 1;
        const t = this.throughput[c] || {};
        return 1 + this.pathDial('CLUSTER_W') * Object.keys(t).reduce((a, n) => a + t[n], 0);
      });
      let r = this.rng.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    // THE PATH + mega: a structure belongs to whoever raised it, and a structure that RAISES a
    // place ("new strategic locations" — Sea City, the Antarctic Station, the Elevator) opens
    // with a contract on it: the grand opening is a buyer, face-up, for everybody.
    _raisedOnPath(p, key) {
      this.structureOwner[key] = p.name;
      if (!this.path.mega) return;
      const MP = OilGame._mapFX(), S = (MP.STRUCTURES || {})[key] || {};
      (S.raises || []).forEach(code => {
        if (!this.sellableAt(code)) return;
        if (this.path.mode === 'market') {
          if (this.market.indexOf(code) < 0) {
            this.market.push(code);
            if (this.market.length > Math.max(1, this.pathDial('MARKET_SIZE'))) this.market.shift();
            this.emit('contract', { to: code, turn: this.turn, opening: key });
          }
        }
      });
    }
    _fillMarket() {
      const n = Math.max(1, this.pathDial('MARKET_SIZE'));
      while (this.market.length < n) {
        // a contract is dealt where NOBODY is standing — a buyer you are already sitting on is a
        // formality, not a voyage (the same rule the private model's _consign keeps). Falls back
        // to any free buyer if every one is occupied.
        const here = this.players.map(q => q.at).filter(Boolean);
        const free = this._codes().filter(c => this.sellableAt(c) && this.market.indexOf(c) < 0 && here.indexOf(c) < 0);
        const b = this._drawBuyer(free.length ? this.market.concat(here) : this.market);
        if (this.market.indexOf(b) >= 0) break;
        this.market.push(b);
        this.emit('contract', { to: b, turn: this.turn });
      }
    }
    // The delivery squeeze's read of a node. Baseline: MP.trafficAt as ever — which counts a route
    // to a place that does not EXIST yet (the ice before Arctic Development, Sea City before it is
    // raised) as a BLOCKED route, so the Mainland sells at −50% and the Volga / the Gulf Coast at
    // −25% all game (DECISIONS-0928 finding). THE PATH `squeeze: 'shut'` (MODEL ONLY) counts only
    // routes that are actually shut or disabled.
    _trafficAt(code) {
      const MP = OilGame._mapFX(), t = MP.trafficAt(code, this.mapState);
      if (!(this.path && this.path.squeeze === 'shut')) return t;
      const unbuilt = t.routes.filter(r => { const k = (MP.BY[r.to] || {}).kind;
        return (k === 'arctic' || k === 'built') && !MP.placeOpen(r.to, this.mapState); }).length;
      return Object.assign({}, t, { blocked: Math.max(0, t.blocked - unbuilt), open: t.open });
    }

    // ---- DECISIONS-0928 (docs/DECISIONS-0928.md): CORE-020, WHEN straits shut. MODEL ONLY. ----
    // 'headline': the crisis layer's flashpoint of the round. Once a round, until E.D.D. arms, one
    //             open gate shuts (drawn weighted by its heat + 1). Pulls closures into the midgame.
    // 'all':      probe only — every gate the board rule allows is shut all game (the ceiling).
    _shutShape() {
      const MP = OilGame._mapFX(), S = this.path.shut;
      if (!this.map || !MP.GATES) return;
      if (S === 'all') { MP.GATES.forEach(gc => { if (!this.mapState.closed[gc]) this.closeGate(gc, 999); }); return; }
      if (S !== 'headline' || this.edd) return;
      const open = MP.GATES.filter(gc => !this.mapState.closed[gc]);
      if (!open.length) return;
      const w = open.map(gc => 1 + (this.heat[gc] || 0));
      let r = this.rng.random() * w.reduce((a, b) => a + b, 0), pick = open[open.length - 1];
      for (let i = 0; i < open.length; i++) { r -= w[i]; if (r <= 0) { pick = open[i]; break; } }
      if (this.closeGate(pick, this.pathDial('HEADLINE_TURNS'))) {
        this.pathStats.headlines = (this.pathStats.headlines || 0) + 1;
        this.emit('flashpoint', { at: pick, name: (MP.BY[pick] || {}).name, headline: true });
      }
    }
    // 'control': taking a place beside a strait lets the new holder squeeze it — the strait shuts.
    _holderShuts(place, holder) {
      const MP = OilGame._mapFX();
      (MP.ADJ[place] || []).forEach(r => {
        if ((MP.BY[r.to] || {}).kind !== 'gate' || this.mapState.closed[r.to]) return;
        if (this.closeGate(r.to, this.mapDials.CLOSE_TURNS)) {
          this.pathStats.holderShuts = (this.pathStats.holderShuts || 0) + 1;
          this.emit('holder_shut', { gate: r.to, place, player: holder });
        }
      });
    }
    // ---- CORE-022, where cargo comes from. Every barrel a supply rule creates burns SUPPLY_BURN
    // oil (the barrel is pulled out of the finite world — L2 holds: oil only goes down). ----
    _supply(p, n, why) {
      if (!(n > 0)) return 0;
      p.barrels += n;
      this.burnOil(n * (this.pathDial('SUPPLY_BURN') || 0));
      this.pathStats.supplied = (this.pathStats.supplied || 0) + n;
      this.emit('supply', { player: p.name, n, why, at: p.at });
      return n;
    }
    // 'lift': start your turn in your own yard with a light hold, and you top it up
    _liftAtYard(p) {
      if (!(this.path && this.path.supply === 'lift') || !p.at || p.at !== this.hqOf(p)) return;
      const to = this.pathDial('LIFT_TO') || 0;
      if (p.barrels < to) this._supply(p, to - p.barrels, 'lift');
    }
    // 'produce': once a round, your yard makes 1 and every place you HOLD makes 1 more (capped)
    _produceRound() {
      if (!(this.path && this.path.supply === 'produce')) return;
      const t = this.controlTable(), cap = this.pathDial('PRODUCE_CAP') || 0;
      this.players.forEach(q => {
        const held = Object.keys(t).filter(k => t[k] === q.name).length;
        this._supply(q, Math.min(cap, 1 + held), 'produce');
      });
    }

    // THE PATH, before the sail: is this seat's route to its buyer longer than it would be
    // with nothing shut? A per-TURN state read, so it sees a detour spread over several turns
    // (the per-move 'longway' flag structurally cannot — see f1e94e7).
    _voyageProbe(p) {
      if (!this.consign || p.barrels <= 0) return;
      const MP = OilGame._mapFX();
      const now = this.nearestBuyer(p, p.at);
      if (now.dist === undefined || now.dist === 0) return;
      this.pathStats.voyageTurns++;
      const open = this.nearestBuyer(p, p.at, { closed: {}, disabled: {}, built: this.mapState.built, opts: this.mapState.opts });
      if (open.dist !== undefined && now.dist > open.dist) {
        this.pathStats.detourTurns++; this.pathStats.detourSteps += now.dist - open.dist;
        this.emit('detour', { player: p.name, at: p.at, to: now.to, cost: now.dist, normally: open.dist });
      }
    }
    // THE PATH, on the sail: sailing through a structure somebody else raised costs you a passage
    _passageToll(p, path) {
      if (!(this.path && this.path.mega) || !path || path.length < 2) return;
      const MP = OilGame._mapFX(), fee = this.pathDial('PASSAGE_TOLL');
      for (let i = 1; i < path.length; i++) {
        const pl = MP.BY[path[i]]; if (!pl || (pl.kind !== 'built' && pl.kind !== 'arctic')) continue;
        const own = this.ownerOf(path[i]);
        const q = own && own !== p.name ? this.players.find(z => z.name === own) : null;
        if (!q) continue;
        const pay = Math.max(0, Math.min(p.value, fee));
        p.value -= pay; q.value += pay;
        this.pathStats.passages++; this.pathStats.passagePaid += pay;
        this.emit('passage', { player: p.name, to: q.name, place: path[i], name: pl.name, paid: pay });
      }
    }
    // THE PATH, on the landing: the contract is discharged. Who gets what — the one place
    // the whole ledger of a delivery is added up (and emitted, so the UI can show it).
    _landContract(p, del) {
      const P = this.path, D = this.mapDials;
      const ledger = { value: del.value, pct: del.pct, consigned: !!del.consigned, domestic: !!del.domestic, points: 1, toll: 0, tollTo: null,
        contractPoints: 0, megaTo: null };
      if (del.consigned) {
        this.pathStats.landed++;
        p.contractsLanded = (p.contractsLanded || 0) + 1;
        // DECISIONS-0928 CORE-018 middles: ▰ on every Nth contract only; and/or BUILD credit that
        // spends on a megastructure but never reaches the verdict. Defaults (every 1, credit 0) = as before.
        const every = Math.max(1, this.pathDial('CONSIGN_POINTS_EVERY') || 1);
        ledger.contractPoints = (p.contractsLanded % every === 0) ? (this.pathDial('CONSIGN_POINTS') || 0) : 0;
        const credit = this.pathDial('CONSIGN_BUILD') || 0;
        if (credit) { p.buildCredit = (p.buildCredit || 0) + credit; ledger.buildCredit = credit; }
        if (this.path.supply === 'cargo') this._supply(p, this.pathDial('CONTRACT_LOAD') || 0, 'backhaul');
        if (ledger.contractPoints) { p.control += ledger.contractPoints; ledger.points += ledger.contractPoints; this.pathStats.contractPoints += ledger.contractPoints; }
      } else if (del.domestic) this.pathStats.domestic++;
      else this.pathStats.dumped++;
      // THE TOLLBOOTH (THE-CONTROL-LAYER §2: "a cut of every rival barrel moved through it")
      if (P.toll) {
        const own = this.ownerOf(p.at);
        const q = own && own !== p.name ? this.players.find(z => z.name === own) : null;
        if (q) {
          const toll = Math.round(del.value * this.pathDial('TOLL_PCT') / 100);
          p.value -= toll; q.value += toll;
          ledger.toll = toll; ledger.tollTo = q.name;
          this.pathStats.tolls++; this.pathStats.tollPaid += toll;
          this.emit('toll', { player: p.name, to: q.name, at: p.at, paid: toll });
        }
      }
      // MEGASTRUCTURE POINTS (CONCEPT): a contract landed AT a structure scores its builder
      const MP = OilGame._mapFX(), pl = MP.BY[p.at];
      if (P.mega && del.consigned && pl && pl.kind === 'built') {
        const own = this.ownerOf(p.at), q = own ? this.players.find(z => z.name === own) : null;
        const pts = this.pathDial('MEGA_POINTS') || 0;
        if (q && pts) { q.control += pts; ledger.megaTo = q.name; this.pathStats.megaPoints += pts; }
        this.pathStats.megaLandings++;
      }
      if (P.mega && del.consigned && pl && pl.kind !== 'built' && this.structureOwner.SPACE_ELEVATOR === p.name
          && this.market.indexOf(p.at) < 0 && p.consignedTo !== p.at) this.pathStats.bypass++;
      // the contract is discharged; the market refills / the seat takes its next
      if (P.mode === 'market') {
        if (del.consigned) {
          const i = this.market.indexOf(p.at);
          if (i >= 0) this.market.splice(i, 1);
          else if (this.market.length) this.market.shift();   // the Elevator's bypass takes the oldest
          this._fillMarket();
        }
      } else this._consign(p);
      this.emit('landed', Object.assign({ player: p.name, at: p.at }, ledger));
      return ledger;
    }
    // what a delivery HERE would pay this seat, itemised — for the human prompt (no side effects)
    previewDelivery(p) {
      const del = this._deliveryValue(p);
      const out = { value: del.value, pct: del.pct, consigned: !!del.consigned, domestic: !!del.domestic, points: 1, toll: 0, tollTo: null,
        contractPoints: 0, squeezed: del.squeezed, premium: del.premium, longWay: del.longWay, incursion: !!del.incursion };
      if (this.path) {
        if (del.consigned) {
          const every = Math.max(1, this.pathDial('CONSIGN_POINTS_EVERY') || 1);
          out.contractPoints = ((p.contractsLanded || 0) + 1) % every === 0 ? (this.pathDial('CONSIGN_POINTS') || 0) : 0;
          out.points += out.contractPoints;
        }
        if (this.path.toll) { const own = this.ownerOf(p.at); if (own && own !== p.name) { out.toll = Math.round(del.value * this.pathDial('TOLL_PCT') / 100); out.tollTo = own; } }
      }
      return out;
    }

    _deliveryValue(p) {
      const MP = OilGame._mapFX(), D = this.mapDials;
      if (!this.map) return { value: this.price, pct: 100 };
      const t = this._trafficAt(p.at);
      // THE TRANSFER. A shut gate makes freight scarce, so every cargo that can
      // still move is worth more (the premium) — while every route shut at YOUR
      // node cuts what you can move at all (the squeeze). The same closure pays
      // one seat and strangles another. That is the whole geography of the game.
      const shut = Math.min(D.FREIGHT_CAP, Object.keys(this.mapState.closed).length);
      const premium = shut * D.FREIGHT_PCT;
      let pct = 100 + premium - D.BLOCK_PCT * t.blocked;
      const squeezed = t.blocked > 0;
      if (p.longWay) pct += D.LONGWAY_PCT;
      pct = Math.max(D.BLOCK_FLOOR, pct);
      // you cannot ship out of a field that is on fire
      if (this.crisis && this.burningAt(p.at)) pct = Math.round(pct * this.crisisDials.FIRE_DELIVERY / 100);
      const place = MP.BY[p.at];
      // ONSHORE GROUND PAYS A LITTLE BETTER — it is domestic. Nothing is shipped, no freight is
      // bought, no strait can be shut on you. That is exactly why it is tempting, and exactly why
      // the harm lands on people instead of on cargo: the cheap barrel is the one pulled out from
      // under somebody's house. The bill arrives as HEAT on that place (crisisDials.HEAT_ONSHORE),
      // not as a worse price. See docs/THE-CONTROL-LAYER.md §4.
      if (place && place.kind === 'onshore') pct += D.ONSHORE_PCT;
      // CONSIGNED CARGO (model): the buyer is where the money is. Land it and you are paid for
      // the voyage; dump it anywhere else and you take what the spot market will give you. This
      // is the whole experiment — it turns 'sell' into 'arrive'.
      let consigned = null;
      const buyers = this.consign ? this.buyersFor(p) : [];
      const domestic = this.path ? this.domesticAt(p.at) : false;
      if (buyers.length) {
        consigned = buyers.indexOf(p.at) >= 0;
        if (consigned) pct = pct + D.CONSIGN_BONUS;
        else if (!domestic) pct = Math.round(pct * D.CONSIGN_DUMP / 100);   // domestic ground is not a dump
      }
      let incursion = null;
      if (place && place.kind === 'hq' && place.code !== this.hqOf(p)) {
        pct += D.INCURSION_BONUS;
        incursion = this.seatAtHQ(place.code, p);
      }
      // OIL LEVELS 'voyage': the cargo is paid by the deepest level its voyage reached
      if (this.levels === 'voyage') pct += this.lvDials.VOY_PCT[(p.voyLevel || 1) - 1] || 0;
      return { value: Math.max(0, Math.round(this.price * pct / 100)), pct, squeezed, incursion,
        blocked: t.blocked, premium, longWay: !!p.longWay, consigned, domestic };
    }

    // ========================================================================
    // THE TABLE — negotiation / table politics (optional; opts.deals).
    // Deal SHAPES live in src/oil-deals.js (dials + verbs, like the card layer);
    // the RULES below are the engine's: what a deal may touch, how it lapses, what
    // betrayal costs, and how a grudge retargets the E.D.D. strike.
    // INVARIANTS (gated in scripts/oil-lab-check.js LAB 6 + oil-sweep.js PART 6):
    //   no deal touches this.oil, and no deal touches this.price.
    // ========================================================================
    dealBetween(a, b) { return this.standing.find(d => (d.a === a && d.b === b) || (d.a === b && d.b === a)) || null; }
    standingFor(p) { return this.standing.filter(d => d.a === p || d.b === p); }
    partnersOf(p) { return this.standingFor(p).map(d => (d.a === p ? d.b : d.a)); }
    // who wears it: the biggest operator at the table who is not one of the two parties.
    scapegoatFor(a, b) {
      const pool = this.players.filter(q => q !== a && q !== b);
      if (!pool.length) return null;
      return pool.reduce((x, y) => (x.control > y.control ? x : (y.control > x.control ? y : (x.holdings(this.price) >= y.holdings(this.price) ? x : y))));
    }

    // upkeep: standing deals pay out, then age. A deal that runs its life LAPSES
    // cleanly — no betrayal mark. Only walking away early is betrayal.
    _dealUpkeep(p) {
      const TY = OilGame._dealsFX().TYPES || {};
      for (const d of this.standingFor(p)) {
        const t = TY[d.type];
        if (t && t.tick) { t.tick(this, d); this.dealStats.ticks++; this.emit('deal_tick', { dealType: d.type, a: d.a.name, b: d.b.name }); }
        d.ticks--;
        if (d.ticks <= 0) {
          this.standing = this.standing.filter(x => x !== d);
          this.dealStats.lapsed++;
          this.emit('deal_end', { dealType: d.type, a: d.a.name, b: d.b.name, how: 'lapsed' });
        }
      }
    }

    _breakDeal(d, breaker) {
      const TY = OilGame._dealsFX().TYPES || {}, D = this.dealDials;
      const victim = breaker === d.a ? d.b : d.a;
      const t = TY[d.type];
      const spoils = (t && t.broke) ? (t.broke(this, d, breaker) || {}) : {};
      breaker.exposure += D.BETRAY_HEAT;                 // it is on the record
      if (!victim.grudges.includes(breaker.id)) victim.grudges.push(breaker.id);
      this.standing = this.standing.filter(x => x !== d);
      this.dealStats.broken++;
      this.emit('deal_break', Object.assign({ dealType: d.type, by: breaker.name, on: victim.name }, spoils));
    }

    // "Hobbesian" / any card that dissolves the table at once.
    breakAllDeals(cause) {
      if (!this.deals) return 0;
      const all = this.standing.slice();
      all.forEach(d => this._breakDeal(d, d.a));         // the offerer is the one who walks
      if (all.length) this.emit('deal_purge', { cause: cause || 'the war of all against all', n: all.length });
      return all.length;
    }

    // FOLD 3 (2026-09-01): the deck you draw from is WHERE YOU LANDED, not a rotation
    // keyed off the turn counter. The old rule had no fiction and could not be said in
    // a sentence; this one ties the cards to the map and explains itself:
    //   an HQ deals DEEDS · open water deals FREEDOM/MARKET · a gate deals COMPETITION
    _deckFor(p) {
      const ROT = ['DEEDS', 'FREEDOM-MARKET', 'COMPETITION'];
      if (!this.map) return ROT[(this.turn - 1) % 3];      // map off -> baseline untouched
      if (this.momentum && p.under) return 'FREEDOM-MARKET';   // open water deals the market's news
      const kind = (OilGame._mapFX().BY[p.at] || {}).kind;
      if (kind === 'hq') return 'DEEDS';
      if (kind === 'gate') return 'COMPETITION';
      return 'FREEDOM-MARKET';
    }

    // THE TABLE — ONE action per turn (FOLD 4, 2026-09-01).
    // Cards and deals used to be two phases that both fired every single turn. They
    // are now one: you draw where you landed, then you either PLAY THE CARD or OPEN
    // NEGOTIATIONS — never both. That is not merely fewer prompts; it is a real
    // tension, because the card in your hand now competes with the deal on the table.
    async _tablePhase(p) {
      const REG = OilGame._dealsFX(), TY = REG.TYPES || {};

      // 1. upkeep and the draw — neither of these is a decision
      if (this.deals) { this._dealUpkeep(p); if (this.dealFreeze > 0) this.dealFreeze--; }
      // MOMENTUM: at sea, only an EVENT space dealt (SEA_DRAW 'event', rounds 4–7); round 8 cut the event
      // spaces and the exception with them — 'always': one card a turn, at sea from the market deck
      if (this.cards && !(this.momentum && p.under && !p._eventDraw && this.momDials.SEA_DRAW === 'event')) {
        if (this.momentum) p._eventDraw = false;
        const dk = this._deckFor(p);
        const drawn = this.drawCard(dk);
        if (drawn) { p.hand.push(drawn); this.emit('drawcard', { player: p.name, card: drawn, deck: dk }); }
        if (p.hand.length > 3) {
          const dropped = p.hand.shift();
          const FX = OilGame.CARD_FX || (typeof global !== 'undefined' && global.OIL_CARD_FX) || {};
          (this.discards[(FX[dropped] || {}).deck] || []).push(dropped);
        }
      }

      // 2. ONE menu, ONE decision
      const cards = this.cards ? p.hand.slice().concat(this.disputes ? (p.disputes || []) : []) : [];
      const moves = (this.deals && REG.dealMoves) ? REG.dealMoves(this, p) : [];
      if (!cards.length && !moves.length) return;
      const options = cards.concat(moves, ['pass']);
      const pick = await this.ask(p, 'table', options, { cards, moves });

      // 3. dispatch
      if (!pick || pick === 'pass') return;
      if (cards.indexOf(pick) >= 0) {                       // ...you played the card
        if (this.disputes && (p.disputes || []).indexOf(pick) >= 0) { p.disputes.splice(p.disputes.indexOf(pick), 1); this.disputeStats.played++; }
        else p.hand.splice(p.hand.indexOf(pick), 1);
        this.playCard(pick, p);
        return;
      }
      if (!this.deals || !REG.parseMove) return;
      const mv = REG.parseMove(this, pick);
      if (!mv) return;
      if (mv.snare) { this.setSnare(p, mv.target); return; }   // ...you laid a trap (THE PRIVILEGE)
      if (mv.breakUid !== undefined) {                      // ...you walked out
        const d = this.standing.find(x => String(x.uid) === mv.breakUid);
        if (d) this._breakDeal(d, p);
        return;
      }
      const b = mv.target, type = mv.type;                  // ...you made an offer
      if (!b || b === p || !TY[type] || !TY[type].ok(this, p, b)) return;
      const d = { uid: ++this._dealUid, type, a: p, b, ticks: this.dealDials.LIFE, paid: 0, carried: 0 };
      this.dealStats.offers++;
      this.emit('deal_offer', { dealType: type, a: p.name, b: b.name });
      const reply = await this.ask(b, 'dealoffer', ['accept', 'decline'], { deal: d });
      if (reply !== 'accept') { this.dealStats.declined++; this.emit('deal_declined', { dealType: type, a: p.name, b: b.name }); return; }
      TY[type].form && TY[type].form(this, d);
      if (TY[type].standing) this.standing.push(d);
      this.dealStats.formed++;
      this.emit('deal_formed', { dealType: type, a: p.name, b: b.name, standing: !!TY[type].standing, victim: d.victim || null });
    }

    // ---- one active turn = ONE 3-die roll, read on two layers ----------------
    async step() {
      if (this.done) return;
      const D = this.dials, p = this.players[this.idx];
      this._oilMark = this.oil;
      this.turn++;
      if (this.levels) this._lvUpkeep(p);                               // OIL LEVELS: the licence
      if (this.idx === 0 && this.privilege) this._govTick();          // THE PRIVILEGE: wartime requisitions
      if (this.idx === 0) { this.round++; this._settleControl(); if (this.path && this.path.shut) this._shutShape(); if (this.path && this.path.supply === 'produce') this._produceRound(); }

      // THE DISPUTE DECK: the claims on you are answered before you throw (when they would bite)
      if (this.disputes) await this._disputePhase(p);
      // 1. roll the three core bodies (Supply / Weather / World) off the faces table
      let dice = [rollFace(this.rng, D.DIE_FACES), rollFace(this.rng, D.DIE_FACES), rollFace(this.rng, D.DIE_FACES)];
      // THE PRIVILEGE: the same three dice off the same RNG; only WHO HOLDS each body changes.
      if (this.privilege) dice = this._privilegeRoll(p, dice);
      this.lastDice = dice.slice();

      // 2. three-body read (shared market) — provisional shove
      this.lastShove = shoveOf(dice, D.SHOVE_W);

      // 3. personal layer: the active player may spend a pip to flip the shove sign.
      //    FOLD (2026-09-01): only when the roll is already CHAOTIC. You can only
      //    bend a market that is already moving — and it makes pips precious
      //    instead of a prompt you answer every single turn.
      // THE PRIVILEGE: the flip belongs to whoever holds the MIDDLE body — the one the read
      // bends on (weight -2). Same prompt, same kind; it may simply be somebody else's to answer.
      let bender = p;
      if (this.privilege && this.privDials.PRIV_BEND && Math.abs(this.lastShove) >= D.T_CHAOS) {
        if (this._turnSeizer && this.privDials.SEIZE_BEND === 'always') bender = this._turnSeizer;   // SEIZE
        else {
          const mo = this._medianOwner(dice, p);
          bender = (mo.idx === this._tolledIdx && this._turnToller) ? this._turnToller : mo.seat;   // TOLL / house / state
        }
        if (bender !== p) this.privStats.bendLost++;
      }
      if (bender && bender.pips > 0 && Math.abs(this.lastShove) >= D.T_CHAOS) {
        const choice = await this.ask(bender, 'slingshot', ['flip', 'keep'], bender !== p ? { forSeat: p.name, how: bender === this._turnSeizer ? 'seize' : bender === this._turnToller ? 'toll' : 'steward' } : undefined);
        if (choice === 'flip') {
          bender.pips--;
          if (this.privilege) {
            const S = this.privStats;
            if (bender === p) S.bendOwn++;
            else if (bender === this._turnSeizer) S.seizerBends++;
            else if (bender === this._turnToller) S.tollBends++;
            else S.bendSteward++;
          }
          // THE SLINGSHOT FLIPS (Joe 2026-10-23): turn all three dice upside down. A d6's opposite
          // faces sum to 7, so the read a - 2b + c comes out exactly negated — same size, other way.
          // (Was: bump the median die 1 toward zero, which only cut the shove by 2.) Spread is
          // unchanged, so momentum is too; the weather die reads its underside like any other body.
          const fMin = Math.min.apply(null, D.DIE_FACES), fMax = Math.max.apply(null, D.DIE_FACES);
          for (let i = 0; i < dice.length; i++) dice[i] = fMin + fMax - dice[i];
          this.lastDice = dice.slice();
          this.lastShove = shoveOf(dice, D.SHOVE_W);
          this.emit('slingshot', bender === p ? { player: p.name } : { player: bender.name, forSeat: p.name,
            how: bender === this._turnSeizer ? 'seize' : bender === this._turnToller ? 'toll' : 'steward' });
        }
      }
      // PIP REGEN (Joe 2026-10-23): every 3rd turn of YOUR OWN, not every 3rd turn of the table —
      // at six seats the table count left four companies (seat 1 included) never regaining one.
      // Tops up to the starting count; never trims a company that started above it.
      p.ownTurns = (p.ownTurns || 0) + 1;
      if (p.ownTurns % D.PIP_REGEN_EVERY === 0 && p.pips < DIALS.PIPS_START) p.pips++;

      // 4. apply shove to the shared price; add the scarcity premium; set the era.
      //    era reads VOLATILITY (|shove|) only — scarcity moves the LEVEL, not the era.
      let next = this.price + this.lastShove;
      this.scarcity = this.oil <= D.SCARCITY_BAND ? Math.ceil((D.SCARCITY_BAND - this.oil) / D.SCARCITY_DIV) : 0;
      next += this.scarcity;
      // (THE RATCHET was built here and REMOVED — see the RATCHET_* dials for why.)
      this.price = Math.max(D.PRICE_MIN, Math.min(D.PRICE_MAX, next));
      this.era = Math.abs(this.lastShove) >= D.T_CHAOS ? 'CHAOTIC' : 'STABLE';
      this.emit('market', { dice: this.lastDice, shove: this.lastShove, scarcity: this.scarcity, price: this.price, era: this.era });
      if (this.privilege) this._pirateTick();

      // 5. GREEN ANDERS die (expansion) — trigger-only override, no new meter.
      //    Trigger: a CHAOTIC era hidden-layer intervention. Overrides via the
      //    existing numbers (re-rolls the shove into the price; can deepen a swing).
      if (this.expansion && this.era === 'CHAOTIC') {
        const g = this.rng.d6();                    // the green die
        if (g >= D.GREEN_TRIGGER) {                 // default >=5 (~1/3): Anders intervenes
          const inj = (this.lastShove >= 0 ? 1 : -1) * Math.ceil(g / 2);
          this.price = Math.max(D.PRICE_MIN, Math.min(D.PRICE_MAX, this.price + inj));
          this.emit('green', { player: p.name, die: g, inject: inj, price: this.price });

          // ...and on the TOP FACE it does not merely shove the tape — it takes something, from
          // one named seat. Aimed at the leader by holdings: the house leans on whoever is winning.
          if (g >= D.GREEN_PUNITIVE_AT) this._andersPunish();
          if (this.privilege && this.privDials.ANDERS_ROLE === 'hand') this._andersHand();   // ROUND 9 prototype
        }
      }

      // 5.4 FACTION POWER (optional asymmetry): the active player's once-per-turn
      //     passive. Law-safe (never adds oil); runs before E.D.D. arming so a
      //     faction's price/era nudge (e.g. Haddad steadying the tape) is read.
      this._factionPassive(p);

      // 5.45 THE MAP (optional): the same three bodies that moved the price also
      //      say how far the world moved. Sail, and find out what the sea is doing.
      if (this.map) await this._mapPhase(p);
      if (this.levels) this._lvApply(false);

      // 5.5 THE TABLE (optional): draw where you landed, then take ONE action —
      //     play the card, or open negotiations. Never both (FOLD 4). Neither cards
      //     nor deals ever add oil, so the collapse clock stays reachable.
      if (this.cards || this.deals) await this._tablePhase(p);
      if (this.levels) this._lvApply(false);

      // 6. movement / HQ pressure: act, or take the hold penalty (always move)
      //    With THE MAP on you can only sell where there is somebody to sell to —
      //    an HQ. Mid-ocean you are IN TRANSIT: no claim, and no idleness penalty,
      //    because a hull under way is not a hull sitting still. That is exactly
      //    what a shut canal costs you: turns, and turns are oil.
      if (this.map && ((this.momentum && p.under) || !(this.atHQ(p) || (this.path && (this.sellableAt(p.at) || this.domesticAt(p.at)))))) {
        this.mapStats.atSea++;
        this.emit('intransit', { player: p.name, at: p.at, place: (OilGame._mapFX().BY[p.at] || {}).name });
      } else {
        const acts = ['claim', 'hold'];
        if (this.canBuild(p)) acts.push('build');
        // IWS rides HERE, on the step that already asks a question — you pay
        // instead of selling. Never a new prompt (docs/THE-FOLDS.md budget).
        if (this.canCallIWS(p)) acts.push('iws');
        if (this.canRetain(p)) acts.push('retainer');
        if (this.crisis && this.crisisDials.RETAINER_MODE === 'rider' && this.canRide(p)) acts.push('cover');   // R2: sell + cover, same prompt
        const act = await this.ask(p, 'action', acts);
        if (act === 'iws' && this.canCallIWS(p)) { this.callIWS(p); }
        else if (act === 'retainer' && this.canRetain(p)) { this.buyRetainer(p); }
        else if (act === 'build' && this.canBuild(p)) {
          const opts = this.buildable();
          const pick = opts.length === 1 ? opts[0] : await this.ask(p, 'structure', opts);
          const raised = opts.indexOf(pick) >= 0 ? pick : opts[0];
          if (this.build(raised)) {
            let cost = this.mapDials.BUILD_COST;
            if (this.path && p.buildCredit) { const c = Math.min(p.buildCredit, cost); p.buildCredit -= c; cost -= c; }   // credit spends first
            p.control -= cost; p.exposure += this.mapDials.BUILD_HEAT;
            if (this.path) this._raisedOnPath(p, raised);   // THE PATH: you raised it, you own it
          }
        } else
        if ((act === 'claim' || act === 'cover') && p.barrels >= D.CLAIM_COST) {
          const riding = act === 'cover' && this.canRide(p);
          const del = this._deliveryValue(p);
          p.barrels -= D.CLAIM_COST; p.control += 1;
          p.value += del.value;                      // sell a barrel into the market
          if (p._requisition && p._requisition.cause === 'anders' && this.privDials.ANDERS_ROLE === 'hand') {   // ROUND 9: the firm skims
            const cut = Math.min(p.value, Math.round(del.value * this.privDials.TOLL_CUT / 100)); p.value -= cut; this._aStat('skim', cut); }
          if (this._turnToller) this._tollSale(p, del.value);   // THE PRIVILEGE (toll): you did the work
          // ...and that sale is your claim on the ground. THE PATH: a landed contract is a cargo
          // of record, and may count for more on the station meter (CONSIGN_THROUGHPUT).
          this._addThroughput(p, p.at, (this.path && del.consigned) ? this.pathDial('CONSIGN_THROUGHPUT') : D.CLAIM_COST);
          if (this.path) {
            if (del.consigned) this.mapStats.consignHit = (this.mapStats.consignHit || 0) + 1;
            else if (del.domestic) this.mapStats.consignDomestic = (this.mapStats.consignDomestic || 0) + 1;
            else this.mapStats.consignDump = (this.mapStats.consignDump || 0) + 1;
            del.ledger = this._landContract(p, del);
          } else
          if (this.consign) {                          // the contract is discharged; take the next
            if (del.consigned) this.mapStats.consignHit = (this.mapStats.consignHit || 0) + 1;
            else this.mapStats.consignDump = (this.mapStats.consignDump || 0) + 1;
            this._consign(p);
          }

          // ...and if that ground is ONSHORE, working it is what poisons it. No gate has to shut
          // and no war has to start — this is the ordinary business of production doing the harm.
          const _MP = OilGame._mapFX();                 // step() has no MP of its own
          if (this.crisis && _MP.BY && (_MP.BY[p.at] || {}).kind === 'onshore') {
            this.addHeat(p.at, this.crisisDials.HEAT_ONSHORE, 'production on the ground');
            this.mapStats.onshoreWorked = (this.mapStats.onshoreWorked || 0) + 1;
          }
          if (this.map) {
            if (del.squeezed) this.mapStats.squeezed++;
            if (del.premium > 0) this.mapStats.premiums++;
            if (del.incursion) {
              this.mapStats.incursions++;
              p.exposure += this.mapDials.INCURSION_HEAT;
              del.incursion.exposure += this.mapDials.INCURSION_HIT;
              this.emit('incursion', { player: p.name, on: del.incursion.name, at: p.at });
              this.addHeat(p.at, this.crisisDials.HEAT_INCURSION, 'an incursion');
            }
            this.emit('deliver', { player: p.name, at: p.at, value: del.value, pct: del.pct,
              blocked: del.blocked, premium: !!p.longWay });
          }
          if (riding && p.value >= this.crisisDials.RETAINER_COST) this._rideCover(p);   // R2 THE RIDER: cover off the top of the sale
        } else {
          // FOLD 1 (2026-09-01): ONE idleness rule. You are idle only if you neither
          // MOVED nor SOLD this turn — "move or sell". Before this, a seat that stayed
          // put and then held was billed twice for the same act of doing nothing
          // (it fired on ~10% of turns). "Always move or suffer" survives intact:
          // moving still exempts you, and moving still costs you the sale.
          // MOMENTUM: camping's DEMURRAGE is the idleness charge (it was billed at the move) — one
          // rule, never two (FOLD 1's own lesson)
          if (!this.momentum && (!this.map || !p.moved)) p.exposure += D.HOLD_PENALTY;
        }
      }

      if (this.heg2) this._hegTick(p);                // HEGEMONY: a collection is read at the end of your turn

      // 7. DEPLETE the monotonic oil clock (this is what guarantees terminus)
      //    LIVE INVARIANTS for the map: nothing may ever ADD oil, and the 8 HQs
      //    must stay mutually reachable. Recorded, then gated in LAB 8 / PART 7.
      if (this.map) {
        if (this.oil > this._oilMark) this._oilAdded = (this._oilAdded || 0) + 1;
        const MP = OilGame._mapFX();
        if (MP.hqsConnected && !MP.hqsConnected(this.mapState)) this._hqSplit = (this._hqSplit || 0) + 1;
      }
      const fire = this._fireBurn();
      const burn = D.BURN_BASE + Math.floor(this.price / D.BURN_PER_PRICE) + fire;
      this.oil = Math.max(0, this.oil - burn);
      this.emit('deplete', { oil: this.oil, burn, fire });

      // 7.5 BENCHMARK rubber band (Charter L3): the control leader carries danger by
      //     rule — +1 exposure each turn. Off in classic. Leading is never free.
      if (this.rubberBand) {
        const lead = Math.max(...this.players.map(q => q.control));
        if (lead > 0) this.players.filter(q => q.control === lead).forEach(q => { q.exposure += 1; });
      }

      // 8. arm E.D.D.? (price+instability, OR oil backstop)
      const annihilation = this.crisis && this.totalHeat() >= this.crisisDials.ANNIHILATION_AT;
      if (!this.edd && (annihilation || (this.price >= D.EDD_PRICE && this.era === 'CHAOTIC') || this.oil <= D.EDD_OIL)) {
        this.edd = true;
        if (annihilation) this.crisisStats.annihilation++;
        this.end_reason = annihilation ? 'E.D.D. — too much of the world on fire'
          : this.oil <= D.EDD_OIL ? 'E.D.D. — the oil ran out' : 'E.D.D. — price + instability';
        this.emit('edd_begin', { reason: this.end_reason, price: this.price, oil: this.oil });
        this._andersDebtDue();
      }

      // 9. if E.D.D. is live, this player resolves a predatory roll
      if (this.edd) await this._resolveEDD(p);

      if (this.levels) this._lvApply(true);           // OIL LEVELS: falls land at the end of the turn

      // 10. advance / end
      this.idx = (this.idx + 1) % this.players.length;
      if (this.oil <= 0 || this.turn >= this.maxTurns) this._end();
    }

    // THE PRIVILEGE, at the roll. Bodies 0..k-1 are yours (Supply, Weather, World in that
    // order — model A makes them interchangeable, so WHICH is cosmetic and nobody is asked).
    _privilegeRoll(p, dice) {
      const D = this.privDials, S = this.privStats;
      if (D.ANDERS_ROLE === 'books' && this.expansion) this._andersBooks(p);   // ROUND 9 prototype
      const k = this.privilegeOf(p);
      const was = p.privilege == null ? 3 : p.privilege;
      if (k < was) { S.drops++; this.emit('privilege', { player: p.name, from: was, to: k, cause: D.PRIV_MEASURE }); }
      else if (k > was) { S.restores++; this.emit('privilege', { player: p.name, from: was, to: k, restored: true }); }
      p.privilege = k;
      p._privExp = (p._transit || p._requisition) ? this.privilegeBase(p) : k;   // reach reads THIS (L4)
      if (p._transit && D.PRIV_WATER) S.waterRolls = (S.waterRolls || 0) + 1;
      p.privTurns = p.privTurns || { 1: 0, 2: 0, 3: 0 };
      p.privTurns[k]++; S.turns[k]++;
      if (p.privMin == null || k < p.privMin) p.privMin = k;
      p._privMark = p.exposure;                      // 'recent' reads from here next round
      const owner = [p, p, p];
      if (k < 3) {
        if (D.PRIV_WHO === 'held') {
          // nobody rolls them: the bodies you cannot touch stay as the table left them. You
          // re-roll the ones that have stood longest, so every body is refreshed in time.
          if (!this._held) this._held = dice.slice();
          const order = [0, 1, 2].sort((a, b) => (this._heldAge[b] - this._heldAge[a]) || (a - b));
          const mine = order.slice(0, k);
          for (let i = 0; i < 3; i++) {
            if (mine.indexOf(i) >= 0) { this._heldAge[i] = 0; }
            else { dice[i] = this._held[i]; this._heldAge[i]++; owner[i] = null; S.heldBodies++; }
          }
        } else if (D.PRIV_WHO === 'steward') {
          const st = this.stewardFor(p);
          for (let i = k; i < 3; i++) owner[i] = st;
          S.stewardRolls += 3 - k;
          this.emit('steward', { player: p.name, steward: st && st.name, bodies: 3 - k });
        } else {
          for (let i = k; i < 3; i++) owner[i] = null;          // 'house': thrown, owned by nobody
        }
      } else if (D.PRIV_WHO === 'held') { this._heldAge = [0, 0, 0]; }
      if (D.PRIV_WHO === 'held') this._held = dice.slice();
      this.diceOwner = owner;
      this._rivalClaims(p, k, was);
      return dice;
    }

    // ---- THE DISPUTE DECK (round 5) -----------------------------------------------------------
    static get DISPUTE_CARDS() { return ['Leviathan Knows', 'Boots On The Ground', 'Dog-Wagged', 'Strait Flush',
      "I've Travelled Across For You", 'Oligarcheology', 'Rogue Wave']; }
    _dealDisputes() {
      const names = OilGame.DISPUTE_CARDS;
      if (this.decks) for (const dk in this.decks) this.decks[dk] = this.decks[dk].filter(n => names.indexOf(n) < 0);   // out of the main decks
      this.disputeDeck = this.rng.shuffle(names.slice());
      this.players.forEach(p => { p.disputes = []; this._drawDispute(p, 'dealt'); });
    }
    _drawDispute(p, why) {
      if (!this.disputes || !this.disputeDeck.length || (p.disputes || []).length >= this.privDials.DISPUTE_HAND) return null;
      const c = this.disputeDeck.shift(); p.disputes.push(c); if (why !== 'dealt') this.disputeStats.drawn++;
      this.emit('dispute_draw', { player: p.name, why }); return c;
    }
    // the claims standing on this seat that have not yet been answered
    _openClaims(p) {
      const out = [], D = this.privDials;
      const sz = this.seized[p.id]; if (sz && !sz.answered) out.push({ kind: 'seize', by: sz.by, cause: sz.cause, ref: sz });
      const tl = this.tolls[p.id]; if (tl && !tl.answered) out.push({ kind: 'toll', by: tl.by, cause: tl.cause, ref: tl });
      const rq = p._requisition; if (rq && !rq.answered) out.push({ kind: rq.cause === 'pirates' ? 'pirates' : 'requisition', by: rq.by || null, cause: rq.cause, ref: rq });
      if (D.PRIV_WATER === 'dues' && p._transit && p._duesAnswered !== p._transit) { const w = this.gateWarden(p._transit, p); if (w) out.push({ kind: 'dues', by: w, cause: p._transit, ref: null }); }
      return out;
    }
    // a contest is settled WITH THE THREE BODIES: each side throws the bodies its privilege holds (the
    // house throws all three); the highest face wins. A tie goes to the firm — the green die.
    _settleDispute(def, by) {
      const kd = this.privilegeBase(def), kb = by ? this.privilegeBase(by) : 3;
      const throwN = n => Array.from({ length: n }, () => rollFace(this.rng, this.dials.DIE_FACES));
      const a = throwN(kd), b = throwN(kb), ma = Math.max.apply(null, a), mb = Math.max.apply(null, b);
      let won = ma > mb, anders = null;
      if (ma === mb) {
        this.disputeStats.ties++;
        if (this.expansion && this.privDials.ANDERS_ARBITER) { anders = this.rng.d6(); won = anders >= this.dials.GREEN_TRIGGER; if (won) this.disputeStats.andersDefender++; }
        else won = false;
      }
      return { won, def: a, by: b, anders };
    }
    async _disputePhase(p) {
      const claims = this._openClaims(p);
      for (const c of claims) {
        this.disputeStats.claims++;
        let contested = false, stood = true;
        if ((p.disputes || []).length) {
          const opts = ['accept'].concat(p.disputes.map(n => 'CONTEST:' + n));
          const pick = await this.ask(p, 'dealoffer', opts, { dispute: { kind: c.kind, by: c.by && c.by.name, cause: c.cause } });
          if (typeof pick === 'string' && pick.indexOf('CONTEST:') === 0 && p.disputes.indexOf(pick.slice(8)) >= 0) {
            const card = pick.slice(8); p.disputes.splice(p.disputes.indexOf(card), 1); this.disputeDeck.push(card);
            contested = true; this.disputeStats.contested++;
            const r = this._settleDispute(p, c.by);
            this.emit('dispute', { player: p.name, against: c.by ? c.by.name : 'the house', kind: c.kind, cause: c.cause, card, won: r.won, def: r.def, by: r.by, anders: r.anders });
            if (r.won) {
              this.disputeStats.won++; stood = false;
              if (c.kind === 'seize') delete this.seized[p.id];
              else if (c.kind === 'toll') delete this.tolls[p.id];
              else if (c.kind === 'dues') p._duesVoid = p._transit;
              else p._requisition = null;
            } else this.disputeStats.lost++;
          }
        }
        if (c.ref) c.ref.answered = true; if (c.kind === 'dues') p._duesAnswered = p._transit;
        // a claim that stands sends you to the lawyers: draw a dispute card (the claimed-against get the ammunition)
        if (stood) this._drawDispute(p, 'claimed');
      }
    }
    // ---- PIRATES: the house boards a private ship in pirate water ----------------------------------
    _pirateWater(nodes, rids) {
      const D = this.privDials, MM = OilGame._momFX();
      if ((nodes || []).some(c => D.PIRATE_PLACES.indexOf(c) >= 0)) return true;
      const W = MM.PIRATE_WATERS || [], MP = OilGame._mapFX();
      return (rids || []).some(r => { const R = MP.ROUTES[r]; return R && W.indexOf(R[3]) >= 0; });
    }
    // the pirates' mood, read off the world: 'quiet' | 'awake' | 'severe'
    pirateMood() {
      if (!this.privilege || !this.privDials.PIRATES) return 'quiet';
      if (this.edd || this.wartime()) return 'severe';
      const MP = OilGame._mapFX(), shut = this.privDials.PIRATE_PLACES.some(c => this.mapState && this.mapState.closed[c]
        || (MP.ADJ[c] || []).some(r => (MP.BY[r.to] || {}).kind === 'gate' && this.mapState.closed[r.to]));
      if (this.era === 'CHAOTIC' || shut || (this._pirateAwakeUntil || 0) > this.round) return 'awake';
      return 'quiet';
    }
    _pirateHot() {
      if (!this.crisis) return false; const MP = OilGame._mapFX(), H = this.privDials.PIRATE_HOT;
      return this.privDials.PIRATE_PLACES.some(c => (this.heat[c] || 0) >= H || (MP.ADJ[c] || []).some(r => (this.heat[r.to] || 0) >= H));
    }
    _pirateTick() {                                            // once per turn, after the roll set the season
      if (!this.privilege || !this.privDials.PIRATES) return;
      if (this.era === 'CHAOTIC') this._pirateAwakeUntil = this.round + this.privDials.PIRATE_WAKE_ROUNDS;
      const m = this.pirateMood();
      if (m !== (this._pirateMoodWas || 'quiet')) this.emit('pirate_mood', { mood: m, was: this._pirateMoodWas || 'quiet' });
      this._pirateMoodWas = m;
      const S = this.privStats; S.moodTurns = S.moodTurns || { quiet: 0, awake: 0, severe: 0 }; S.moodTurns[m]++;
    }
    _pirateCheck(p, where, at) {
      const D = this.privDials;
      if (!this.privilege || !D.PIRATES || p._requisition) return false;
      // the state of the world decides whether anybody is out there tonight
      const mood = this.pirateMood();
      if (at == null) at = mood === 'severe' ? D.PIRATE_SEVERE_AT : mood === 'awake' ? D.PIRATE_AT : (this._pirateHot() ? D.PIRATE_AT : null);
      if (at == null) { this.privStats.pirateQuiet = (this.privStats.pirateQuiet || 0) + 1; return false; }
      if (D.PIRATE_HITS !== 'all' && this.alignmentOf(p) !== 'private') return false;
      const S = this.privStats; S.pirateWater = (S.pirateWater || 0) + 1;
      const t = this.rng.d6();                                 // THE HOUSE THROWS
      if (t < at) return false;
      p._requisition = { rolls: D.PIRATE_ROLLS, by: null, cause: 'pirates' };
      S.pirates = (S.pirates || 0) + 1;
      S.pirateByMood = S.pirateByMood || { quiet: 0, awake: 0, severe: 0 }; S.pirateByMood[mood]++;
      this.emit('pirates', { on: p.name, where, roll: t, rolls: D.PIRATE_ROLLS, mood, who: (OilGame._momFX().PIRATE_WHO || {})[where] || 'pirates' });
      return true;
    }

    // ---- WHEN A RIVAL GETS YOUR BODY (SEIZE / TOLL) — only by a specific trigger ------------
    _seizeOn() { const R = this.privDials.PRIV_RIVAL; return this.privilege && (R === 'seize' || R === 'both'); }
    _tollOn() { const R = this.privDials.PRIV_RIVAL; return this.privilege && (R === 'toll' || R === 'both'); }
    // a card or a sprung snare: a rival takes one of your missing bodies to throw
    seizeFrom(by, victim, cause) {
      if (!this._seizeOn() || !by || !victim || by === victim) return false;
      if (this.privilegeOf(victim) >= 3 || this.seized[victim.id]) return false;
      this.seized[victim.id] = { by, rolls: this.privDials.SEIZE_ROLLS, cause };
      this.privStats[cause === 'snare' ? 'seizeSnare' : (cause === 'arrest' || cause === 'EAT') ? 'seize_' + cause : 'seizeCard']
        = (this.privStats[cause === 'snare' ? 'seizeSnare' : (cause === 'arrest' || cause === 'EAT') ? 'seize_' + cause : 'seizeCard'] || 0) + 1;
      this.emit('seize', { player: by.name, on: victim.name, cause, rolls: this.privDials.SEIZE_ROLLS });
      return true;
    }
    // a card or a scapegoating: you will throw your own body, and a rival takes what it earns
    tollOn(by, victim, cause) {
      if (!this._tollOn() || !by || !victim || by === victim) return false;
      if (this.privilegeOf(victim) >= 3 || this.tolls[victim.id]) return false;
      this.tolls[victim.id] = { by, turns: this.privDials.TOLL_TURNS, cause };
      const ck = cause === 'scapegoat' ? 'tollScapegoat' : (cause === 'salvage' || cause === 'DIVIDE') ? 'toll_' + cause : 'tollCard';
      this.privStats[ck] = (this.privStats[ck] || 0) + 1;
      this.emit('claim_toll', { player: by.name, on: victim.name, cause, turns: this.privDials.TOLL_TURNS });   // not 'toll': THE PATH's tollbooth owns that event
      return true;
    }
    // THE SNARE — a trap laid on a rival from THE TABLE menu (no acceptance: a trap is not a deal)
    canSnare(a, b) {
      const D = this.privDials;
      return this._seizeOn() && !!a && !!b && a !== b && !this.snares[b.id] && !this.seized[b.id] && a.pips >= D.SNARE_PIP
        && !(this.deals && this.dealBetween(a, b));       // a standing deal shields you from your partner's trap
    }
    setSnare(a, b) {
      if (!this.canSnare(a, b)) return false;
      const D = this.privDials;
      a.pips -= D.SNARE_PIP; a.exposure += D.SNARE_HEAT;
      this.snares[b.id] = { by: a, life: D.SNARE_LIFE };
      this.privStats.snaresSet++;
      this.emit('snare', { player: a.name, on: b.name });
      return true;
    }
    // who is tolling this seat right now (a card / scapegoat toll, else the TRIBUTE it pays)
    _tollerOf(p, k) {
      if (!this._tollOn() || k >= 3) return null;
      const TF = this.privDials.TOLL_FORCE;                // LAB ONLY: a permanent toll
      if (TF && TF[p.id] != null && this.players[TF[p.id]] !== p) return { by: this.players[TF[p.id]], cause: 'lab' };
      const t = this.tolls[p.id];
      if (t) return t;
      if (this.deals) { const d = this.standing.find(x => x.type === 'TRIBUTE' && x.b === p); if (d) return { by: d.a, cause: 'tribute' }; }
      // TRANSIT DUES: the body you lost in the canal is thrown by you — and tolled by its warden
      if (this.privDials.PRIV_WATER === 'dues' && p._transit && p._duesVoid !== p._transit) { const w = this.gateWarden(p._transit, p); if (w) return { by: w, cause: 'dues', gate: p._transit }; }
      return null;
    }
    // at the victim's roll: spring / rust snares, apply and wear down seizures and tolls
    _rivalClaims(p, k, was) {
      const D = this.privDials, S = this.privStats, owner = this.diceOwner;
      this._turnSeizer = null; this._turnToller = null; this._tolledIdx = -1; this._govIdx = -1; this._turnGov = null;
      const sn = this.snares[p.id];
      if (sn) {
        if (k < was) { delete this.snares[p.id]; S.snaresSprung++; this.emit('snare_sprung', { player: sn.by.name, on: p.name });
          this.seizeFrom(sn.by, p, 'snare'); }
        else if (--sn.life <= 0) { delete this.snares[p.id]; S.snaresRusted++; this.emit('snare_rust', { player: sn.by.name, on: p.name }); }
      }
      let slot = k;                                      // the first missing body
      const force = D.SEIZE_FORCE && D.SEIZE_FORCE[p.id] != null ? this.players[D.SEIZE_FORCE[p.id]] : null;
      const sz = this.seized[p.id];
      if (k >= 3) {
        if (sz) { delete this.seized[p.id]; S.seizeEnds++; this.emit('seize_end', { player: sz.by.name, on: p.name, why: 'regained' }); }
        if (this.tolls[p.id]) { const t = this.tolls[p.id]; delete this.tolls[p.id]; this.emit('toll_end', { player: t.by.name, on: p.name, why: 'regained' }); }
        return;
      }
      if (force && force !== p) { owner[slot] = force; this._turnSeizer = force; slot++; S.seizedRolls++; p.seizedRolls = (p.seizedRolls || 0) + 1; }
      else if (sz) {
        owner[slot] = sz.by; this._turnSeizer = sz.by; slot++; S.seizedRolls++; p.seizedRolls = (p.seizedRolls || 0) + 1; this._ledger(sz.by, p, 'seize');
        if (--sz.rolls <= 0) { delete this.seized[p.id]; S.seizeEnds++; this.emit('seize_end', { player: sz.by.name, on: p.name, why: 'spent' }); }
      }
      const rq = p._requisition;
      if (rq && slot < 3) {                              // GOVERNMENT: the state's body
        owner[slot] = rq.by || null; this._govIdx = slot; slot++; S.govRolls = (S.govRolls || 0) + 1;
        if (rq.by) this._turnGov = rq.by;
        if (--rq.rolls <= 0) { p._requisition = null; this.emit('requisition_end', { on: p.name }); }
      }
      const tl = slot < 3 ? this._tollerOf(p, k) : null;
      if (tl) {
        owner[slot] = p; this._tolledIdx = slot; this._turnToller = tl.by; S.tollTurns++; p.tolledTurns = (p.tolledTurns || 0) + 1;
        if (tl.cause === 'tribute') S.tollTribute++;
        if (tl.cause === 'dues') { S.duesTurns = (S.duesTurns || 0) + 1; this.emit('dues', { player: tl.by.name, on: p.name, gate: tl.gate }); }
        this._ledger(tl.by, p, 'toll');
        if (tl.turns != null && --tl.turns <= 0) { delete this.tolls[p.id]; this.emit('toll_end', { player: tl.by.name, on: p.name, why: 'spent' }); }
      }
    }
    // who held whose dice, for the verdict
    _ledger(by, on, how) {
      if (!by || by === on) return;
      this.privLedger = this.privLedger || {};
      const key = by.name + '\u2192' + on.name;
      const r = this.privLedger[key] || (this.privLedger[key] = { by: by.name, on: on.name, seize: 0, toll: 0 });
      r[how]++;
    }
    // ---- GOVERNMENT SEIZURE — the walls closing in. Read off meters that already exist. ----------
    wartime() {
      if (!this.privilege || !this.privDials.GOV) return 0;
      const D = this.privDials;
      const l1 = (this.crisis && this.totalHeat() >= D.GOV_HEAT_AT) || (D.GOV_OIL_AT != null && this.oil <= D.GOV_OIL_AT);
      return (l1 ? 1 : 0) + (this.edd ? 1 : 0);
    }
    _govTarget() {
      const D = this.privDials;
      let pool = this.players.filter(q => !q._requisition && (D.GOV_HITS === 'all' || this.alignmentOf(q) === 'private'));
      if (!pool.length) return null;
      if (D.GOV_TARGET === 'exposed') return pool.reduce((a, b) => (b.exposure > a.exposure ? b : a));
      if (D.GOV_TARGET === 'hot' && this.crisis) return pool.reduce((a, b) => ((this.heat[b.at] || 0) > (this.heat[a.at] || 0) ? b : a));
      return pool.reduce((a, b) => (b.control > a.control || (b.control === a.control && b.holdings(this.price) > a.holdings(this.price)) ? b : a));
    }
    requisition(cause) {
      const D = this.privDials, v = this._govTarget();
      if (!v) return false;
      let by = null;
      if (D.GOV_WHO === 'state') {
        const st = this.players.filter(q => q !== v && this.alignmentOf(q) === 'state');
        if (st.length) {
          const MP = OilGame._mapFX();
          const dist = q => (this.map && MP.reach && v.at) ? ((MP.reach(v.at, 99, this.mapState).dist[this.hqOf(q)]) ?? 99) : 0;
          by = st.reduce((a, b) => (dist(b) < dist(a) ? b : a));
        }
      }
      v._requisition = { rolls: D.GOV_ROLLS, by, cause };
      const S = this.privStats; S.requisitions = (S.requisitions || 0) + 1;
      this.emit('requisition', { on: v.name, by: by && by.name, cause, level: this.wartime(), rolls: D.GOV_ROLLS });
      return true;
    }
    _govTick() {
      const lv = this.wartime();
      if (lv > (this._wartimeWas || 0)) this.emit('wartime', { level: lv, heat: this.crisis ? this.totalHeat() : null, oil: this.oil, edd: this.edd });
      this._wartimeWas = lv;
      const D = this.privDials;
      if (lv < (D.GOV_MIN_LEVEL || 1)) return;
      const n = D.GOV_PER_ROUND === 'level' ? lv : Math.min(lv, D.GOV_PER_ROUND || 1);
      for (let i = 0; i < n; i++) if (!this.requisition('wartime')) break;
    }
    // ---- ROUND 9 — the firm's three prototype functions (ANDERS_ROLE; all house throws, no asks) ----
    _aStat(k, n) { this.andersRole = this.andersRole || {}; this.andersRole[k] = (this.andersRole[k] || 0) + (n == null ? 1 : n); }
    // the verdict's own order: most control, then least exposure, then holdings
    _verdictLeader(pool) {
      return (pool || this.players).slice().sort((a, b) => this.verdictControl(b) - this.verdictControl(a) || a.exposure - b.exposure || b.holdings(this.price) - a.holdings(this.price))[0];
    }
    // the firm holds a body: a house claim (like the state's or the pirates'), never stacked on one
    _andersHold(v, why) {
      if (!v || v._requisition) return false;
      v._requisition = { rolls: this.privDials.ANDERS_ROLLS, by: null, cause: 'anders' };
      this._aStat('held'); this.emit('anders_holds', { on: v.name, why, rolls: this.privDials.ANDERS_ROLLS }); return true;
    }
    // 'hand': the core green die intervened — the firm takes the leader's body too
    _andersHand() { const lead = this._verdictLeader(); if (lead && this._andersHold(lead, 'hand')) this._aStat('hand'); }
    // 'books': your record is about to cost you a body — the firm certifies it (a house throw)
    _andersBooks(p) {
      if (!this.privilege) return;
      const kb = this.privilegeBase(p), wasB = p._privBaseWas == null ? 3 : p._privBaseWas;
      if (kb < wasB && this.rng.d6() >= this.dials.GREEN_TRIGGER) {
        let off = 0; while (this.privilegeBase(p) < wasB && p.exposure > 0 && off < 30) { p.exposure--; off++; }
        const fee = Math.min(Math.max(0, p.value), this.privDials.ANDERS_FEE); p.value -= fee;
        p._andersDebt = (p._andersDebt || 0) + off;
        this._aStat('certified'); this._aStat('writtenOff', off); this._aStat('fees', fee);
        this.emit('anders_books', { player: p.name, off, fee });
      }
      p._privBaseWas = this.privilegeBase(p);
    }
    // 'books': when E.D.D. arms the booked debt comes due, many times over
    _andersDebtDue() {
      if (!this.privilege || this.privDials.ANDERS_ROLE !== 'books') return;
      this.players.forEach(q => { if (q._andersDebt) { const due = q._andersDebt * this.privDials.ANDERS_DEBT_MULT; q.exposure += due; this._aStat('due', due); this._aStat('called');
        this.emit('anders_due', { player: q.name, due }); q._andersDebt = 0; } });
    }
    // ADMIRALTY ARREST — docked short in a rival's home yard (partners do not arrest partners)
    _arrestCheck(p) {
      if (!this._seizeOn() || !this.privDials.PRIV_ARREST || !p.moved) return;
      const port = this.seatAtHQ(p.at, p);
      if (!port || (this.deals && this.dealBetween(port, p))) return;
      if (this.privilegeOf(p) < 3 && this.seizeFrom(port, p, 'arrest')) this.privStats.arrests = (this.privStats.arrests || 0) + 1;
    }
    _tollSale(p, value) {
      const by = this._turnToller; if (!by || by === p) return;
      // ONE SALE, ONE TOLL — the bigger. Where THE PATH's tollbooth already charges this landing
      // (a rival holds the buyer), the privilege toll only takes the difference, never both.
      let pct = this.privDials.TOLL_CUT;
      if (this.path && this.path.toll) { const own = this.ownerOf(p.at); if (own && own !== p.name) pct = Math.max(0, pct - this.pathDial('TOLL_PCT')); }
      const cut = Math.min(p.value, Math.round(value * pct / 100));
      if (cut <= 0) return;
      p.value -= cut; by.value += cut; this.privStats.tollCash += cut;
      // 'cash+control': the sale's ▰ goes to the toller too — the work scores for somebody else
      let ctl = 0;
      if (this.privDials.TOLL_TAKES === 'cash+control' && p.control > 0) { p.control--; by.control++; ctl = 1; this.privStats.tollControl = (this.privStats.tollControl || 0) + 1; }
      this.emit('toll_paid', { player: p.name, to: by.name, cut, control: ctl });
    }
    // per body, for the board: { own } | { by: seat name, how: 'seize'|'toll' } | { house }
    privilegeBodies(p) {
      const k = this.privilegeOf(p), out = [];
      for (let i = 0; i < 3; i++) out.push(i < k ? { own: true } : { house: true });
      if (k < 3) {
        let slot = k;
        const sz = this.seized[p.id];
        if (sz) { out[slot] = { by: sz.by.name, how: 'seize' }; slot++; }
        if (p._requisition && slot < 3) { out[slot] = { by: p._requisition.by ? p._requisition.by.name : null, how: 'gov' }; slot++; }
        const tl = slot < 3 ? this._tollerOf(p, k) : null;
        if (tl) out[slot] = { by: tl.by.name, how: 'toll' };
      }
      return out;
    }
    // the dice this seat sails on (THE MAP): its own bodies under privilege, else all three
    moveDice(p) {
      if (!this.privilege || this.privDials.PRIV_MOVE !== 'own' || !this.diceOwner) return this.lastDice;
      const own = this.lastDice.filter((v, i) => this.diceOwner[i] === p);
      return own.length ? own : this.lastDice.slice(0, 1);
    }
    // how far this seat may sail this turn, given the map's read of the dice
    privSteps(p, steps) {
      if (!this.privilege || this.privDials.PRIV_MOVE !== 'cap') return steps;
      // the reach reads the privilege you EARNED (exposure), not what the sea or the state took this
      // roll — a canal costs you a die, never your way on (L4: no slow-in-the-strait spiral)
      const kk = p._privExp != null ? p._privExp : (p.privilege == null ? 3 : p.privilege);
      const cap = (this.privDials.PRIV_MOVE_CAP || [])[kk];
      return cap == null ? steps : Math.min(steps, cap);
    }
    _ownDice(p) { const own = this.diceOwner ? this.lastDice.filter((v, i) => this.diceOwner[i] === p) : this.lastDice; return own.length ? own : this.lastDice.slice(0, 1); }
    // the pips shown on the standings (●●● / ●●○ / ●○○)
    privilegeDots(p) { const k = this.privilegeOf(p); return '●'.repeat(k) + '○'.repeat(3 - k); }

    async _resolveEDD(p) {
      const D = this.dials, roll = this.rng.d6(), outcome = D.EDD_ROLL[roll];
      // player may steer toward EAT/DIVIDE/DESTROY within what the roll allows (kept simple)
      const choice = await this.ask(p, 'edd', [outcome]);
      const victims = this.players.filter(q => q !== p);
      // WHO GETS EATEN. Without the table, the protocol simply hits the biggest
      // holder. With THE TABLE on, the deals you made decide where it lands:
      //   1. a GRUDGE first — you strike the one who broke a deal with you, over
      //      the richest seat, and the grudge is spent (revenge taken once);
      //   2. otherwise your standing PARTNERS are SHIELDED — that shield is the
      //      whole reason to make a deal, and the whole reason the endgame is a
      //      defection cascade;
      //   3. if everyone left is a partner, the protocol finds nobody. The cartel
      //      walks out of the collapse together and the verdict decides it on
      //      control > exposure > holdings.
      let pool = victims, spared = false, revenge = false;
      if (this.deals && victims.length) {
        const grudged = victims.filter(q => p.grudges.includes(q.id));
        if (grudged.length) { pool = grudged; revenge = true; }
        else {
          const partners = this.partnersOf(p);
          pool = victims.filter(q => partners.indexOf(q) < 0);
          if (!pool.length) spared = true;
        }
      }
      let target = pool.length ? pool.reduce((a, b) => (a.holdings(this.price) > b.holdings(this.price) ? a : b)) : null;
      let filed = false;                                   // ROUND 9 'protocol': the firm files it
      if (this.privilege && this.expansion && this.privDials.ANDERS_ROLE === 'protocol' && victims.length && this.rng.d6() >= D.GREEN_TRIGGER) {
        const lead = this._verdictLeader(victims); filed = true; this._aStat('filed');
        if (lead !== target) this._aStat('aimed');
        target = lead; spared = false; revenge = false;
        this.emit('anders_files', { player: p.name, on: target.name });
      }
      if (this.deals) {
        if (spared) { this.dealStats.spared++; this.emit('edd_spared', { player: p.name, partners: this.partnersOf(p).map(q => q.name) }); }
        if (revenge && target) { this.dealStats.revenge++; p.grudges = p.grudges.filter(id => id !== target.id); this.emit('edd_revenge', { player: p.name, on: target.name }); }
      }
      switch (choice) {
        case 'EAT':     if (target) { p.control += 1; p.value += target.barrels * this.price; target.barrels = 0; target.exposure += 3;
          // "acquire territory": you take their ground — they wash up at their own HQ.
          if (this.map && target.at !== p.at) { const MP = OilGame._mapFX(); const h = this.hqOf(target); target.at = (h && MP.BY[h]) ? h : target.at; if (this.momentum && MP.BY[h]) target.under = null; }
          if (filed) this._andersHold(target, 'EAT');
          else if (this.privilege && this.privDials.PRIV_EDD) this.seizeFrom(p, target, 'EAT');   // you eat the ship and its dice
        } break;
        case 'DIVIDE':  if (target) { const half = Math.floor(target.control / 2); target.control -= half; p.control += half;
          if (filed) this._andersHold(target, 'DIVIDE');
          else if (this.privilege && this.privDials.PRIV_EDD) this.tollOn(p, target, 'DIVIDE'); } break;
        case 'DESTROY': if (target) { target.control = Math.max(0, target.control - 1); target.exposure += 2; this.oil = Math.max(0, this.oil - 1); }
          // EDD_PROTOCOL's own word for DESTROY is "disable route": with the map on,
          // the protocol shuts the gate nearest the victim and the world gets longer.
          if (this.map && target) this._eddCloseNear(target);
          break;
      }
      if (target && this.hegemony && this.hegDials.RICO) this._rico(p, target, choice, filed);   // round 12: THE RICO PROTOCOL
      if (this.crisis && target && target.at) this.addHeat(target.at, this.crisisDials.HEAT_EDD, 'the Protocol');
      this.eddLog.push({ by: p.name, roll, outcome: choice, on: target && target.name });
      this.emit('edd', { player: p.name, roll, outcome: choice, on: target && target.name, revenge: revenge || undefined, spared: spared || undefined });
    }


    // DESTROY "disable route": shut the gate that hurts this victim most — the
    // nearest one to where they stand. The map itself becomes a weapon.
    _eddCloseNear(victim) {
      const MP = OilGame._mapFX();
      if (!MP.reach || !victim.at) return;
      const r = MP.reach(victim.at, 99, this.mapState);
      const gates = MP.GATES.filter(gcode => r.dist[gcode] !== undefined && !this.mapState.closed[gcode]);
      if (!gates.length) return;
      gates.sort((a, b) => (r.dist[a] - r.dist[b]) || (a < b ? -1 : 1));
      for (const gcode of gates) if (this.closeGate(gcode, this.mapDials.CLOSE_TURNS)) return;
    }

    _end() {
      if (this.done) return;
      this.done = true;
      if (!this.edd) { this.edd = true; this.end_reason = this.end_reason || 'E.D.D. — the oil ran out'; this.emit('edd_begin', { reason: this.end_reason, price: this.price, oil: this.oil }); this._andersDebtDue(); }
      // graded VERDICT (Charter G8/G9): most control, then least exposure, then holdings.
      const ctl = q => this.heg2 ? this.verdictControl(q) : q.control;   // HEGEMONY: the matrix stake counts
      const ranked = this.players.slice().sort((a, b) =>
        ctl(b) - ctl(a) || a.exposure - b.exposure || b.holdings(this.price) - a.holdings(this.price));
      this.winner = ranked[0];
      if (this.heg2) {   // did the collections decide it? (the verdict as if no pawn had been collected)
        const cf = q => q.control - q.heg.gained + this.pawns.reduce((a, x) => a + x.w[q.id], 0), ex = q => q.exposure - q.heg.collected * this.hegDials.COLLECT_EXPOSURE;
        const r2 = this.players.slice().sort((a, b) => cf(b) - cf(a) || ex(a) - ex(b) || b.holdings(this.price) - a.holdings(this.price));
        this.hegStats.decided = r2[0] !== ranked[0];
      }
      this.ranking = ranked;
      this.end_reason = this.end_reason || 'oil exhausted';
      this.emit('gameover', { winner: this.winner.name, reason: this.end_reason });
    }

    async run() { let guard = 0; while (!this.done && guard++ < this.maxTurns + 50) await this.step(); return this; }

    // a graded "Favor"-style score for the verdict screen
    favor(p) { return p.control * 5 - p.exposure + Math.floor(p.holdings(this.price) / 10); }
  }

  global.OilGame = OilGame;
  global.OIL_DIALS = DIALS;
  global.OIL_EDITIONS = EDITIONS;
  global.OIL_PRIV_DIALS = PRIV_DIALS;
  global.OIL_CLOCK_DIALS = CLOCK_DIALS;
  global.OIL_LEVEL_DIALS = LEVEL_DIALS;
  global.oilShove = shoveOf;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OilGame, makeRng, shoveOf, DIALS, EDITIONS, POLICIES, PRIV_DIALS, CLOCK_DIALS };
})(typeof window !== 'undefined' ? window : globalThis);
