/* OiL! SUPREXCORE PREMIUM (1118) — THE THREE THEATRES + THE FULL DECK.
   ============================================================================
   Joe 2026-11-18: "put the middle east on fire and war in russia/ukraine and also an active conflict in
   venezuela all the way up to the california shipping lanes with governmental seizing and piracy, which is
   what cards will exacerbate alongside the anders die. also include shady financial book cooking as well as
   firefighting blocking to be held in hand in secret unless revealed. we should be looking at ERSN's cards for
   inspiration but in the oil shipping and business ceo genre for all cards."

   WHAT THIS IS — built ON the CRISIS loop (src/oil-crisis.js) and THE MAP, never beside it:
     · THREE STANDING THEATRES (gulf_fire · ukraine_war · venezuela_pacific), each with an INTENSITY 0–3.
       Intensity leans heat onto the theatre's front each round, raises the house's SEIZURE and PIRACY throws on
       hulls that sail through, and at PEAK lands one blow (a well lit · Druzhba cut · Panama blockaded).
       The GREEN ANDERS die (its existing 5+ intervention) and THEATRE cards escalate; a flashpoint or a blowout
       inside a theatre feeds it; a quiet theatre stands down (never below SMOULDERING) — except the Gulf while
       a well there burns: fires never go out on their own.
     · BOOK COOKING: cards pay now and write to a SECRET ledger (p.cooked). When E.D.D. arms, THE AUDIT: every
       cooked point comes due as exposure (+ a fine). Audit cards open a rival's books early.
     · FIREBREAKS: block cards held in the (secret) hand. They fire THEMSELVES when their trigger lands on you —
       a reveal, not a prompt, so they add NO decision (LAB 11). Bots never read a rival's hand (LAB 19).

   THE GRAMMAR every card here obeys (gated, LAB 5 + LAB 19): CORE-010 — one bundled all-of effect, and every
   card SWINGS (a rival meter or the shared price, unconditionally — so it swings on the neutral fixture too);
   no card ADDS oil; THE ONE RULE OF THE BOARD — closures go through closeGate/route disable, which refuse
   anything that would strand an HQ. Satire aims at the system; the companies are fictional.

   OFF (opts.suprex absent): nothing here runs, no RNG is drawn, the core fingerprint is byte-identical.
   Every number is a CONCEPT dial (House Rule 5). Open calls: QUESTIONS-MASTER Q1751–Q1758 + Q1628–Q1639 (renumbered 1118 round 2). */
(function (global) {
  'use strict';

  const DIALS = {
    START: { gulf_fire: 2, ukraine_war: 2, venezuela_pacific: 2 },   // all three live from turn 1 ("on fire", "war", "active")
    FLOOR: 1,             // a stand-down never takes a theatre below SMOULDERING (only a card makes a ceasefire)
    STAND_DOWN: 3,        // rounds without an escalation before a theatre cools a step
    ESC_PRICE: 2,         // an escalation is a war premium on the tape
    COOL_PRICE: -1,       // a stand-down / ceasefire lets a little out
    FRONT_HEAT: 1,        // heat on the front each round = (intensity - FRONT_FROM) * this
    FRONT_FROM: 2,        // ...so only a theatre at PEAK leans on its front (batch 1118: from ACTIVE, the fire ending rose 25% -> 41%)
    FEED: true,           // a flashpoint or blowout inside a theatre escalates it (once a round)
    SEIZE_AT: [99, 99, 6, 5],   // house d6 needed for a governmental seizure, by intensity (cargo aboard)
    PIRATE_AT: [99, 6, 5, 4],   // ...for piracy (private hulls only — state ships sail with a navy, CORE-025)
    SEIZE_TAKE: 2,        // barrels impounded
    PRIZE: 1,             // ...of which the seizing state's company (if seated) takes this many (prize court)
    RANSOM: 8, RANSOM_PER: 4,   // ransom = RANSOM + RANSOM_PER * intensity (or what the hull's owner has)
    DETAIN_ROUNDS: 2,     // how long an impounded tanker / ransom hold shows on the board (display only)
    PEAK_FIRE: true,      // the Gulf's peak lights a well at its HQ place
    PEAK_HEAT: 3,         // Venezuela's peak: heat on Panama (the blockade) · Ukraine's: heat on the Turkish Straits
    AUDIT_MULT: 1,        // THE AUDIT: exposure per cooked point
    AUDIT_FINE: 4,        // ...and $ per cooked point
  };
  const LEVELS = ['CEASEFIRE', 'SMOULDERING', 'ACTIVE', 'PEAK'];
  const SANCTIONED = ['MINA', 'NIK', 'PETRO_SUR'];   // the sanctioned flags (fiction: the companies, not the nations)

  // THE THEATRES. Places are OIL_MAP codes; lanes are route labels. Labels: US = CITY/COUNTY, STATE, USA · else CITY, COUNTRY.
  const THEATRES = {
    gulf_fire: {
      name: 'THE GULF ON FIRE', anchor: 'DHAHRAN, SAUDI ARABIA', state: 'HADDAD',
      places: ['HADDAD', 'HORMUZ', 'BAB', 'SUEZ'], fronts: ['HORMUZ', 'BAB', 'HADDAD', 'SUEZ'],
      labels: { HADDAD: 'DHAHRAN, SAUDI ARABIA', HORMUZ: 'BANDAR ABBAS, IRAN', BAB: 'ADEN, YEMEN', SUEZ: 'SUEZ, EGYPT' },
      seize: { HORMUZ: { by: null, hits: 'all', who: 'a navy in the strait' }, HADDAD: { by: 'HADDAD', hits: 'foreign', who: 'the Gulf coast guard' } },
      pirate: ['BAB', 'the Red Sea', 'the Gulf of Aden', 'the Arabian Sea'],
      peak: 'a well is lit at DHAHRAN — and nobody puts it out for free',
    },
    ukraine_war: {
      name: 'WAR IN RUSSIA / UKRAINE', anchor: 'ODESA, UKRAINE', state: 'MINA',
      places: ['MINA', 'BOSPHORUS', 'DANISH'], fronts: ['BOSPHORUS', 'DANISH', 'MINA'],
      labels: { MINA: 'MOSCOW, RUSSIA', BOSPHORUS: 'ODESA, UKRAINE', DANISH: 'COPENHAGEN, DENMARK' },
      seize: { BOSPHORUS: { by: 'MINA', hits: 'foreign', who: 'the Black Sea Fleet' }, MINA: { by: 'MINA', hits: 'foreign', who: 'the port authority' },
        DANISH: { by: null, hits: 'sanctioned', who: 'the Baltic sanctions patrol (the shadow fleet is boarded)' } },
      pirate: [],
      peak: 'the Druzhba line goes dark and the Black Sea burns',
    },
    venezuela_pacific: {
      name: 'VENEZUELA TO THE CALIFORNIA LANES', anchor: 'CARACAS, VENEZUELA', state: 'PETRO_SUR',
      places: ['PETRO_SUR', 'PANAMA', 'PACIFIC', 'LA'], fronts: ['PETRO_SUR', 'PANAMA', 'PACIFIC'],
      labels: { PETRO_SUR: 'CARACAS, VENEZUELA', PANAMA: 'COLÓN, PANAMA', PACIFIC: 'LONG BEACH, CALIFORNIA, USA', LA: 'LOS ANGELES, CALIFORNIA, USA' },
      seize: { PETRO_SUR: { by: 'PETRO_SUR', hits: 'foreign', who: 'the national guard at sea' },
        PANAMA: { by: null, hits: 'sanctioned', who: 'the canal inspectors' },
        PACIFIC: { by: null, hits: 'sanctioned', who: 'a federal interdiction in the California lanes' },
        LA: { by: null, hits: 'sanctioned', who: 'a federal interdiction in the California lanes' } },
      pirate: ['the Caribbean run', 'the Colón approach', 'out of Balboa', 'the Gulf approach', 'the Pacific crossing', 'out of Long Beach'],
      peak: 'Panama is blockaded and the California lanes are stacked with seized hulls',
    },
  };
  const IDS = Object.keys(THEATRES);

  // ---------------------------------------------------------------------------------------- the rules
  function setup(g) {
    const D = g.sxDials;
    g.theatres = {};
    IDS.forEach(id => { g.theatres[id] = { id, intensity: D.START[id], peaks: 0, escalations: 0, lastEsc: 0, lastChange: 0,
      seizures: [], piracy: [], fedRound: -1 }; });
    g.sxStats = { escalations: { gulf_fire: 0, ukraine_war: 0, venezuela_pacific: 0 }, peaks: { gulf_fire: 0, ukraine_war: 0, venezuela_pacific: 0 },
      standDowns: 0, ceasefires: 0, byCause: {}, seizures: 0, seizedBarrels: 0, prizes: 0, piracy: 0, ransom: 0,
      incidentsThrown: 0, reveals: 0, revealsBy: {}, drawnBlocks: 0, playedBlocks: 0, cookedTotal: 0, audits: 0, auditExposure: 0,
      peakFires: 0, druzhbaCut: 0, maxSum: 0 };
    g._sxEv = 0;
  }
  const sx = g => !!(g && g.suprex && g.theatres);
  function escalate(g, id, cause, n) {
    if (!sx(g)) return 0;
    const T = g.theatres[id], D = g.sxDials; if (!T) return 0;
    let moved = 0;
    for (let i = 0; i < (n || 1) && T.intensity < 3; i++) {
      const was = T.intensity; T.intensity++; moved++; T.escalations++; T.lastEsc = g.round; T.lastChange = g.turn;
      g.sxStats.escalations[id]++; g.sxStats.byCause[cause] = (g.sxStats.byCause[cause] || 0) + 1;
      g.bumpPrice(D.ESC_PRICE);
      g.emit('theatre', { id, intensity: T.intensity, was, cause });
      if (T.intensity === 3) peakBlow(g, id);
    }
    if (!moved) T.lastEsc = g.round;   // a theatre already at PEAK stays hot: the pressure resets its stand-down clock
    const sum = IDS.reduce((a, k) => a + g.theatres[k].intensity, 0); if (sum > g.sxStats.maxSum) g.sxStats.maxSum = sum;
    return moved;
  }
  function cool(g, id, cause, floor) {
    if (!sx(g)) return 0;
    const T = g.theatres[id]; if (!T) return 0;
    const f = floor == null ? 0 : floor; if (T.intensity <= f) return 0;
    const was = T.intensity; T.intensity--; T.lastEsc = g.round; T.lastChange = g.turn;
    g.bumpPrice(g.sxDials.COOL_PRICE);
    g.emit('theatre', { id, intensity: T.intensity, was, cause });
    return 1;
  }
  function peakBlow(g, id) {
    const T = g.theatres[id], D = g.sxDials, MP = global.OIL_MAP || {};
    T.peaks++; g.sxStats.peaks[id]++;
    if (id === 'gulf_fire' && D.PEAK_FIRE) {
      const at = 'HADDAD';
      if (g.crisis && !g.burningAt(at)) {
        const owner = g.seatAtHQ(at);
        if (!(owner && tryBlock(g, owner, 'blowout', { at })) && !blockAny(g, owner, at)) {
          g.fires[at] = 1; g.crisisStats.blowouts++; g.sxStats.peakFires++;
          g.emit('blowout', { at, name: (MP.BY[at] || {}).name, player: owner && owner.name, cause: 'the Gulf at PEAK' });
        }
      }
      g.emit('theatre_peak', { id, what: T.name + ': ' + THEATRES[id].peak, at: 'HADDAD' });
    } else if (id === 'ukraine_war') {
      let cut = false;
      if (g.map && MP.ADJ) {
        const r = (MP.ADJ.MINA || []).find(x => x.label === 'Druzhba (overland)');
        if (r && !g.mapState.disabled[r.id] && !g._wouldSplit(() => { g.mapState.disabled[r.id] = g.mapDials.CLOSE_TURNS; }, () => { delete g.mapState.disabled[r.id]; })) {
          cut = true; g.sxStats.druzhbaCut++; g.emit('route_disabled', { at: 'MINA', label: r.label, to: r.to, cause: 'the war' });
        }
      }
      if (g.crisis) g.addHeat('BOSPHORUS', D.PEAK_HEAT, T.name);
      g.emit('theatre_peak', { id, what: T.name + ': ' + THEATRES[id].peak, at: 'BOSPHORUS', cut });
    } else if (id === 'venezuela_pacific') {
      if (g.crisis) g.addHeat('PANAMA', D.PEAK_HEAT, T.name);
      g.emit('theatre_peak', { id, what: T.name + ': ' + THEATRES[id].peak, at: 'PANAMA' });
    }
  }
  // once a round (the first seat's upkeep): the fronts, the feed, the stand-down, the board's markers
  function roundTick(g) {
    if (!sx(g)) return;
    const D = g.sxDials;
    IDS.forEach(id => { const T = g.theatres[id];
      T.seizures = T.seizures.filter(x => --x.left > 0); T.piracy = T.piracy.filter(x => --x.left > 0); });
    // FEED: a strait shut or a well blown inside a theatre since last round — the war feeds on itself
    if (D.FEED) {
      const ev = g.events, fed = {};
      for (let i = g._sxEv; i < ev.length; i++) {
        const e = ev[i]; if (e.type !== 'flashpoint' && e.type !== 'blowout') continue;
        IDS.forEach(id => { if (!fed[id] && THEATRES[id].places.indexOf(e.at) >= 0 && e.cause !== 'the Gulf at PEAK') fed[id] = 1; });
      }
      g._sxEv = ev.length;
      IDS.forEach(id => { if (fed[id]) escalate(g, id, 'the war feeds on itself'); });
    }
    IDS.forEach(id => {
      const T = g.theatres[id], spec = THEATRES[id];
      const fronts = spec.fronts.filter(c => (global.OIL_MAP.BY || {})[c]);
      T.front = fronts[g.round % fronts.length];
      const h = Math.max(0, T.intensity - D.FRONT_FROM) * D.FRONT_HEAT;
      if (h > 0 && g.crisis) g.addHeat(T.front, h, spec.name);
      const burning = spec.places.some(c => g.burningAt && g.burningAt(c));
      if (T.intensity > D.FLOOR && g.round - T.lastEsc >= D.STAND_DOWN && !(id === 'gulf_fire' && burning)) {
        if (cool(g, id, 'the theatre stands down', D.FLOOR)) g.sxStats.standDowns++;
      }
    });
  }
  // the Green Anders die's existing intervention (5+ in a chaotic era) now also feeds a war: the one the roller
  // stands in or calls home, else the quietest (Anders opens a new market)
  function green(g, p) {
    if (!sx(g)) return;
    const here = IDS.find(id => THEATRES[id].places.indexOf(p.at) >= 0) || IDS.find(id => THEATRES[id].places.indexOf(g.hqOf(p)) >= 0);
    const id = here && g.theatres[here].intensity < 3 ? here
      : IDS.filter(k => g.theatres[k].intensity < 3).sort((a, b) => g.theatres[a].intensity - g.theatres[b].intensity)[0];
    if (id) escalate(g, id, 'Anders');
  }
  // after the seat sails: one house throw if its hull touched a theatre's seizure water or pirate lanes
  function incident(g, p) {
    if (!sx(g) || !g.map) return;
    const MP = global.OIL_MAP || {}, D = g.sxDials;
    let path = null;
    for (let i = g.events.length - 1; i >= 0 && g.events[i].turn === g.turn; i--) { const e = g.events[i]; if (e.type === 'move' && e.player === p.name) { path = e.path; break; } }
    const nodes = (path && path.length) ? path.slice() : [p.at];
    if (nodes.indexOf(p.at) < 0) nodes.push(p.at);
    const lanes = [];
    for (let i = 1; i < nodes.length; i++) { const r = (MP.ADJ[nodes[i - 1]] || []).find(x => x.to === nodes[i]); if (r) lanes.push(r.label); }
    const priv = g.alignmentOf(p) === 'private';
    for (const id of IDS) {
      const T = g.theatres[id], spec = THEATRES[id], I = T.intensity; if (I < 1) continue;
      let sz = null;
      if (p.barrels > 0) for (const c of nodes) { const s = spec.seize[c]; if (s && hits(s, p)) { sz = { at: c, s }; break; } }
      const pir = priv && (nodes.some(c => spec.pirate.indexOf(c) >= 0) ? nodes.find(c => spec.pirate.indexOf(c) >= 0) : lanes.find(l => spec.pirate.indexOf(l) >= 0));
      if (!sz && !pir) continue;
      g.sxStats.incidentsThrown++;
      const t = g.rng.d6();                           // THE HOUSE THROWS (nobody at the table rolls it)
      if (sz && t >= D.SEIZE_AT[I]) { seize(g, p, id, sz.at, sz.s); return; }
      if (pir && t >= D.PIRATE_AT[I]) { pirate(g, p, id, MP.BY[pir] ? pir : p.at, typeof pir === 'string' && !MP.BY[pir] ? pir : null); return; }
      return;                                          // one throw a seat-turn, whatever the water
    }
  }
  function hits(s, p) { return s.hits === 'all' || (s.hits === 'foreign' ? p.faction !== s.by : SANCTIONED.indexOf(p.faction) >= 0); }
  function seize(g, p, id, at, s) {
    const D = g.sxDials, T = g.theatres[id], label = THEATRES[id].labels[at] || THEATRES[id].anchor;
    if (tryBlock(g, p, 'seizure', { at, theatre: id })) return;
    const n = Math.min(p.barrels, D.SEIZE_TAKE); p.barrels -= n;
    const by = s.by ? g.players.find(q => q.faction === s.by && q !== p) : null;
    let prize = 0; if (by && n > 0) { prize = Math.min(n, D.PRIZE); by.barrels += prize; g.sxStats.prizes += prize; }
    g.sxStats.seizures++; g.sxStats.seizedBarrels += n;
    T.seizures.push({ on: p.name, by: by ? by.name : s.who, at, label, barrels: n, left: D.DETAIN_ROUNDS, turn: g.turn });
    g.emit('seizure', { theatre: id, on: p.name, by: by ? by.name : null, who: s.who, at, label, barrels: n, prize });
  }
  function pirate(g, p, id, at, lane) {
    const D = g.sxDials, T = g.theatres[id], label = THEATRES[id].labels[at] || (lane ? lane : THEATRES[id].anchor);
    if (tryBlock(g, p, 'piracy', { at, theatre: id })) return;
    const ransom = Math.min(Math.max(0, p.value), D.RANSOM + D.RANSOM_PER * T.intensity); p.value -= ransom;
    g.sxStats.piracy++; g.sxStats.ransom += ransom;
    T.piracy.push({ on: p.name, at, label, ransom, left: D.DETAIN_ROUNDS, turn: g.turn });
    g.emit('piracy', { theatre: id, on: p.name, at, label, lane, ransom });
  }
  // THE AUDIT — E.D.D. arms and the books are opened, everyone's at once
  function audit(g) {
    if (!sx(g)) return;
    g.players.forEach(q => { if (q.cooked > 0) auditSeat(g, q, 'THE AUDIT (E.D.D. armed)', g.sxDials.AUDIT_MULT); });
  }
  function auditSeat(g, q, cause, mult) {
    const c = q.cooked || 0;
    if (tryBlock(g, q, 'audit', { cooked: c })) return 0;
    const ex = Math.max(c > 0 ? 1 : 0, Math.round(c * (mult || 1))), fine = Math.min(Math.max(0, q.value), c * g.sxDials.AUDIT_FINE);
    q.exposure += ex; q.value -= fine; q.cooked = 0;
    g.sxStats.audits++; g.sxStats.auditExposure += ex;
    g.emit('audit', { player: q.name, cooked: c, exposure: ex, fine, cause });
    return ex;
  }
  function cook(g, p, n) { p.cooked = (p.cooked || 0) + n; if (g.sxStats) g.sxStats.cookedTotal += n; }

  // ---- FIREBREAKS: the secret hand. A block fires itself when its trigger lands on its holder. ----
  function isBlock(name) { return !!(CARD[name] && CARD[name].block); }
  function tryBlock(g, q, trigger, ctx) {
    if (!sx(g) || !q || !q.hand || !q.hand.length) return false;
    const i = q.hand.findIndex(n => CARD[n] && CARD[n].block && CARD[n].block.on === trigger);
    if (i < 0) return false;
    const name = q.hand.splice(i, 1)[0], c = CARD[name];
    (g.discards[c.deck] || []).push(name);
    g.sxStats.reveals++; g.sxStats.revealsBy[trigger] = (g.sxStats.revealsBy[trigger] || 0) + 1;
    g.emit('block_reveal', Object.assign({ player: q.name, card: name, trigger }, ctx && ctx.at ? { at: ctx.at } : {}));
    c.block.fx(g, q, ctx || {});
    return true;
  }
  // a fire about to start at an HQ: its owner's block first, then anybody's standing contract with the crew
  function blockBlowout(g, owner, at) {
    if (!sx(g)) return false;
    if (owner && tryBlock(g, owner, 'blowout', { at })) return true;
    return blockAny(g, owner, at);
  }
  function blockAny(g, owner, at) {
    for (const q of g.players) if (q !== owner && tryBlock(g, q, 'blowout_any', { at, owner })) return true;
    return false;
  }
  // a fire already burning at your HQ, at upkeep
  function blockFire(g, seat, at) { return sx(g) && !!seat && tryBlock(g, seat, 'fire', { at }); }

  // ---- card helpers (each fx swings unconditionally; theatre parts are bracketed by `sx(g)`) ----
  const opps = (g, p) => g.players.filter(q => q !== p);
  const lead = (g, p) => g.leaderOpp(p), rich = (g, p) => g.richestOpp(p);
  const mostBarrels = (g, p) => { const o = opps(g, p); return o.length ? o.reduce((a, b) => (b.barrels > a.barrels ? b : a)) : null; };
  const pay = (q, n) => { const x = Math.min(Math.max(0, q.value), Math.max(0, Math.round(n))); q.value -= x; return x; };
  const heat = (g, at, n, why) => { if (g.crisis && g.addHeat) g.addHeat(at, n, why); };
  const pipCap = (g, p) => g.pipCap ? g.pipCap(p) : g.dials.PIPS_START;
  const sanctionedOpps = (g, p) => opps(g, p).filter(q => SANCTIONED.indexOf(q.faction) >= 0);
  const privOpps = (g, p) => { const o = opps(g, p).filter(q => g.alignmentOf(q) === 'private'); return o.length ? o : opps(g, p); };
  const capFireAt = (g, at) => { if (g.crisis && at && g.burningAt(at)) { delete g.fires[at]; g.heat[at] = 0; g.emit('iws', { at, free: true }); return true; } return false; };
  const hottest = g => IDS.slice().sort((a, b) => g.theatres[b].intensity - g.theatres[a].intensity)[0];
  const sumI = g => sx(g) ? IDS.reduce((a, k) => a + g.theatres[k].intensity, 0) : 2;

  // ---- THE DECK — 44 cards. family: THEATRE · LANES · BOOKS · FIREBREAK. deck = where it is drawn (FOLD 3: an HQ deals DEEDS,
  //      open water FREEDOM-MARKET, a gate COMPETITION). Measured 1118: a 4-seat FULL game draws ~14 DEEDS, ~6 FREEDOM-MARKET and
  //      ~1 COMPETITION, so the war cards that must actually reach the table sit in DEEDS (the boardroom's war) and
  //      FREEDOM-MARKET (the war on the news at sea); the gate deck keeps the mines, the convoy and the audits. ----
  // text is the printed card (what the engine does). flavor is the ER$N-register line under it.
  const C = (name, deck, family, theatre, type, flavor, text, fx, block) => ({ name, deck, family, theatre, type, flavor, text, fx, block });
  const CARDS = [
    // ===================== THEATRE — THE GULF ON FIRE =====================
    C('Seven Hundred Wells', 'DEEDS', 'THEATRE', 'gulf_fire', 'War', 'The army leaves. The field stays lit.',
      'The Gulf escalates (+1). The price moves +3. The leading rival takes +1 exposure. (If this brings the Gulf to PEAK, a well is lit at DHAHRAN, SAUDI ARABIA.)',
      (g, p) => { escalate(g, 'gulf_fire', 'Seven Hundred Wells'); g.bumpPrice(3); const t = lead(g, p); if (t) t.exposure += 1; }),
    C('Tanker War', 'FREEDOM-MARKET', 'THEATRE', 'gulf_fire', 'War', "Somebody's hull, somebody's flag, somebody else's insurance.",
      'The Gulf escalates (+1). The rival holding the most barrels loses 1. The price moves +2.',
      (g, p) => { escalate(g, 'gulf_fire', 'Tanker War'); const t = mostBarrels(g, p); if (t) t.barrels = Math.max(0, t.barrels - 1); g.bumpPrice(2); }),
    C('Mines In The Strait', 'COMPETITION', 'THEATRE', 'gulf_fire', 'War', 'Nobody laid them. Everybody swept around them.',
      'The Gulf escalates (+1). [CRISIS] +3 heat on the Strait of Hormuz. Every rival with cargo aboard pays $5. The price moves +2.',
      (g, p) => { escalate(g, 'gulf_fire', 'Mines In The Strait'); heat(g, 'HORMUZ', 3, 'Mines In The Strait'); opps(g, p).forEach(q => { if (q.barrels > 0) pay(q, 5); }); g.bumpPrice(2); }),
    C('Drones Over The Processing Plant', 'DEEDS', 'THEATRE', 'gulf_fire', 'War', 'Precision, they said. The smoke was visible from orbit.',
      'The Gulf escalates (+1). The richest rival loses 2 barrels. The price moves +4. Burn 1 oil from the well.',
      (g, p) => { escalate(g, 'gulf_fire', 'Drones Over The Processing Plant'); const t = rich(g, p); if (t) t.barrels = Math.max(0, t.barrels - 2); g.bumpPrice(4); g.burnOil(1); }),
    C('Escort Convoy', 'COMPETITION', 'THEATRE', 'gulf_fire', 'Government', 'The navy will see you through. The invoice will see you later.',
      'The Gulf stands down a step (−1). The price moves −2. You take +1 exposure (you asked for the navy).',
      (g, p) => { cool(g, 'gulf_fire', 'Escort Convoy'); g.bumpPrice(-2); p.exposure += 1; }),
    C('Smoke-Filled Room', 'DEEDS', 'THEATRE', 'gulf_fire', 'Government', 'A ceasefire, catered.',
      'The Gulf stands down a step (−1). Every rival loses 1 pip. The price moves −1.',
      (g, p) => { cool(g, 'gulf_fire', 'Smoke-Filled Room'); opps(g, p).forEach(q => { q.pips = Math.max(0, q.pips - 1); }); g.bumpPrice(-1); }),

    // ===================== THEATRE — WAR IN RUSSIA / UKRAINE =====================
    C('Druzhba Goes Dark', 'DEEDS', 'THEATRE', 'ukraine_war', 'War', 'Friendship, by pipeline, until it isn\'t.',
      'The war escalates (+1). [THE MAP] The Druzhba line is out of service for 3 turns (never if it would strand a seat). The price moves +3.',
      (g, p) => { escalate(g, 'ukraine_war', 'Druzhba Goes Dark'); if (g.map) { const MP = global.OIL_MAP || {}; const r = (MP.ADJ && MP.ADJ.MINA || []).find(x => x.label === 'Druzhba (overland)');
        if (r && !g.mapState.disabled[r.id]) g._wouldSplit(() => { g.mapState.disabled[r.id] = g.mapDials.CLOSE_TURNS; }, () => { delete g.mapState.disabled[r.id]; }); } g.bumpPrice(3); }),
    C('Shadow Fleet', 'FREEDOM-MARKET', 'THEATRE', 'ukraine_war', 'Market', 'Forty rusting hulls. No names. Full holds.',
      'The war escalates (+1). The price moves −2 (sanctioned barrels leak through). The richest rival loses $ equal to half the price (undercut).',
      (g, p) => { escalate(g, 'ukraine_war', 'Shadow Fleet'); g.bumpPrice(-2); const t = rich(g, p); if (t) pay(t, g.price / 2); }),
    C('Price Cap', 'FREEDOM-MARKET', 'THEATRE', 'ukraine_war', 'Government', 'A ceiling with a door in it.',
      'The price moves −3. Every sanctioned company at the table (Mina, Nikoyl, Petro Sur) takes +1 exposure; if none is seated, the leading rival does.',
      (g, p) => { g.bumpPrice(-3); const s = sanctionedOpps(g, p); (s.length ? s : [lead(g, p)]).forEach(q => { if (q) q.exposure += 1; }); }),
    C('Black Sea Mines', 'COMPETITION', 'THEATRE', 'ukraine_war', 'War', 'The grain ships go first. Then everyone checks their charts.',
      'The war escalates (+1). [CRISIS] +3 heat on the Turkish Straits. The rival holding the most barrels loses 1. The price moves +2.',
      (g, p) => { escalate(g, 'ukraine_war', 'Black Sea Mines'); heat(g, 'BOSPHORUS', 3, 'Black Sea Mines'); const t = mostBarrels(g, p); if (t) t.barrels = Math.max(0, t.barrels - 1); g.bumpPrice(2); }),
    C('Undersea Cable Mystery', 'FREEDOM-MARKET', 'THEATRE', 'ukraine_war', 'Sabotage', 'An anchor dragged forty miles by accident. Twice.',
      'The war escalates (+1). The leading rival loses 1 control ▰. The price moves +2.',
      (g, p) => { escalate(g, 'ukraine_war', 'Undersea Cable Mystery'); const t = lead(g, p); if (t) t.control = Math.max(0, t.control - 1); g.bumpPrice(2); }),
    C('Peace Talks In A Neutral Hotel', 'DEEDS', 'THEATRE', 'ukraine_war', 'Government', 'The minibar was the only thing that got settled.',
      'The war stands down a step (−1). The price moves −2. You take +1 exposure. Every rival loses 1 pip.',
      (g, p) => { cool(g, 'ukraine_war', 'Peace Talks In A Neutral Hotel'); g.bumpPrice(-2); p.exposure += 1; opps(g, p).forEach(q => { q.pips = Math.max(0, q.pips - 1); }); }),

    // ===================== THEATRE — VENEZUELA TO THE CALIFORNIA LANES =====================
    C('Boarding Party', 'FREEDOM-MARKET', 'THEATRE', 'venezuela_pacific', 'Seizure', 'Paperwork first. Then the ladder.',
      'Venezuela escalates (+1). The rival holding the most barrels has up to 2 seized: you take 1 of them, the state impounds the rest. You take +1 exposure.',
      (g, p) => { escalate(g, 'venezuela_pacific', 'Boarding Party'); const t = mostBarrels(g, p); if (t) { const n = Math.min(2, t.barrels); t.barrels -= n; if (n > 0) p.barrels += 1; } p.exposure += 1; }),
    C('Blockade Of The Orinoco', 'DEEDS', 'THEATRE', 'venezuela_pacific', 'War', 'Nothing in, nothing out, everything on the news.',
      'Venezuela escalates (+1). [CRISIS] +3 heat on the Panama Canal. The price moves +3.',
      (g, p) => { escalate(g, 'venezuela_pacific', 'Blockade Of The Orinoco'); heat(g, 'PANAMA', 3, 'Blockade Of The Orinoco'); g.bumpPrice(3); }),
    C('Go-Fast Boats', 'FREEDOM-MARKET', 'THEATRE', 'venezuela_pacific', 'Piracy', 'Twin outboards and a business plan.',
      'Venezuela escalates (+1). The richest PRIVATE rival pays a $10 ransom (or what it has). The price moves +1.',
      (g, p) => { escalate(g, 'venezuela_pacific', 'Go-Fast Boats'); const o = privOpps(g, p); const t = o.reduce((a, b) => (b.holdings(g.price) > a.holdings(g.price) ? b : a), o[0]); if (t) pay(t, 10); g.bumpPrice(1); }),
    C('Anchorage Off Long Beach', 'FREEDOM-MARKET', 'THEATRE', 'venezuela_pacific', 'Market', 'Forty tankers at anchor off LONG BEACH, CALIFORNIA, USA. Waiting is a business model.',
      'Venezuela escalates (+1). Every rival with cargo aboard pays $3 demurrage. The price moves +2.',
      (g, p) => { escalate(g, 'venezuela_pacific', 'Anchorage Off Long Beach'); opps(g, p).forEach(q => { if (q.barrels > 0) pay(q, 3); }); g.bumpPrice(2); }),
    C('Sanctions Waiver', 'DEEDS', 'THEATRE', 'venezuela_pacific', 'Government', 'Licensed for six months, renewable on good behaviour, defined later.',
      'Venezuela stands down a step (−1). The price moves −3. You take +1 exposure.',
      (g, p) => { cool(g, 'venezuela_pacific', 'Sanctions Waiver'); g.bumpPrice(-3); p.exposure += 1; }),
    C('Interdiction At Sea', 'FREEDOM-MARKET', 'THEATRE', 'venezuela_pacific', 'Seizure', 'A federal cutter, a boarding ladder, a great deal of paperwork.',
      'Venezuela escalates (+1). Every sanctioned company at the table loses 1 barrel (impounded); if none is seated, the leading rival does. The price moves +1.',
      (g, p) => { escalate(g, 'venezuela_pacific', 'Interdiction At Sea'); const s = sanctionedOpps(g, p); (s.length ? s : [lead(g, p)]).forEach(q => { if (q) q.barrels = Math.max(0, q.barrels - 1); }); g.bumpPrice(1); }),

    // ===================== LANES — insurance, flags, shadow trade (cross-theatre) =====================
    C('War-Risk Premium', 'FREEDOM-MARKET', 'LANES', null, 'Insurance', 'The underwriters have read the news. They charge by the paragraph.',
      'Every rival pays $2 × the total intensity of the three theatres. The price moves +1.',
      (g, p) => { const n = 2 * sumI(g); opps(g, p).forEach(q => pay(q, n)); g.bumpPrice(1); }),
    C('Flag Of Convenience', 'DEEDS', 'LANES', null, 'Asset', 'Registered in a country with one lighthouse and no inspectors.',
      'Remove 2 of your exposure. The leading rival takes +1 exposure.',
      (g, p) => { p.exposure = Math.max(0, p.exposure - 2); const t = lead(g, p); if (t) t.exposure += 1; }),
    C('Ship-To-Ship At Midnight', 'FREEDOM-MARKET', 'LANES', null, 'Market', 'Two hulls, one hose, no witnesses who will testify.',
      'Take 1 barrel from the rival holding the most. You take +1 exposure. The price moves −1.',
      (g, p) => { const t = mostBarrels(g, p); if (t && t.barrels > 0) { t.barrels--; p.barrels++; } p.exposure += 1; g.bumpPrice(-1); }),
    C('Dark Transponder', 'FREEDOM-MARKET', 'LANES', null, 'Market', 'The ship is still there. It has simply stopped saying so.',
      'The richest rival loses $ equal to half the price (dark barrels undercut them). You take +1 exposure. The price moves −1.',
      (g, p) => { const t = rich(g, p); if (t) pay(t, g.price / 2); p.exposure += 1; g.bumpPrice(-1); }),
    C('Insurance Pulled', 'FREEDOM-MARKET', 'LANES', null, 'Insurance', 'Cover is cancelled effective yesterday.',
      'The hottest theatre escalates (+1). The richest rival pays $10. The price moves +1.',
      (g, p) => { if (sx(g)) escalate(g, hottest(g), 'Insurance Pulled'); const t = rich(g, p); if (t) pay(t, 10); g.bumpPrice(1); }),
    C('The Long Way Round', 'FREEDOM-MARKET', 'LANES', null, 'Market', 'Around the Cape, again, at twelve knots and full fuel cost.',
      'Every rival loses 1 pip. The price moves +2.',
      (g, p) => { opps(g, p).forEach(q => { q.pips = Math.max(0, q.pips - 1); }); g.bumpPrice(2); }),

    // ===================== BOOKS — the shady ledger (secret: p.cooked) =====================
    C('Reserve Restatement', 'DEEDS', 'BOOKS', null, 'Accounting', 'The barrels were always there. We just found them in the spreadsheet.',
      'Gain $ equal to the price. Cook 2 (secret). The price moves +1 (the market believes you).',
      (g, p) => { p.value += g.price; cook(g, p, 2); g.bumpPrice(1); }),
    C('Off-Balance-Sheet Tanker', 'DEEDS', 'BOOKS', null, 'Accounting', 'It floats. It earns. It does not exist.',
      'Sell up to 2 of your barrels at the price for $. Cook 1. The richest rival takes +1 exposure (the hull is in their name).',
      (g, p) => { const n = Math.min(2, p.barrels); p.barrels -= n; p.value += n * g.price; cook(g, p, 1); const t = rich(g, p); if (t) t.exposure += 1; }),
    C('Transfer Pricing', 'DEEDS', 'BOOKS', null, 'Accounting', 'We sold it to ourselves at a loss, in a country where losses are profitable.',
      'Gain $ equal to half the price. Every rival pays $3. Cook 1.',
      (g, p) => { p.value += Math.round(g.price / 2); opps(g, p).forEach(q => pay(q, 3)); cook(g, p, 1); }),
    C('Booking Oil At Sea', 'FREEDOM-MARKET', 'BOOKS', null, 'Accounting', 'Sold the moment it left port. Delivered whenever.',
      'Gain $ equal to half the price for each barrel you hold (up to 3) — and keep the barrels. Cook 2. The price moves −1.',
      (g, p) => { p.value += Math.round(g.price / 2) * Math.min(3, p.barrels); cook(g, p, 2); g.bumpPrice(-1); }),
    C('Ghost Barrels', 'FREEDOM-MARKET', 'BOOKS', null, 'Accounting', 'Phantom supply. Real price impact.',
      'The price moves −2. Gain $ equal to the price. Cook 2.',
      (g, p) => { g.bumpPrice(-2); p.value += g.price; cook(g, p, 2); }),
    C('Mark To Mirage', 'DEEDS', 'BOOKS', null, 'Accounting', "Valued at next decade's price, discounted at last decade's rate.",
      'Gain $ equal to the price. Cook 3. The leading rival takes +1 exposure (the analysts compare).',
      (g, p) => { p.value += g.price; cook(g, p, 3); const t = lead(g, p); if (t) t.exposure += 1; }),
    C('Restated Quarter', 'COMPETITION', 'BOOKS', null, 'Audit', 'Q3 has been revised. Q3 is now fiction.',
      "AUDIT the richest rival now: they take exposure equal to their cooked books (at least 1) and pay $4 a point; their ledger is cleared. The price moves −1.",
      (g, p) => { const t = rich(g, p); if (t) { if (sx(g)) auditSeat(g, t, 'Restated Quarter', 1); else t.exposure += 1; } g.bumpPrice(-1); }),
    C('Whistleblower In Accounts', 'COMPETITION', 'BOOKS', null, 'Audit', 'She kept a copy. She always keeps a copy.',
      'The rival with the most cooked books is AUDITED at double (exposure 2 a point, cleared). If no rival has cooked, the leading rival takes +1 exposure. The price moves −1.',
      (g, p) => { const o = opps(g, p).filter(q => (q.cooked || 0) > 0); if (o.length) { const t = o.reduce((a, b) => (b.cooked > a.cooked ? b : a)); auditSeat(g, t, 'Whistleblower In Accounts', 2); }
        else { const t = lead(g, p); if (t) t.exposure += 1; } g.bumpPrice(-1); }),
    C('Friendly Auditor', 'DEEDS', 'BOOKS', null, 'Audit', 'Lunch, then a signature, then lunch.',
      'Clear up to 2 of your cooked books. Pay $5. The leading rival takes +1 exposure (somebody has to be the example).',
      (g, p) => { p.cooked = Math.max(0, (p.cooked || 0) - 2); pay(p, 5); const t = lead(g, p); if (t) t.exposure += 1; }),
    C('Shredder Rental', 'DEEDS', 'BOOKS', null, 'Accounting', 'Industrial grade. Billed as office supplies.',
      'Clear all your cooked books. You take +1 exposure. The price moves +1 (the rumour).',
      (g, p) => { p.cooked = 0; p.exposure += 1; g.bumpPrice(1); }),

    // ===================== FIREBREAK — held in hand IN SECRET; each fires itself when its trigger lands =====================
    C('Fire-Cutter On Retainer', 'DEEDS', 'FIREBREAK', null, 'Block · Firefighting', 'Retained in March. Called in July. Already on the plane.',
      'Play: cap a fire burning where you stand; the richest rival takes +1 exposure.',
      (g, p) => { capFireAt(g, p.at); const t = rich(g, p); if (t) t.exposure += 1; },
      { on: 'blowout', text: 'SECRET — when your HQ would catch fire, reveal: it does not. Its heat drops 3. The price moves −1.',
        fx: (g, q, c) => { if (c.at && g.heat) g.heat[c.at] = Math.max(0, (g.heat[c.at] || 0) - 3); g.bumpPrice(-1); } }),
    C('Standing Contract With The Crew', 'DEEDS', 'FIREBREAK', null, 'Block · Firefighting', 'They will put out anybody\'s fire. They will invoice you for it, and you will invoice them.',
      'Play: the price moves −2.',
      (g, p) => { g.bumpPrice(-2); },
      { on: 'blowout_any', text: "SECRET — when ANY rival's HQ would catch fire, reveal: your crew is already there. It does not burn, and that company pays you $10 (or what it has).",
        fx: (g, q, c) => { if (c.at && g.heat) g.heat[c.at] = Math.max(0, (g.heat[c.at] || 0) - 3); if (c.owner) q.value += pay(c.owner, 10); else g.bumpPrice(-1); } }),
    C('Relief Well Already Drilled', 'DEEDS', 'FIREBREAK', null, 'Block · Firefighting', 'Drilled in advance, which nobody does, which is why it worked.',
      'Play: the price moves −1; the leading rival takes +1 exposure.',
      (g, p) => { g.bumpPrice(-1); const t = lead(g, p); if (t) t.exposure += 1; },
      { on: 'fire', text: 'SECRET — at your upkeep, if your HQ is burning, reveal: the fire is capped for free. The richest rival takes +1 exposure.',
        fx: (g, q, c) => { capFireAt(g, c.at); const t = rich(g, q); if (t) t.exposure += 1; } }),
    C('Letter Of Protest', 'FREEDOM-MARKET', 'FIREBREAK', null, 'Block · Diplomacy', 'Strongly worded. Diplomatically delivered. Legally binding by Thursday.',
      'Play: the leading rival takes +1 exposure; the price moves +1.',
      (g, p) => { const t = lead(g, p); if (t) t.exposure += 1; g.bumpPrice(1); },
      { on: 'seizure', text: 'SECRET — when your tanker would be seized, reveal: the seizure is void. The price moves +1 (the tape hates a diplomatic incident).',
        fx: (g) => { g.bumpPrice(1); } }),
    C('Armed Guards Aboard', 'FREEDOM-MARKET', 'FIREBREAK', null, 'Block · Security', 'Four contractors, one crate, no questions on the manifest.',
      'Play: the richest rival pays $5; you take +1 exposure.',
      (g, p) => { const t = rich(g, p); if (t) pay(t, 5); p.exposure += 1; },
      { on: 'piracy', text: 'SECRET — when pirates would hold you for ransom, reveal: you pay nothing. You take +1 exposure; the price moves +1.',
        fx: (g, q) => { q.exposure += 1; g.bumpPrice(1); } }),
    C('Friends At The Ministry', 'COMPETITION', 'FIREBREAK', null, 'Block · Influence', 'A call is made. A file is misplaced. A tanker sails.',
      'Play: the leading rival takes +1 exposure; remove 1 of yours.',
      (g, p) => { const t = lead(g, p); if (t) t.exposure += 1; p.exposure = Math.max(0, p.exposure - 1); },
      { on: 'hold', text: "SECRET — when the state requisitions one of your bodies or pirates take one (THE PRIVILEGE), reveal: the claim is void. The leading rival takes +1 exposure.",
        fx: (g, q) => { const t = lead(g, q); if (t) t.exposure += 1; } }),
    C('Clean Opinion Letter', 'DEEDS', 'FIREBREAK', null, 'Block · Audit', 'Unqualified. In every sense.',
      'Play: clear 1 of your cooked books; the richest rival takes +1 exposure.',
      (g, p) => { p.cooked = Math.max(0, (p.cooked || 0) - 1); const t = rich(g, p); if (t) t.exposure += 1; },
      { on: 'audit', text: "SECRET — when your books are audited, reveal: the auditors sign. Your ledger is cleared, and the richest rival takes exposure equal to what you had cooked.",
        fx: (g, q, c) => { const t = rich(g, q); if (t) t.exposure += Math.max(1, c.cooked || 0); q.cooked = 0; } }),
    C('Firewall Subsidiary', 'DEEDS', 'FIREBREAK', null, 'Block · Structure', 'Wholly owned. Wholly expendable.',
      'Play: the leading rival takes +1 exposure; the price moves −1.',
      (g, p) => { const t = lead(g, p); if (t) t.exposure += 1; g.bumpPrice(-1); },
      { on: 'edd', text: 'SECRET — when an E.D.D. strike would land on you, reveal: it lands on the subsidiary. Nothing happens to you, and the striker takes +1 exposure.',
        fx: (g, q, c) => { if (c.by) c.by.exposure += 1; else g.bumpPrice(-1); } }),
    C('Kill Mud On Standby', 'COMPETITION', 'FIREBREAK', null, 'Block · Firefighting', 'Heavy, expensive, and exactly where it needs to be for once.',
      'Play: the price moves −1; the leading rival loses 1 pip.',
      (g, p) => { g.bumpPrice(-1); const t = lead(g, p); if (t) t.pips = Math.max(0, t.pips - 1); },
      { on: 'blowout', text: 'SECRET — when your HQ would catch fire, reveal: it does not; its heat drops to 0. The leading rival takes +1 exposure.',
        fx: (g, q, c) => { if (c.at && g.heat) g.heat[c.at] = 0; const t = lead(g, q); if (t) t.exposure += 1; } }),
    C('Capping Stack In The Hangar', 'FREEDOM-MARKET', 'FIREBREAK', null, 'Block · Firefighting', 'Bought after the last one. Insured against the next one.',
      'Play: the richest rival pays $5; the price moves −1.',
      (g, p) => { const t = rich(g, p); if (t) pay(t, 5); g.bumpPrice(-1); },
      { on: 'fire', text: 'SECRET — at your upkeep, if your HQ is burning, reveal: the fire is capped for free. The price moves −1.',
        fx: (g, q, c) => { capFireAt(g, c.at); g.bumpPrice(-1); } }),
  ];
  const CARD = {}; CARDS.forEach(c => { CARD[c.name] = c; });
  const FX = {}, TEXT = {};
  CARDS.forEach(c => { FX[c.name] = { deck: c.deck, fx: c.fx }; TEXT[c.name] = c.text + (c.block ? ' ' + c.block.text : ''); });
  const FAMILIES = {
    THEATRE: 'escalate, cool and wage the three wars — seizures, mines, sabotage, blockades',
    LANES: 'insurance, flags of convenience and the shadow trade, across every theatre',
    BOOKS: 'cook the books now (a secret ledger); THE AUDIT collects when E.D.D. arms',
    FIREBREAK: 'blocks held in hand IN SECRET — each reveals itself when its trigger lands on you',
  };

  // the renderer's snapshot (docs/SUPREXCORE-1118.md)
  function state(g) {
    if (!sx(g)) return null;
    const out = {};
    IDS.forEach(id => { const T = g.theatres[id], s = THEATRES[id], MP = global.OIL_MAP || {};
      const places = s.places.filter(c => MP.BY && MP.BY[c] && (MP.BY[c].kind !== 'port' || (g.mapState.opts || {})[MP.BY[c].set]));
      out[id] = { id, name: s.name, intensity: T.intensity, level: LEVELS[T.intensity], anchor: s.anchor, places,
        labels: Object.assign({}, s.labels), front: T.front || s.fronts[0], fires: places.filter(c => g.burningAt && g.burningAt(c)),
        seizures: T.seizures.map(x => Object.assign({}, x)), piracy: T.piracy.map(x => Object.assign({}, x)),
        peaks: T.peaks, escalations: T.escalations, lastChange: T.lastChange }; });
    return out;
  }

  const REG = { DIALS, LEVELS, THEATRES, IDS, SANCTIONED, CARDS, CARD, FX, TEXT, FAMILIES,
    setup, escalate, cool, roundTick, green, incident, audit, auditSeat, isBlock, tryBlock, blockBlowout, blockFire, state };
  global.OIL_SUPREX = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
