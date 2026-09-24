/* OiL! THE TABLE — the negotiation / table-politics layer.
   ============================================================================
   Roadmap #2 (docs/WHERE-IT-STANDS.md): "no negotiation, alliances, or betrayal —
   which is exactly where oil's real ugliness lives (cartels, who gets thrown under
   the bus)." Two of the designer's own cards NAME a diplomacy layer the game did
   not have ("No Words." — *negotiations are concluded, they never began*;
   "Hobbesian" — *nasty, brutish, and this round*), and CORE-001 names "alliances"
   and "force payment from competitors" as open. This file builds that layer.

   CONCEPT (House Rule 5): the SHAPE below is a strawman translation, exactly like
   src/oil-cards.js. Every number is a DIAL, swept and proven by the lab — none is
   declared canon. Open questions for the designer are logged as OPEN_QUESTIONS at
   the bottom of this file and mirrored into ../data.py (CORE-015).

   THE THESIS IT SERVES — "you only ever control the ruin":
     · a deal is never enforceable. It is held together ONLY by what breaking it
       costs you at the verdict. There is no contract, only complicity.
     · colluding WORKS and colluding is DIRTY: every cartel tick pays both parties
       and marks both parties. Since the verdict is control > exposure > holdings,
       money is the weakest currency — you cannot collude your way to a clean win.
     · a standing deal SHIELDS you from your partner's E.D.D. strike. That is the
       whole incentive, and it is why the endgame is a defection cascade: the bots
       break their pacts the moment E.D.D. arms. Cartels dissolve at the crisis.
     · betrayal is remembered. A GRUDGE retargets the betrayed player's E.D.D.
       strike onto the traitor, over the richest seat. The deals you made decide
       who the cannibalism lands on.

   HARD RULES (so the franchise laws survive — proven in LAB 6 / sweep PART 6):
     · NO deal may touch the oil clock. Not burn it, not add it. The collapse
       clock stays exactly as monotonic as it was (Charter L2/E3).
     · NO deal may move the shared PRICE. The market has no house drift (E1) and a
       deal is a private arrangement, not a market event — cards move the tape,
       deals move people.
     · every deal must create a SWING (touch a player who is not the offerer),
       the same grammar CORE-010 locked for cards.
     · all randomness goes through g.rng (seed -> outcome stays byte-stable).
   With deals OFF (the default) the engine takes no new branch and draws no RNG,
   so every frozen sweep number is untouched. */
(function (global) {
  'use strict';

  // ---- DIALS (all CONCEPT — the lab sweeps them) ----------------------------
  const DEAL_DIALS = {
    LIFE: 4,            // turns a standing deal lasts before it lapses cleanly
    // PACT — the cartel. Symmetric: hold the line together.
    PACT_SKIM: 3,       // value each member banks per tick (the cartel skim)
    PACT_HEAT: 1,       // exposure each member takes per tick (collusion is on the record)
    // TRIBUTE — the toll. The offerer COLLECTS; the target buys protection.
    TRIB_VAL: 6,        // value the payer transfers to the holder per tick
    TRIB_SHIELD: 1,     // exposure the payer sheds per tick (protection money)
    TRIB_CARRY: 1,      // exposure the holder takes per tick (you carry their liability)
    // SCAPEGOAT — one-shot. Two parties agree on whose fault it was.
    SCAPE_DUMP: 3,      // exposure dumped on the named third party
    SCAPE_SHED: 1,      // exposure each party sheds
    SCAPE_PIP: 1,       // pips each party pays to arrange it
    // BETRAYAL
    BREAK_LOOT: 8,      // value the breaker seizes from the partner's book
    BETRAY_HEAT: 3,     // exposure the breaker takes (it's on the record)
    // bot temperament (seed-stable via g.rng)
    OFFER_RATE: 0.35,   // chance a bot opens negotiations on its turn
    ACCEPT_RATE: 0.5,   // baseline chance a bot accepts an offer it doesn't love
  };

  const clamp0 = v => Math.max(0, v);
  const nameOf = p => p && p.name;

  // ---- the deal TYPES ---------------------------------------------------------
  // Each type: label/blurb (UI), needsTarget, ok(g,a,b) legality, form(g,d) on
  // acceptance, tick(g,d) per upkeep (standing only), broke(g,d,breaker) on renege.
  // `d` = { type, a (offerer), b (target), ticks, paid, carried }.
  const TYPES = {
    PACT: {
      label: 'PACT', standing: true,
      blurb: 'Hold the line together. Each turn it stands you both bank the cartel skim — and you are both on the record.',
      ok: (g, a, b) => !g.dealBetween(a, b),
      form(g, d) { /* the arrangement itself costs nothing; the ticks are the deal */ },
      tick(g, d) {
        const D = g.dealDials;
        [d.a, d.b].forEach(q => { q.value += D.PACT_SKIM; q.exposure += D.PACT_HEAT; });
        d.paid += D.PACT_SKIM;
      },
      broke(g, d, breaker) {
        const D = g.dealDials, victim = breaker === d.a ? d.b : d.a;
        const loot = Math.min(victim.value, D.BREAK_LOOT);
        victim.value -= loot; breaker.value += loot;         // you walk with the shared book
        return { loot };
      },
    },
    TRIBUTE: {
      label: 'TRIBUTE', standing: true,
      blurb: 'They pay you to be left alone. Each turn they hand over value and shed liability — and you carry it.',
      ok: (g, a, b) => !g.dealBetween(a, b),
      form(g, d) { },
      tick(g, d) {
        const D = g.dealDials;
        const pay = Math.min(d.b.value, D.TRIB_VAL);          // payer = b, holder = a
        d.b.value -= pay; d.a.value += pay; d.paid += pay;
        d.b.exposure = clamp0(d.b.exposure - D.TRIB_SHIELD);
        d.a.exposure += D.TRIB_CARRY; d.carried += D.TRIB_CARRY;
      },
      broke(g, d, breaker) {
        if (breaker === d.a) {                                // the holder dumps the liability back
          const back = Math.min(d.carried, d.a.exposure);
          d.a.exposure -= back; d.b.exposure += back;
          return { shoved: back };
        }
        const back = Math.min(d.a.value, d.paid);             // the payer claws the toll back
        d.a.value -= back; d.b.value += back;
        return { clawed: back };
      },
    },
    SCAPEGOAT: {
      label: 'SCAPEGOAT', standing: false,
      blurb: 'Agree on whose fault it was. You both come out cleaner; the biggest operator at the table wears it.',
      // needs a third party who is neither of you, and a pip from each
      ok: (g, a, b) => !!g.scapegoatFor(a, b) && a.pips >= g.dealDials.SCAPE_PIP && b.pips >= g.dealDials.SCAPE_PIP,
      form(g, d) {
        const D = g.dealDials, v = g.scapegoatFor(d.a, d.b);
        d.a.pips -= D.SCAPE_PIP; d.b.pips -= D.SCAPE_PIP;
        [d.a, d.b].forEach(q => { q.exposure = clamp0(q.exposure - D.SCAPE_SHED); });
        if (v) v.exposure += D.SCAPE_DUMP;
        d.victim = nameOf(v);
      },
    },
  };

  // ---- what the active player may put on the table this turn ------------------
  // ONE statement, not two prompts: "TRIBUTE:3" is "a toll, from that one" — the way
  // it is actually said at a table. Encoded TYPE:targetId, or BREAK:dealUid.
  function dealMoves(g, p) {
    const opts = [];
    // standing deals you are IN may always be broken, even under a deal freeze.
    // You can always stop honouring something.
    g.standingFor(p).forEach(d => opts.push('BREAK:' + d.uid));
    if (!g.dealFreeze) {
      for (const t of Object.keys(TYPES)) {
        for (const q of g.players) if (q !== p && TYPES[t].ok(g, p, q)) opts.push(t + ':' + q.id);
      }
    }
    return opts;
  }
  // parse a move string back into {type, target} / {breakUid}
  function parseMove(g, move) {
    const m = String(move || '');
    if (m.indexOf('BREAK:') === 0) return { breakUid: m.slice(6) };
    const i = m.indexOf(':');
    if (i < 0) return null;
    const type = m.slice(0, i), b = g.players[+m.slice(i + 1)];
    return (TYPES[type] && b) ? { type, target: b } : null;
  }

  // pick a TYPE and a TARGET in one go. Greedy extracts (a toll off the richest);
  // the steward builds cartels and steadies whoever is most exposed.
  function bestOffer(g, p, offers, R) {
    const order = p.policy === 'stable' ? ['PACT', 'SCAPEGOAT', 'TRIBUTE'] : ['TRIBUTE', 'SCAPEGOAT', 'PACT'];
    for (const t of order) {
      const same = offers.filter(o => o.indexOf(t + ':') === 0);
      if (!same.length) continue;
      const score = o => { const q = g.players[+o.slice(o.indexOf(':') + 1)]; if (!q) return -1;
        return p.policy === 'stable' ? q.exposure : q.holdings(g.price); };
      return same.reduce((a, b) => (score(a) >= score(b) ? a : b));
    }
    return R.pick(offers);
  }

  // ---- bot temperament (the automa; humans plug the same ask() seam) ----------
  // Seed-stable: every random read goes through g.rng.
  function policy(g, p, ctx) {
    const D = g.dealDials, R = g.rng;
    const breaks = (ctx.options || []).filter(o => String(o).startsWith('BREAK:'));

    // ONE TABLE ACTION: the card in your hand competes with the deal on the table.
    if (ctx.kind === 'table') {
      const cards = ctx.cards || [];
      // THE DEFECTION CASCADE: once E.D.D. is armed, everyone but the steward
      // walks. This is the mechanic that makes the collapse socially ugly.
      if (breaks.length && p.policy !== 'stable') {
        if (g.edd || R.random() < 0.15) return R.pick(breaks);
      }
      const offers = (ctx.options || []).filter(o => o.indexOf(':') > 0 && o.indexOf('BREAK:') !== 0);
      const wantsDeal = offers.length && R.random() < D.OFFER_RATE;
      const wantsCard = cards.length && R.random() < 0.6;
      // when both are live it is a real choice; the steward talks, the greedy play.
      const dealFirst = p.policy === 'stable' ? true : !wantsCard;
      if (wantsDeal && dealFirst) return bestOffer(g, p, offers, R);
      if (wantsCard) return R.pick(cards);
      if (wantsDeal) return bestOffer(g, p, offers, R);
      return 'pass';
    }

    if (ctx.kind === 'dealoffer') {
      const d = ctx.deal;
      if (p.policy === 'stable') return 'accept';
      if (p.grudges && p.grudges.includes(d.a.id)) return 'decline';          // never twice
      // you accept protection when you're dirty, a cartel when you're not leading,
      // and a scapegoating whenever it isn't you wearing it.
      if (d.type === 'TRIBUTE') return (p.exposure >= 4 || R.random() < D.ACCEPT_RATE) ? 'accept' : 'decline';
      if (d.type === 'SCAPEGOAT') return 'accept';
      return (R.random() < D.ACCEPT_RATE) ? 'accept' : 'decline';
    }
    return 'pass';
  }

  // ---- open questions for the designer (mirrored to ../data.py CORE-015) ------
  const OPEN_QUESTIONS = [
    'Is a deal binding for a fixed number of turns, or until one side walks?',
    'Can a deal be made with more than one rival at once (a real cartel), or only pairwise?',
    'Does the table talk out loud (real negotiation) or is an offer a closed proposal?',
    'Is one table action per turn right — a card OR a deal, never both?',
    'Is the drink mechanic (CORE-003) the seal on a deal — you drink on it?',
    'Should a broken deal be public knowledge, or only known to the two parties?',
  ];

  const REG = { DEAL_DIALS, TYPES, dealMoves, parseMove, policy, OPEN_QUESTIONS };
  global.OIL_DEALS_FX = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
