/* OiL! THE WORLD (1117) — two PROTOTYPES that the 3D world made visible. Both default OFF; the golden
   fingerprint (f421af5) is untouched with them off. Write-up + numbers: docs/WORLD3D-1117.md (Q1214–Q1223).

   ============================================================================
   1. PIPELINE MODE (opts.pipeMode) — the fix for overland travel.
   Joe 1117: "trekking overland in pipeline mode, perhaps that is the fix for overland travel" … "hazard rolls in
   pipeline mode depend on turn rolls and cut offs, etc. perhaps this is a way to get ahead or be trapped for
   people if they arent careful."

   Today a PIPE route (both ends on land: Druzhba, the near abroad, the Caspian line, Central Asia, the Siberian
   line, the domestic system, the fence line, the Great Lakes line) is just a safe edge. In pipeline mode it is a
   GAMBLE read off the SAME three bodies every turn already rolls — no new die, no new RNG draw:
     · GET AHEAD. In a STABLE season the line runs fast: every pipe leg costs STABLE_DISCOUNT less (min 1), and
       the line is immune to the sea — shut straits, perils, inspections, pirates. A shortcut past a closed gate.
     · THE TREK. Cargo you commit to a line is IN THE LINE until your next turn begins (you can't sell from inside
       a pipe — you can only sell at an HQ, the board's rule). That turn is the exposure.
     · CUT OFF. At the start of your next turn, the new roll is read for the line. The line is LIVE if that roll
       is CHAOTIC — or if you went in during a CHAOTIC season (a hot line stays hot: that is the wrong read):
         political shut-off  a live line, the World body <= CUT_WORLD_AT, through somebody's ground (a rival's
                             yard, or a state's)
         sabotage            a live line, the Supply body <= CUT_SUPPLY_AT
         pump-station fire   (CRISIS on) a yard at either end of the line burning, or its heat >= CUT_FIRE_HEAT
     · TRAPPED. A cut cargo is held TRAP_TURNS of your turns (a fire holds it until it is put out, capped at
       FIRE_TRAP_TURNS). No sale, turns burning. The way out is always there — the board's rule, "the world can be
       made longer, never broken": WAIT it out, REROUTE (pay to pull the cargo back to the line's head and ship it
       another way), or, if it is a fire, call IWS. Offered on the existing MOVE question (no new kind of decision).
   The player's read before committing: the move prompt shows the season and the line's cut odds for next turn
   (lineOdds, an exact enumeration of the three bodies at the engine's own dice dials).

   ============================================================================
   2. THE FIREFIGHTING COMPANY IN EARNEST (opts.iwsCrew; needs CRISIS) — IWS / Box & Scooter as a crew ON the map.
   Today calling IWS caps a well instantly. In crew mode the Fire Cutters are one crew with a yard (BASE: the
   Refinery Coast — Boots & Coots were Houston) that has to GET THERE, by the same graph the ships use:
     · you hire them on the same DELIVER step as today, and pay the same bill (IWS_BASE + IWS_PER_TURN × turns
       burned) at the hire;
     · they travel SPEED steps per seat-turn along the open routes (a shut strait makes the trip longer — war
       lengthens the fire), overland by the pipes when that is shorter;
     · the fire burns on until they arrive (FIRE_BURN oil a turn — every turn en route is the fire clock);
     · ONE crew: a second fire waits in the queue (first hired, first served) — unless you pay JUMP_PCT more to
       go first (they are mercenaries: the higher bid flies first). The crew never refuses a job;
     · PIPELINE MODE: a pump-station fire is exactly their work — hire them from inside a trapped line
       (PUMP_COST) and the line reopens when they arrive.
   ============================================================================ */
(function (global) {
  'use strict';
  const PIPE_DIALS = {
    STABLE_DISCOUNT: 1,     // a pipe leg costs this much less in a STABLE season (min 1) — the line runs fast
    MOM_STABLE_PUSH: 1,     // MOMENTUM: a ship riding a pipe in a STABLE season gets this many extra steps
    TREK: 1,                // your turns the cargo spends in the line before it lands (1 = it lands as your next turn begins)
    CUT_WORLD_AT: 2,        // CHAOTIC + World body <= this: the line through somebody's ground is shut (political)
    CUT_SUPPLY_AT: 1,       // CHAOTIC + Supply body <= this: sabotage
    CUT_FIRE_HEAT: 5,       // (CRISIS) a yard at either end this hot (or burning): a pump station catches
    TRAP_TURNS: 2,          // a cut holds the cargo this many of your turns (finite: the board is never broken)
    FIRE_TRAP_TURNS: 4,     // a pump-station fire holds it until it is out, or this many of your turns at most
    PUMP_BURN: 1,           // oil a pump-station fire burns every seat-turn it stands (the fire clock; never adds oil)
    REROUTE_COST: 12,       // $ to pull the cargo back out at the line's head and ship it another way
    PUMP_COST: 18,          // $ to have IWS cap a pump-station fire (instant without a crew; the crew comes, with one)
    BOT_RISK_W: { stable: 14, greedy: 5 },   // bot policy: how much a temperament fears the cut odds
    BOT_TREK: 3,            // bot policy: the cost of a turn in the line (no sale this turn)
  };
  const CREW_DIALS = {
    BASE: 'REFINERY_ROW',   // the Fire Cutters' yard: the Refinery Coast (Port Arthur / Houston). Q1218
    SPEED: 2,               // route steps the crew covers each seat-turn
    JUMP_PCT: 50,           // pay this much more to be served before the queue (bots never do; a human may)
    STAY: true,             // the crew stays where it last worked (true) or goes home between jobs (false)
  };

  // a PIPE edge: both ends on land (the canvas's own kindOfRoute rule, and OIL_MOMENTUM's)
  function isPipe(MP, a, b) {
    const land = c => { const k = ((MP.BY || {})[c] || ((MP.OPTIONAL_PLACES || []).find(q => q.code === c)) || {}).kind; return k === 'hq' || k === 'onshore'; };
    return land(a) && land(b);
  }
  // the exact odds that NEXT turn's roll cuts a line, by cause (enumerated over the three bodies)
  const _odds = {};
  // hot = the cargo went in during a CHAOTIC season: the line stays live whatever next turn's season is
  function lineOdds(gameDials, pipeDials, contested, hot) {
    const D = gameDials, P = pipeDials, key = JSON.stringify([D.DIE_FACES, D.SHOVE_W, D.T_CHAOS, P.CUT_WORLD_AT, P.CUT_SUPPLY_AT, !!contested, !!hot]);
    if (_odds[key]) return _odds[key];
    const F = D.DIE_FACES; let n = 0, chaos = 0, world = 0, supply = 0, any = 0;
    for (const a of F) for (const b of F) for (const c of F) {
      n++; const s = [a, b, c].slice().sort((x, y) => x - y), sh = s[0] * D.SHOVE_W[0] + s[1] * D.SHOVE_W[1] + s[2] * D.SHOVE_W[2];
      const ch = Math.abs(sh) >= D.T_CHAOS; if (ch) chaos++;
      if (!ch && !hot) continue;
      const w = contested && c <= P.CUT_WORLD_AT, sp = a <= P.CUT_SUPPLY_AT;
      if (w) world++; if (sp) supply++; if (w || sp) any++;
    }
    return (_odds[key] = { chaos: chaos / n, world: world / n, supply: supply / n, cut: any / n });
  }
  const REG = { PIPE_DIALS, CREW_DIALS, isPipe, lineOdds };
  global.OIL_WORLD = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
