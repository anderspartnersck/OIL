/* OiL! THE CONCESSIONS — tiered spots to chase (1118).
   ============================================================================
   Joe 2026-11-18: "tiered things to chase that start to siphon others and sometimes destroy the world faster if
   you cant settle into a spot or it gets shut off from your ability to reach in time or affect by card or special
   entry via a tier system and or privilige loophole exploit in either core or expansion, where these can be more
   frequent."   (OiL's answer to ER$N's Executive Lounge tiers.)

   THE RULE (one paragraph):
     · Three TIERS of CONCESSION on the board — the sea's chokepoints, where a company that SETTLES (ends its move
       there and stays) collects from everyone who ships. TIER I THE STATIONS · TIER II THE CANALS · TIER III THE
       STRAIT (Hormuz). One holder per spot.
     · ENTRY. Tier I: end your move on an open, unheld spot. Tier II needs a TIER PASS, Tier III two. A pass is
       earned by HOLDING a lower spot through a round (the climb), BY CARD (a DEEDS card is paperwork: playing one
       files a pass; SuprexCore's government cards file one too), or by THE PRIVILEGE LOOPHOLE — a seat whose
       privilege is still untouched (●●●) counts one pass higher.
     · THE SIPHON. Each round, every holder still sitting on an OPEN spot takes $SIPHON × tier from each rival
       (what they have). Holding costs you the voyage: you are not shipping while you sit.
     · THE SCRAMBLE — the world burns faster: end your move on a spot you cannot settle (held by a rival, or above
       your pass) and the chase FAILS: 1 oil burns (and, with CRISIS, +1 heat there). A holder whose spot SHUTS
       (a strait closes on heat, a card, a theatre) is EVICTED: the scramble burns oil = its tier.
   No new decision: settling rides the move you already chose; siphon, eviction and the scramble are upkeep.
   No oil is ever ADDED (the burns only lower the clock). Closures are the map's own (never strand an HQ).

   OFF (opts.tiers absent): nothing here runs, no RNG is drawn — the golden fingerprint is untouched.
   SuprexCore makes them MORE FREQUENT: the west-coast/Pacific ports join Tier I, the siphon is richer, and the
   theatres heat the canals and the strait (so evictions come more often).
   Every number is a CONCEPT dial (House Rule 5). Open calls: QUESTIONS-MASTER Q1640–Q1649 / Q1750+. */
(function (global) {
  'use strict';
  const NAMES = ['', 'THE STATIONS', 'THE CANALS', 'THE STRAIT'];
  const DIALS = {
    SPOTS: { GIBRALTAR: 1, MALACCA: 1, LAWRENCE: 1, GOODHOPE: 1, HORN: 1, SUEZ: 2, PANAMA: 2, BAB: 2, HORMUZ: 3 },
    SX_SPOTS: { LA: 1, ALASKA: 1, JAPAN: 1, AUSTRALIA: 1 },   // SuprexCore: more to chase
    SIPHON: 1, SX_SIPHON: 2,   // $ per tier per rival per round
    PASS_CAP: 2,               // passes stop counting at 2 (Tier III)
    CLIMB: 1,                  // holding a spot through a round files a pass if you are at that tier
    CARD_DECK: 'DEEDS',        // playing a card from this deck files a pass
    SX_CARDS: ['Friends At The Ministry', 'Sanctions Waiver', 'Smoke-Filled Room', 'Peace Talks In A Neutral Hotel', 'Escort Convoy', 'Flag Of Convenience'],
    // ---- SUPREXCORE: the concessions run HOTTER in the expansion (Joe 1118: "more frequent" there) ----
    SX_THEATRE_SITES: { BOSPHORUS: 'ukraine_war', DANISH: 'ukraine_war', PACIFIC: 'venezuela_pacific', SUEZ: 'gulf_fire' },   // war-zone Tier III sites
    SX_SITE_OPEN_AT: 2,        // a war-zone site is a TIER III concession while its war is ACTIVE or PEAK — a stand-down to SMOULDERING shuts it (evict + burn)
    SX_LEASE: true,            // the expansion's ships must keep moving (MOMENTUM): a settled concession is a LEASE — yours until it shuts or is taken
    SX_TAKEOVER: true,         // ...and a rival with MORE passes who lands on it takes it over (a tier change)
    SX_CONTEST_AT: 5,          // ...an EQUAL rival who lands on it: the house throws one die — this or more takes it over, less is a failed chase
    SX_FAMILY_PASS: ['THEATRE', 'BOOKS'],   // these SuprexCore families file a pass when played (with SX_CARDS)
    SX_GREEN_PASS: 1,          // the Green Anders die's intervention opens a LOOPHOLE: the roller files a pass
    SX_FAIL_BURN: 2,
    SX_WAR_REDEAL: true,       // when a war's intensity CHANGES, the state re-deals the concessions in its theatre: holders there are thrown off (evict + burn)
    SX_VOID_PASSES: true,      // ...and a re-dealt holder's TIER PASSES are voided (the new regime does not honour the old papers)
    SX_BOT_PULL: 20,           // bot policy only: the expansion's bots chase harder           // the scramble burns harder with three wars on
    SX_PEAK_SHUTS: false,      // SuprexCore: a theatre at PEAK shuts the concessions on its front (evictions → the scramble)
    LOOPHOLE: 1,               // THE PRIVILEGE ●●● counts this many passes higher
    FAIL_BURN: 1, FAIL_HEAT: 1, EVICT_BURN_PER_TIER: 1,
    BOT_PULL: 12, BOT_STAY: 22, // bot policy only
  };
  const MPx = () => global.OIL_MAP || {};

  function setup(g, opts) {
    const o = typeof opts === 'object' ? opts : {};
    const D = g.tierDials = Object.assign({}, DIALS, o);
    const spots = Object.assign({}, D.SPOTS, g.suprex ? D.SX_SPOTS : {});
    if (g.suprex) Object.keys(D.SX_THEATRE_SITES || {}).forEach(c => { spots[c] = 3; });
    const BY = MPx().BY || {};
    Object.keys(spots).forEach(k => { if (!BY[k]) delete spots[k]; });
    g.tiers = { spots, holder: {}, since: {}, siphonPer: g.suprex ? D.SX_SIPHON : D.SIPHON };
    g.players.forEach(p => { p.tierPass = 0; });
    g.tierStats = { claims: 0, claimsByTier: [0, 0, 0, 0], heldRounds: [0, 0, 0, 0], siphon: 0, siphonByTier: [0, 0, 0, 0],
      fails: 0, failRival: 0, failPass: 0, evictions: 0, burned: 0, passes: { climb: 0, card: 0, anders: 0 }, loopholeClaims: 0, vacated: 0, takeovers: 0 };
  }
  const passOf = (g, p) => Math.min(g.tierDials.PASS_CAP, (p.tierPass || 0) +
    ((g.privilege && (p.privilege == null ? 3 : p.privilege) >= 3) ? g.tierDials.LOOPHOLE : 0));
  // a spot is SHUT when the map has it closed — or (SuprexCore) when a war that covers it is at PEAK: the front shuts it
  const atPeak = (g, c) => !!(g.suprex && g.theatres && g.tierDials.SX_PEAK_SHUTS && Object.keys(g.theatres).some(id => g.theatres[id].intensity >= 3 &&
    (((global.OIL_SUPREX || {}).THEATRES || {})[id] || { places: [] }).places.indexOf(c) >= 0));
  // a war-zone site (SuprexCore) is open only while its war sits at SX_SITE_OPEN_AT
  const siteShut = (g, c) => { const id = g.suprex && (g.tierDials.SX_THEATRE_SITES || {})[c]; return !!(id && g.theatres && g.theatres[id] && g.theatres[id].intensity < g.tierDials.SX_SITE_OPEN_AT); };
  const open = (g, c) => { const M = MPx(); return (!M.placeOpen || M.placeOpen(c, g.mapState)) && !atPeak(g, c) && !siteShut(g, c); };
  const lease = g => !!(g.suprex && g.tierDials.SX_LEASE);
  const heldBy = (g, p) => Object.keys(g.tiers.holder).find(c => g.tiers.holder[c] === p.name) || null;

  function burn(g, n, why, at) {
    if (n <= 0) return; const was = g.oil; g.burnOil(n); g.tierStats.burned += was - g.oil;
    g.emit('scramble', { burned: was - g.oil, why, at, oil: g.oil });
  }
  // after the move: did the seat settle, fail, or leave?
  function arrive(g, p) {
    const T = g.tiers, D = g.tierDials, mine = heldBy(g, p);
    if (mine && p.at !== mine && !lease(g)) { delete T.holder[mine]; T.since[mine] = g.round; g.tierStats.vacated++; g.emit('concession', { kind: 'vacate', player: p.name, at: mine, tier: T.spots[mine] }); }
    const t = T.spots[p.at]; if (!t || T.holder[p.at] === p.name) return;
    if (!open(g, p.at)) return;
    const hq = T.holder[p.at] && g.players.find(x => x.name === T.holder[p.at]);
    if (hq && g.suprex && D.SX_TAKEOVER && (t - 1) <= passOf(g, p) && (passOf(g, p) > passOf(g, hq) ||
        (passOf(g, p) === passOf(g, hq) && D.SX_CONTEST_AT && 1 + Math.floor(g.rng.random() * 6) >= D.SX_CONTEST_AT))) {   // SuprexCore: OUTRANKED or OUT-MUSCLED — a tier change
      g.tierStats.takeovers++; g.emit('concession', { kind: 'takeover', player: p.name, from: hq.name, at: p.at, tier: t });
      delete T.holder[p.at];
    }
    if (T.holder[p.at] || (t - 1) > passOf(g, p)) {                       // THE SCRAMBLE: a failed chase
      const rival = !!T.holder[p.at]; g.tierStats.fails++; rival ? g.tierStats.failRival++ : g.tierStats.failPass++;
      g.emit('concession', { kind: 'fail', player: p.name, at: p.at, tier: t, why: rival ? 'held by ' + T.holder[p.at] : 'no pass' });
      burn(g, g.suprex ? D.SX_FAIL_BURN : D.FAIL_BURN, 'a failed chase', p.at);
      if (g.crisis && D.FAIL_HEAT && g.addHeat) g.addHeat(p.at, D.FAIL_HEAT, 'the scramble');
      return;
    }
    if (mine) delete T.holder[mine];
    T.holder[p.at] = p.name; T.since[p.at] = g.round; g.tierStats.claims++; g.tierStats.claimsByTier[t]++;
    if ((t - 1) > (p.tierPass || 0)) g.tierStats.loopholeClaims++;
    g.emit('concession', { kind: 'settle', player: p.name, at: p.at, tier: t, name: NAMES[t], loophole: (t - 1) > (p.tierPass || 0) });
  }
  // once a round: evict from shut spots (the world burns), siphon, climb
  function roundTick(g) {
    const T = g.tiers, D = g.tierDials;
    if (g.suprex && D.SX_WAR_REDEAL && g.theatres) {                       // SuprexCore: a war that moved re-deals its concessions
      const TH = (global.OIL_SUPREX || {}).THEATRES || {}; T.lastI = T.lastI || {};
      Object.keys(g.theatres).forEach(id => {
        const I = g.theatres[id].intensity, was = T.lastI[id]; T.lastI[id] = I;
        if (was === undefined || was === I) return;
        const zone = ((TH[id] || {}).places || []).concat(Object.keys(D.SX_THEATRE_SITES || {}).filter(c => D.SX_THEATRE_SITES[c] === id));
        zone.forEach(c => { const h = T.holder[c]; if (!h || !T.spots[c]) return;
          delete T.holder[c]; g.tierStats.evictions++; g.tierStats.redeals = (g.tierStats.redeals || 0) + 1;
          if (D.SX_VOID_PASSES) { const hp = g.players.find(x => x.name === h); if (hp) hp.tierPass = 0; }   // the new regime voids your papers
          g.emit('concession', { kind: 'evict', player: h, at: c, tier: T.spots[c], why: 'the war moved — the state re-deals' });
          burn(g, D.EVICT_BURN_PER_TIER * T.spots[c], 'a war re-deals its concessions', c); });
      });
    }
    Object.keys(T.holder).forEach(c => {
      const q = g.players.find(x => x.name === T.holder[c]), t = T.spots[c];
      if (!q || (q.at !== c && !lease(g))) { delete T.holder[c]; return; }
      if (!open(g, c)) {                                                    // shut off: EVICTED
        delete T.holder[c]; g.tierStats.evictions++;
        g.emit('concession', { kind: 'evict', player: q.name, at: c, tier: t });
        burn(g, D.EVICT_BURN_PER_TIER * t, 'a concession shut', c); return;
      }
      g.tierStats.heldRounds[t]++;
      let got = 0;
      g.players.forEach(r => { if (r === q) return; const x = Math.min(Math.max(0, r.value), T.siphonPer * t); r.value -= x; got += x; });
      q.value += got; g.tierStats.siphon += got; g.tierStats.siphonByTier[t] += got;
      if (got) g.emit('siphon', { player: q.name, at: c, tier: t, amount: got });
      if (D.CLIMB && (q.tierPass || 0) < t && (q.tierPass || 0) < D.PASS_CAP) { q.tierPass = (q.tierPass || 0) + 1; g.tierStats.passes.climb++; g.emit('tier_pass', { player: q.name, via: 'climb', pass: q.tierPass }); }
    });
  }
  function onCard(g, p, name, deck) {
    const D = g.tierDials;
    const sc = g.suprex && ((global.OIL_SUPREX || {}).CARD || {})[name];
    if (!(deck === D.CARD_DECK || D.SX_CARDS.indexOf(name) >= 0 || (sc && (D.SX_FAMILY_PASS || []).indexOf(sc.family) >= 0))) return;
    if ((p.tierPass || 0) >= D.PASS_CAP) return;
    p.tierPass = (p.tierPass || 0) + 1; g.tierStats.passes.card++;
    g.emit('tier_pass', { player: p.name, via: 'card', card: name, pass: p.tierPass });
  }
  // SuprexCore: the Green Anders die's intervention opens a loophole for the roller
  function green(g, p) {
    const D = g.tierDials; if (!g.suprex || !D.SX_GREEN_PASS || (p.tierPass || 0) >= D.PASS_CAP) return;
    p.tierPass = Math.min(D.PASS_CAP, (p.tierPass || 0) + D.SX_GREEN_PASS); g.tierStats.passes.anders++;
    g.emit('tier_pass', { player: p.name, via: 'the Green Anders loophole', pass: p.tierPass });
  }
  // bot policy (not a rule): chase an open spot you can settle; sit on the one you hold
  function botPull(g, p, c) {
    const T = g.tiers, D = g.tierDials, t = T.spots[c]; if (!t) return 0;
    if (T.holder[c] === p.name) return c === p.at ? D.BOT_STAY : 0;
    if ((heldBy(g, p) && !lease(g)) || (T.holder[c] && !(g.suprex && T.holder[c] && passOf(g, p) >= passOf(g, g.players.find(x => x.name === T.holder[c]) || p))) || (t - 1) > passOf(g, p) || !open(g, c)) return 0;
    return (g.suprex ? D.SX_BOT_PULL : D.BOT_PULL) + 2 * t;
  }
  function state(g) {
    if (!g.tiers) return null;
    const T = g.tiers;
    return { spots: Object.keys(T.spots).map(c => ({ at: c, tier: T.spots[c], name: NAMES[T.spots[c]], holder: T.holder[c] || null, open: open(g, c) })),
      passes: g.players.map(p => ({ player: p.name, pass: p.tierPass || 0, effective: passOf(g, p) })), siphonPer: T.siphonPer };
  }
  global.OIL_TIERS = { DIALS, NAMES, setup, arrive, roundTick, onCard, green, botPull, state, passOf };
})(typeof window !== 'undefined' ? window : globalThis);
