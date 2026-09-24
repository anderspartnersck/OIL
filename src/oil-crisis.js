/* OiL! CRISIS — flashpoints, blowouts, IWS, and annihilation.
   ============================================================================
   Built to the designer's brief of 2026-09-01 (docs/CRISIS-AND-IWS.md):
     "lean into the realism of the oil industry based on Lessons in Darkness and
      world events of today… the same sorta percussive drilling ideas of USING WAR
      AND GOVERNMENT DECISIONS TO AFFECT THE CLEANUP AND CONTROL. The firefighter
      company can be used to help one PROTECT THEMSELVES or DEAL WITH THE FALLOUT
      OF A DISASTER AFTER THE FACT — the latter being mostly how it's used, since
      the limited resources will have to be spent wisely and THEY ARE EXPENSIVE…
      the expansion will exacerbate CORRUPTION AND EXPENSE and the effects of both
      CAPITALISM AND COMMUNISM… map-based STRESS POINTS AND FLASHPOINTS, and the
      POTENTIAL FOR ANNIHILATION, i.e. the collapse meter aspects."

   ============================================================================
   THE HARD CONSTRAINT THIS WAS BUILT UNDER (docs/THE-FOLDS.md):
   the one-page rules sheet leaves ~3 decisions across 5 phases, with little room.
   So CRISIS ADDS NO PHASE AND NO NEW DECISION POINT:
     · HEAT accrues in upkeep, off events that already happen (a chaotic season, a
       card played, a seat selling out of a rival's yard, the Protocol firing);
     · a BLOWOUT is a consequence, not a choice;
     · IWS is a THIRD OPTION on the deliver step that already exists — you pay
       instead of selling. Never a new prompt.
   Gated: scripts/oil-lab-check.js LAB 11 asserts the decisions-per-turn budget
   itself did not rise. If crisis ever costs a decision, the gate fails.

   ============================================================================
   THE LOOP (every arrow but the middle two already existed):

        war / government decision  ->  FLASHPOINT heats
                   ^                          |
            price spikes                 BLOWOUT at a place
                   ^                          |
            scarcity bites   <---   oil BURNS (the clock runs faster)
                                              |
                                   call IWS — expensive — or let it burn

   A well fire only ever burns oil DOWN, and the collapse clock is already
   monotonic, so the whole loop is law-safe by construction. The catastrophe
   accelerating the catastrophe IS the thesis; the engine was built to allow it.

   EVERY NUMBER IS A DIAL (House Rule 5). Open questions -> CORE-017. */
(function (global) {
  'use strict';

  const CRISIS_DIALS = {
    // ---- heat: the stress on a place ----
    HEAT_MAX: 12,
    HEAT_DECAY: 1,          // heat is pressure, not a ratchet — but it is STICKY:
    HEAT_DECAY_EVERY: 4,    // ...it only bleeds off every this-many turns. A crisis
                            //    that evaporates faster than the world creates it is
                            //    not a crisis, it is a rounding error.
    HEAT_CHAOS_GATES: 2,    // a CHAOTIC season leans on EVERY chokepoint on the board
    HEAT_CHAOS_LOCAL: 1,    // ...and on the water the active seat is standing in
    HEAT_INCURSION: 3,      // selling out of somebody's yard makes trouble there
    HEAT_EDD: 2,            // the Protocol firing heats where it struck
    HEAT_CARD: 4,           // a war/government card played here
    HEAT_SPREAD: 1,         // a SHUT strait bleeds stress into the HQs beside it —
                            //    this is the arrow that closes the loop: the gate shuts,
                            //    and the field next to it catches.
    ABSORB_MIN: 2,          // a government only gets to absorb a REAL shock; the small
                            //    stuff lands whatever you are. (Stops absorption from
                            //    silently cancelling every +1 and freezing the layer.)

    // ---- what heat does ----
    GATE_SHUT_AT: 6,        // a strait this hot closes — war shuts it, not a decree
    BLOWOUT_AT: 7,          // an HQ this hot catches fire

    // ---- the fire (Lessons in Darkness) ----
    FIRE_BURN: 2,           // oil burned every turn it stands — the clock accelerates
    FIRE_HEAT: 2,           // exposure per turn to the seat whose ground is alight
    FIRE_DELIVERY: 50,      // % of the normal delivery you can move from a burning place
    // fires DO NOT go out on their own. That is the point.

    // ---- IWS — "the world is on fire, call IWS" ----
    // Expensive by design: the brief says the money is always needed now, so the
    // retainer is correct play and almost nobody buys it. That claim is MEASURED
    // (LAB 10 asserts call-outs outnumber retainers), not asserted.
    IWS_BASE: 30,           // value to cap a well...
    IWS_PER_TURN: 12,       // ...plus this for every turn you let it burn. The bill for waiting.
    IWS_EXPOSURE: 1,        // they bill the catastrophe, and it is on your record that you needed them
    RETAINER_AT: 3,         // you may only buy cover once you can SEE the trouble coming
                            //    (your own HQ this hot). Cover you cannot yet justify is
                            //    cover nobody buys — which is exactly the brief's point.
    RETAINER_COST: 22,      // pre-pay, at your own HQ, before anything is alight
    RETAINER_SHIELD: 4,     // raises your HQ's blowout threshold by this...
    RETAINER_TURNS: 8,      // ...for this many turns

    // ---- capitalism and communism: the world acting on the companies ----
    // A government decision lands on both, and both shed the same heat — they just
    // pay in different currencies. The state pays in legitimacy; the private firm
    // pays cash and calls it a cost of doing business.
    STATE_ABSORB: 1,        // heat a state-held HQ soaks up...
    STATE_EXPOSURE: 1,      // ...at this much exposure
    PRIVATE_ABSORB: 1,      // heat a private HQ lobbies away...
    PRIVATE_FEE: 8,         // ...for this much value (if it cannot pay, it eats the heat)

    // ---- annihilation: the third way this ends ----
    // Annihilation must be REACHABLE and must not become the way the game normally
    // ends — the oil running out is still the thesis. Tuned so it stays a minority
    // ending (gated in LAB 10: it fires, and oil-out still dominates).
    ANNIHILATION_AT: 64,    // total heat on the board arms E.D.D. all by itself
  };

  // Straight off the designer's own faction `region` strings — no invented canon.
  const HELD_BY_STATE = { BRIGHT: 1, MINA: 1, HADDAD: 1, PETRO_SUR: 1 };
  const HELD_BY_BOARD = { HARTSTARR: 1, STOCK: 1, MC: 1, NIK: 1 };
  const alignmentOf = code => HELD_BY_STATE[code] ? 'state' : (HELD_BY_BOARD[code] ? 'private' : null);

  // Which existing cards are war-and-government decisions? These are the designer's
  // own cards; crisis just gives them a place to land. Positive = heats, negative =
  // imposes quiet. Nothing new is invented — "Quiet Over Peace" was always about
  // buying calm, it simply had nowhere to put it until the map had stress points.
  const CARD_HEAT = {
    'Strait Flush': 4, 'Boots On The Ground': 3, 'Drones R Us': 3, 'Ocean of Fire': 4,
    'Gulf-Faw': 3, 'Hobbesian': 2, 'Catastrophe': 3, 'Smoke Stack': 2, 'No Words.': 2,
    'Quiet Over Peace': -3, 'Force Majeure': -3, 'Measured Austerity': -2, 'Stringent': -2,
  };

  const REG = { CRISIS_DIALS, HELD_BY_STATE, HELD_BY_BOARD, alignmentOf, CARD_HEAT,
    OPEN_QUESTIONS: [
      'What raises heat — cards only, the Green Anders die, faction powers, or a war-and-government deck of its own?',
      'Is IWS a neutral price everyone pays, or a seat somebody can play? (EXPANSION-NOTES calls them a major actor.)',
      'Is the drink (CORE-003) the corruption lever — the thing you do to make a government decision go your way?',
      'Does annihilation end the game differently (nobody wins) or just sooner?',
      'Core or expansion? The brief says the EXPANSION exacerbates it — so is there a core-scale crisis the expansion turns up?',
    ] };
  global.OIL_CRISIS = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
