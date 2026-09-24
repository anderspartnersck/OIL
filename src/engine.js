/* ER$N ENGINE — async, agent-driven JS engine (v2).
   Faithful to engine.py's balance (meters, collapse, Juice/movement loop, victory + Final
   Favor) but every decision now flows through a per-player `agent`, so a human seat and the
   reaction/targeting/asset-modifier systems (P2) can pause resolution mid-turn.

   - BotAgent reproduces the headless sim's RNG behavior → bot-only games keep the validated balance.
   - HumanAgent (set by the UI) returns Promises resolved by player clicks.
   - Lineup entries are objects {card, up, dirty, mods:[]}; mods are place-on-top retags with timers.

   Runs in the browser (attaches to window) and under Node (attaches to globalThis) for the
   headless harness in scripts/. */
(function (global) {
  'use strict';

  // ---- seedable RNG (mulberry32) with a Python-random-ish surface ----
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      random: next,
      randint: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),     // inclusive
      randrange: (n) => Math.floor(next() * n),
      choice: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
      sample(arr, k) { const c = arr.slice(); this.shuffle(c); return c.slice(0, k); },
    };
  }

  const MAX_HYPE = 8;

  // ---- EDITIONS ----------------------------------------------------------------
  // 'classic'  = faithful to the printed product. FROZEN reference. Do not add rule changes here.
  // 'benchmark'= tunable lane for minor, reversible balance adjustments (see docs/ERRATA-EXTENDED.md §6).
  const VERSION = 'Classic 1.0';
  const EDITIONS = {
    classic:   { shadowOnRisk: false, shadowRiskThreshold: 6 },
    benchmark: { shadowOnRisk: true,  shadowRiskThreshold: 6 },   // Shadow SEC +1 when you END a turn at high Risk (self-inflicted)
  };

  // ===================================================================
  //  AGENTS — answer the engine's decision requests.
  //  decide(req, game, self) -> value (sync or Promise). See Game.decide for req kinds.
  // ===================================================================
  class BotAgent {
    // Reproduces the sim's built-in random policy. Pure RNG so balance == the validated headless sim.
    decide(req, game, p) {
      const R = game.rng, others = req.others || [];
      switch (req.kind) {
        case 'bribe':       return (game.collapsed || p.juice >= 6) && (R.random() < 0.5);
        case 'steps':       return p.juice > 0 ? Math.min(p.juice, R.randint(0, 2)) : 0;
        case 'door':        return R.random() < 0.4;
        case 'enterLounge': return R.random() < 0.5;
        case 'play':        { const c = req.candidates || p.hand; return (c.length && R.random() < 0.8) ? R.choice(c) : null; }
        case 'target':      return req.candidates.length ? R.choice(req.candidates) : null;
        case 'asset':       return req.candidates.length ? R.choice(req.candidates) : null;
        case 'hand':        return req.candidates.length ? R.choice(req.candidates) : null;
        case 'choice':      return req.options.length ? R.choice(req.options) : null;
        // reactions: play a beneficial reaction most of the time (bots aren't perfectly optimal)
        case 'react':       return (R.random() < 0.7) ? req.card : null;
        case 'giveHype':    // a 3rd party deciding whether to bail out a Benchmark target
                            return R.random() < 0.25;
        case 'ability':     return req.ability === 'LeakyBucket';  // random bots only cling on; skip optional spends
        default:            return null;
      }
    }
  }

  // ===================================================================
  //  CHARACTER AI — bots play their kit, per "Sharky's Disgusting Cubicle" (the rules-sheet strategy).
  //  Sharky's creed (shared): embrace collapse, bait SEC, track who holds what, target the leader,
  //  let politicians spin out while you eat up. Each character then leans into their own escalation.
  // ===================================================================
  const MARKET_DECKS = new Set(['Market', 'AdvMarket']);
  // disruptive fx Wu favors — "break open someone else's books"
  const DISRUPT_FX = new Set(['RANK_YANK', 'WALKING_WALK', 'PULL_TAPE', 'LIMITED_HANGOUT', 'PARKING_LOT',
    'KAHLEEFORNYUH', 'SHORT_SELLER', 'EXEC_RETREAT', 'MANUAL_BRIEFCASE', 'MANUAL_WASNT_SIGNED',
    'MANUAL_RAPTOR_IMPLODE', 'MANUAL_SHADOW_MERGER', 'SHREDDED_AUDIT']);

  // per-character knobs. playScore(card) ranks hand options; the rest tune the loop decisions.
  const PERSONA = {
    'Benny Boye': {   // rush + camp the Lounge, protect the 2-Clean, force collapse on your terms
      playRate: .8, bribe: p => p.juice >= 3, steps: () => 0, door: () => false,
      enterLounge: () => true, reactRate: .7,
      playScore: c => (c.ctype === 'Clean' ? 4 : c.ctype === 'Dirty' ? -2 : 1),
    },
    'Claudia Numbers': {  // calculated long game: protect Trust, play Clean, AVOID Hype (Cooked)
      playRate: .75, bribe: p => p.juice >= 3 && p.trust < 4, steps: p => Math.min(p.juice, 1),
      door: () => false, enterLounge: p => p.trust >= 4, reactRate: .9,
      playScore: c => (c.ctype === 'Clean' ? 4 : c.ctype === 'Dirty' ? -1 : (MARKET_DECKS.has(c.deck) ? -1 : 1)),
    },
    'Vonda Vouch': {  // launder dirty as clean (the Stamp); patient exit
      playRate: .85, bribe: p => p.juice >= 4, steps: p => Math.min(p.juice, 1),
      door: g => false, enterLounge: p => (p.trust >= 4 || p.hype >= 8), reactRate: .8,
      playScore: c => (c.ctype === 'Dirty' ? 3 : c.ctype === 'Clean' ? 2 : 1),
    },
    'Danny Dough': {  // hoard/chase Juice, protect the doubling spiral — don't spend down early
      playRate: .85, bribe: p => p.juice >= 9, steps: p => Math.min(p.juice, 2),
      door: p => p.juice >= 5, enterLounge: p => (p.trust >= 4 || p.hype >= 8), reactRate: .7,
      playScore: c => (MARKET_DECKS.has(c.deck) ? 3 : c.ctype === 'Clean' ? 2 : 1),
    },
    'Wu Drainer': {   // mobile disruptor, box out, break open others' books; burns hot (not a door-farmer)
      playRate: .9, bribe: p => p.juice >= 6, steps: p => Math.max(1, Math.min(p.juice, 2)),
      door: (p, g) => g.rng.random() < 0.45, enterLounge: p => (p.trust >= 4 || p.hype >= 8), reactRate: .75,
      playScore: c => (DISRUPT_FX.has(c.fx) ? 4 : c.ctype === 'Clean' ? 2 : 1),
    },
    'Mark Markit': {  // BRANDING: pump Hype to the bubble, ride the Hype→Lounge bridge (it's on fire)
      playRate: .92, bribe: p => p.juice >= 7, steps: p => Math.min(p.juice, 2),
      door: () => false, enterLounge: p => p.hype >= 8, reactRate: .55,
      playScore: c => (MARKET_DECKS.has(c.deck) ? 4 : c.ctype === 'Clean' ? 2 : 1),
    },
  };

  // threat score for "target the leader" — closeness to a clean Lounge win dominates
  function threat(g, q) { return (q.in_lounge ? 6 : 0) + q.clean_count() * 2 + q.trust * 0.3 + q.hype * 0.12 + q.juice * 0.1 - q.risk * 0.2; }

  class CharacterAgent {
    constructor() { this.bot = new BotAgent(); }
    decide(req, game, p) {
      const R = game.rng, persona = PERSONA[p.name];
      if (!persona) return this.bot.decide(req, game, p);
      switch (req.kind) {
        case 'bribe':       return persona.bribe(p, game);
        case 'steps':       return persona.steps(p, game);
        case 'door':        return persona.door(p, game);
        case 'enterLounge': return persona.enterLounge(p, game);
        case 'react':       return (R.random() < persona.reactRate) ? req.card : null;
        case 'play': {
          const cs = req.candidates || p.hand;
          if (!cs.length || R.random() >= persona.playRate) return null;
          // weighted pick by playScore (+ jitter so bots aren't deterministic/exploitable)
          let best = null, bestW = -Infinity;
          for (const c of cs) { const w = persona.playScore(c) + R.random(); if (w > bestW) { bestW = w; best = c; } }
          return best;
        }
        case 'target': {    // Sharky: target the leader (most threatening opponent)
          const cs = req.candidates; if (!cs || !cs.length) return null;
          return cs.reduce((m, x) => threat(game, x) > threat(game, m) ? x : m);
        }
        case 'ability':     // in-character use of the printed secondary abilities
          if (req.ability === 'Unimpeachable') return p.trust < 4 && p.juice >= 7;  // only buy Trust to clear the Lounge bar, and only with spare Juice
          if (req.ability === 'Doughmination') return p.juice >= 10 && p.hype >= 2; // Danny converts a Juice surplus to a Hype spike
          if (req.ability === 'Notary') return false;                       // Vonda keeps her Assets (the Stamp wants them)
          if (req.ability === 'LeakyBucket') return true;                   // Vonda always clings to the Lounge
          return false;
        default:            return this.bot.decide(req, game, p);   // asset/hand/choice/giveHype
      }
    }
  }

  class Player {
    constructor(cd) {
      this.cd = cd; this.name = cd.name;
      this.juice = cd.juice; this.trust = cd.trust; this.hype = cd.hype;
      this.risk = 0; this.bribes = 0;
      this.hand = [];        // Card[]
      this.lineup = [];      // [{card, up, dirty, mods:[]}]
      this.pos = 'START';    // 'START' | int 0..8 | 'LOUNGE'
      this.in_lounge = false;
      this.skip_next = false;
      this.lounge_streak = 0;
      this.maxhype_streak = 0;
      this.alive = true;
      this.burned = false;
      this.policy = null;
      this.sec_immunity = 0;
      this.grace_immunity = false;   // Regulatory Grace Period
      this.swap_with = null;         // Executive Shuffling (ability swap next turn)
      this.private_dance_used = false;
      this.isHuman = false;
      this.agent = new BotAgent();
      this.color = cd.color || '#c89a3c';
      // Final Favor tallies
      this.ff_bribe_used = 0; this.ff_clean_turned_dirty = 0; this.ff_burnout = 0;
      this.ff_entered_sec_willingly = 0; this.ff_survived_collapse_round = 0;
      this.ff_burned_8plus_juice = 0; this.ff_passed_to_market = 0; this.ff_stole_asset = 0;
      this.acct_whisper = false;     // MANUAL_ACCT_WHISPER (Risk counts 0 if Shadow<6 at scoring)
    }
    // ---- lineup helpers (mods are place-on-top retags with turn timers) ----
    asset_count() { return this.lineup.length; }
    facedown_count() { return this.lineup.filter(t => !t.up).length; }
    topMod(t) { for (let i = t.mods.length - 1; i >= 0; i--) if (t.mods[i].turns !== 0) return t.mods[i]; return null; }
    effDirty(t) { const m = this.topMod(t); if (m && m.tag === 'clean') return false; if (m && m.tag === 'dirty') return true; if (m && m.tag === 'conditional') return false; return t.dirty; }
    noEffect(t) { const m = this.topMod(t); return !!(m && (m.noeffect || m.tag === 'conditional')); }
    hasConstant(fx) { return this.lineup.some(t => t.card.fx === fx && t.up && !this.noEffect(t)); }
    faceup_clean() { return this.lineup.filter(t => t.up && !this.effDirty(t)); }
    faceup_dirty() { return this.lineup.filter(t => t.up && this.effDirty(t)); }
    clean_count() { return this.lineup.filter(t => !this.effDirty(t)).length; }   // victory clean count
    final_favor() {
      let positives = this.ff_entered_sec_willingly + this.ff_survived_collapse_round +
        this.ff_burned_8plus_juice + this.ff_passed_to_market + this.ff_stole_asset;
      if (this.clean_count() === 2) positives += 1;   // exactly-2-Clean bonus
      const penalties = this.ff_bribe_used + this.ff_clean_turned_dirty + this.ff_burnout;
      return positives - penalties;   // Accounting Whisper's Risk->0 affects tie-break ordering, see Game.effRisk
    }
    tickMods(log) {
      for (const t of this.lineup) {
        for (const m of t.mods) {
          if (m.turns > 0 && m.turns !== Infinity) m.turns -= 1;
        }
        t.mods = t.mods.filter(m => m.turns === Infinity || m.turns > 0);
      }
    }
  }

  // reaction triggers -> which card fx can respond
  const REACTS = {
    playCleanAsset:   ['MANUAL_INTERCEPT', 'MANUAL_COUNTERPARTY'],
    wouldLoseTrust:   ['MANUAL_TRUSTFALL', 'MANUAL_RESTRUCTURE'],
    failedTrustCheck: ['MANUAL_REROLL', 'MANUAL_PHANTOM'],
    targeted:         ['MANUAL_TECHNICALITY', 'MANUAL_REVERSE'],
    wouldLoseDirty:   ['MANUAL_CONTROLLED_BURN'],
  };
  // reaction cards held in hand must NOT be spent by the proactive play step (they wait for a trigger).
  // Face-up/face-down reaction assets ARE played proactively (into the lineup) and react from there.
  const HOLD_IN_HAND = new Set(['MANUAL_TECHNICALITY', 'ENDGAME_STOCK_BUY']);
  function proactivelyPlayable(c) { return !(HOLD_IN_HAND.has(c.fx) && c.play === 'KeepInHand'); }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rng = makeRng(opts.seed);
      this.expansion = opts.expansion !== false;
      this.edition = EDITIONS[opts.edition] ? opts.edition : 'classic';
      this.rules = EDITIONS[this.edition];     // edition knobs; classic = print-faithful
      this.loglines = [];
      this.events = [];          // structured events for the UI animator
      const chosenDefs = opts.characters
        ? opts.characters
        : this.rng.sample(global.CHARACTERS, opts.n_players || 4);
      this.players = chosenDefs.map(c => new Player(c));
      if (opts.humanSeats) this.players.forEach((p, i) => { p.isHuman = !!opts.humanSeats[i]; });
      // bots play their character by default ("Sharky's Cubicle" policies); 'random' keeps the old pure-RNG bot
      this.botStyle = opts.botStyle || 'character';
      if (this.botStyle === 'character') for (const p of this.players) p.agent = new CharacterAgent();
      this.global_sec = 0; this.shadow_sec = 0;
      this.collapsed = false; this.collapse_turns_left = null;
      this.consecutive_assets = 0;
      this.turn = 0; this.winner = null; this.end_reason = null;
      this.order = this.players.map((_, i) => i);
      this.idx = 0; this.done = false;
      this.maxTurns = opts.maxTurns || 120;
      // decks
      this.decks = {}; this.discards = {};
      const map = { SEC: 'ShadowSEC', Asset: 'AdvAsset', Market: 'AdvMarket' };
      for (const key of ['SEC', 'Asset', 'Market']) {
        let base = (global.DECK_OF[key] || []).slice();
        if (this.expansion) base = base.concat((global.DECK_OF[map[key]] || []).slice());
        this.rng.shuffle(base);
        this.decks[key] = base; this.discards[key] = [];
      }
      for (const p of this.players) p.sec_immunity = this.expansion ? 1 : 0;
    }

    log(s) { this.loglines.push(s); }
    emit(type, data) { this.events.push(Object.assign({ type, turn: this.turn }, data || {})); }

    // route a decision to the acting player's agent (sync bot or async human)
    decide(p, req) { return Promise.resolve(p.agent.decide(req, this, p)); }

    mkEntry(card, up, dirty) { return { card, up, dirty: !!dirty, mods: [] }; }

    draw(key) {
      if (!this.decks[key].length) {
        this.decks[key] = this.discards[key]; this.discards[key] = [];
        this.rng.shuffle(this.decks[key]);
        if (!this.decks[key].length) return null;
      }
      return this.decks[key].pop();
    }

    raise_global_sec(amt, why) {
      amt = amt || 1;
      if (this.global_sec >= 8) return;
      this.global_sec = Math.min(8, this.global_sec + amt);
      this.log(`    [Global SEC +${amt} -> ${this.global_sec}] ${why || ''}`);
      this.emit('globalsec', { value: this.global_sec, why });
      if (this.global_sec >= 8 && !this.collapsed) this.begin_collapse('Global SEC reached 8');
    }
    raise_shadow_sec(amt, why) {
      amt = amt || 1;
      if (!this.expansion) return;
      this.shadow_sec = Math.min(8, this.shadow_sec + amt);
      this.log(`    [Shadow SEC +${amt} -> ${this.shadow_sec}] ${why || ''}`);
      this.emit('shadowsec', { value: this.shadow_sec, why });
      if (this.shadow_sec >= 8 && !this.collapsed) {
        this.begin_collapse('Shadow SEC reached 8');
        this.collapse_turns_left = 1;
      }
    }
    begin_collapse(reason) {
      if (this.collapsed) return;
      this.collapsed = true;
      if (this.collapse_turns_left === null) this.collapse_turns_left = 3;
      this.end_reason = `COLLAPSE: ${reason}`;
      this.log(`  *** COLLAPSE BEGINS: ${reason} ***`);
      this.emit('collapse', { reason });
    }

    // ---- Trust loss routed through the reaction window (Trust Fall / Restructuring) ----
    async lose_trust(p, amt, cause, byOpp) {
      if (amt <= 0) { p.trust -= amt; return; }
      const reacted = await this.offerReaction('wouldLoseTrust', { player: p, amount: amt, cause, byOpp });
      if (reacted) return;          // negated
      p.trust -= amt;
    }

    // Class Ring (pass on 2+) buff and The Safe (must roll 6) debuff override the threshold.
    effPassOn(p, base) {
      let v = base || 5;
      if (p._ringTurns > 0) v = Math.min(v, 2);
      if (p._forcePassOn) v = Math.max(v, p._forcePassOn);
      return v;
    }
    // Pooled Leadership Model: when a player gains Trust, opponents holding it gain +1 Juice.
    gainTrust(p, amt) {
      if (amt <= 0) { p.trust += amt; return; }
      p.trust += amt;
      for (const r of this.alive_players()) if (r !== p && r.hasConstant('CONSTANT_OPP_GAIN_TRUST_JUICE1')) r.juice += 1;
    }
    // Effective Clean count for victory, folding in character/scoring abilities.
    victoryCleanCount(p) {
      let base = p.clean_count();
      // Vonda Vouch — The Stamp: 2 face-up Dirty count as 1 Clean, IF no face-down Assets in the lineup.
      if (p.name === 'Vonda Vouch' && p.facedown_count() === 0) base += Math.floor(p.faceup_dirty().length / 2);
      // Endgame Stock Buy: at scoring, a lone Clean counts as 2 if you hold the card and have <3 Risk.
      if (base === 1 && p.risk < 3 && p.hand.some(c => c.fx === 'ENDGAME_STOCK_BUY')) return 2;
      return base;
    }

    async trust_check(p, pass_on) {
      pass_on = this.effPassOn(p, pass_on || 5);
      let roll = this.rng.randint(1, 6);
      let ok = roll >= pass_on;
      if (!ok) {
        // failed-trust-check reactions (re-roll / phantom)
        const r = await this.offerReaction('failedTrustCheck', { player: p, pass_on });
        if (r === 'reroll') { roll = this.rng.randint(1, 6); ok = roll >= pass_on; if (ok) return true; }
        else if (r === 'phantom') { p.juice += 2; this.log(`    ${p.name} Phantom Holdings: +2 Juice, ignores the Risk`); return false; }
        this.add_risk(p, 1, 'failed Trust Check');
        if (p.hasConstant('CONSTANT_FAIL_TRUSTCHECK_RISK2')) this.add_risk(p, 1, 'Toxic Asset (extra Risk on fail)');
      }
      return ok;
    }

    add_risk(p, amt, why) {
      if (amt <= 0) { p.risk = Math.max(0, p.risk + amt); return; }
      p.risk += amt;
      if (p.hasConstant('CONSTANT_RISK_GIVES_HYPE')) {
        p.hype += amt;
        this.log(`    ${p.name} Toxic Merger: +${amt} Hype from risk gain`);
      }
      if (p.risk >= 8) this.burnout(p);
    }
    burnout(p) {
      if (p.burned) return;
      p.burned = true; p.ff_burnout += 1;
      p.lineup = p.lineup.filter(t => t.card.undiscardable);
      p.trust = 0; p.bribes = 0; p.risk = 5; p.juice = 1;
      this.log(`    !! BURNOUT ${p.name} -> risk 5, juice 1, assets/trust/bribes wiped (undiscardables kept)`);
      this.emit('burnout', { player: p.name });
    }

    alive_players() { return this.players.filter(p => p.alive); }
    others_of(p) { return this.alive_players().filter(x => x !== p); }
    highest_trust() { const a = this.alive_players(); if (!a.length) return null; return a.reduce((m, x) => x.trust > m.trust ? x : m); }
    highest_juice() { const a = this.alive_players(); if (!a.length) return []; const m = Math.max(...a.map(x => x.juice)); return a.filter(x => x.juice === m); }

    async pick_target(actor, others, ctx) {
      if (!others.length) return null;
      const tgt = await this.decide(actor, { kind: 'target', candidates: others, others, ctx });
      // Iron-Clad Purchase Agreement: gain +1 Juice whenever targeted by an opponent's effect.
      if (tgt && tgt !== actor && tgt.hasConstant('CONSTANT_TARGETED_JUICE1')) tgt.juice += 1;
      return tgt;
    }
    async pick_asset(actor, candidates, ctx) {
      if (!candidates.length) return null;
      return await this.decide(actor, { kind: 'asset', candidates, ctx });
    }

    _discard_asset(q, tup) {
      const i = q.lineup.indexOf(tup);
      if (i >= 0 && !tup.card.undiscardable) {
        q.lineup.splice(i, 1);
        this.discards[this._discard_key(tup.card)].push(tup.card);
        if (!q.effDirty(tup)) {
          for (const r of this.alive_players())
            if (r !== q && r.hasConstant('CONSTANT_OPP_DISCARD_CLEAN_JUICE1')) r.juice += 1;
        }
        return true;
      }
      return false;
    }
    _discard_key(c) { return ({ AdvMarket: 'Market', AdvAsset: 'Asset', ShadowSEC: 'SEC' })[c.deck] || c.deck; }
    after_sec_draw(card) {
      if (this.expansion && card.deck === 'ShadowSEC') this.raise_shadow_sec(1, `Shadow SEC card drawn (${card.name})`);
    }

    // ============== REACTION STACK ==============
    // Offer a window to any player holding a card that responds to `trigger`. Resolve inner-first
    // (we offer in turn order from the trigger; first responder resolves, then we re-scan).
    async offerReaction(trigger, ctx) {
      const fxs = REACTS[trigger]; if (!fxs) return false;
      const order = this.alive_players();
      for (const q of order) {
        if (ctx.player === q && (trigger === 'wouldLoseTrust' || trigger === 'failedTrustCheck' || trigger === 'wouldLoseDirty')) {
          // self-reactions are valid for these
        } else if (trigger === 'targeted' && q !== ctx.player) {
          continue;  // only the targeted player may use targeted reactions
        } else if ((trigger === 'wouldLoseTrust' || trigger === 'failedTrustCheck' || trigger === 'wouldLoseDirty') && q !== ctx.player) {
          continue;  // these protect the affected player only
        }
        // find an eligible card in hand or lineup
        const fromHand = q.hand.find(c => fxs.includes(c.fx));
        const fromLine = q.lineup.find(t => fxs.includes(t.card.fx));
        const card = fromHand || (fromLine && fromLine.card);
        if (!card) continue;
        const want = await this.decide(q, { kind: 'react', card, trigger, ctx });
        if (!want) continue;
        // consume the card
        if (fromHand) q.hand.splice(q.hand.indexOf(card), 1);
        else this._discard_asset_entry_silent(q, fromLine);
        this.discards[this._discard_key(card)].push(card);
        this.log(`    ${q.name} reacts with ${card.name}`);
        this.emit('react', { player: q.name, card: card.name, trigger });
        const res = await this._applyReaction(card.fx, q, ctx);
        return res === undefined ? true : res;
      }
      return false;
    }
    _discard_asset_entry_silent(q, tup) { const i = q.lineup.indexOf(tup); if (i >= 0) q.lineup.splice(i, 1); }

    async _applyReaction(fx, q, ctx) {
      switch (fx) {
        case 'MANUAL_TRUSTFALL':       if (ctx.byOpp) { ctx.byOpp.hype = 0; this.log(`    Trust Fall: ${ctx.byOpp.name} dropped to 0 Hype`); } return true;
        case 'MANUAL_RESTRUCTURE':     { const c = this.draw('Market'); if (c) q.hand.push(c); return true; }
        case 'MANUAL_REROLL':          return 'reroll';
        case 'MANUAL_PHANTOM':         return 'phantom';
        case 'MANUAL_TECHNICALITY':    ctx.ignored = true; return true;     // effect source pays (handled by caller)
        case 'MANUAL_REVERSE':         ctx.reversed = true; return true;
        case 'MANUAL_CONTROLLED_BURN': {  // +1 Hype; the threatened Dirty leaves you and lands on an opponent
          q.hype += 1; ctx.kept = true;
          if (ctx.asset) {
            const i = q.lineup.indexOf(ctx.asset); if (i >= 0) q.lineup.splice(i, 1);
            const opps = this.others_of(q);
            if (opps.length) { const tgt = await this.pick_target(q, opps, 'controlled-burn'); tgt.lineup.push(this.mkEntry(ctx.asset.card, true, true)); }
          }
          return true;
        }
        case 'MANUAL_INTERCEPT': {  // steal the clean asset to hand, +2 Risk (Bribe shifts to opp)
          if (ctx.asset && ctx.actor) {
            const i = ctx.actor.lineup.indexOf(ctx.asset);
            if (i >= 0) ctx.actor.lineup.splice(i, 1);
            q.hand.push(ctx.asset.card); q.ff_stole_asset += 1; ctx.intercepted = true;
            if (q.bribes > 0) { q.bribes -= 1; q.ff_bribe_used += 1; this.add_risk(ctx.actor, 2, 'Asset in Transit (bribe-shifted)'); }
            else this.add_risk(q, 2, 'Asset in Transit');
          }
          return true;
        }
        case 'MANUAL_COUNTERPARTY': {  // opp discards the clean asset + draws SEC
          if (ctx.asset && ctx.actor) {
            this._discard_asset(ctx.actor, ctx.asset); ctx.intercepted = true;
            const c = this.draw('SEC'); if (c) { await this.resolve_card(c, ctx.actor, this.others_of(ctx.actor)); this.after_sec_draw(c); }
          }
          return true;
        }
        default: return true;
      }
    }

    // Discard a Dirty asset, first offering its owner the Controlled Burn reaction window.
    async loseDirtyAsset(q, t) {
      if (!t) return;
      const ctx = { player: q, asset: t };
      await this.offerReaction('wouldLoseDirty', ctx);
      if (ctx.kept) return;            // Controlled Burn rerouted it to an opponent
      this._discard_asset(q, t);
    }

    // A targeted MANUAL effect calls this first; returns 'ok' | 'ignored' | 'reversed'.
    async checkTargeted(target, srcCard, actor) {
      const ctx = { player: target, srcCard, actor };
      await this.offerReaction('targeted', ctx);
      if (ctx.ignored) { this.log(`    ${target.name} ignores ${srcCard.name} on a technicality`); return 'ignored'; }
      if (ctx.reversed) { this.log(`    ${target.name} reverses ${srcCard.name} (Friendly Audit)`); return 'reversed'; }
      return 'ok';
    }

    // ============== CARD RESOLUTION ==============
    async resolve_card(card, p, others) {
      const fx = card.fx;
      const R = this.rng;
      const alive = () => this.alive_players();
      const D = (q, t) => this._discard_asset(q, t);
      const lt = (q, amt, why, by) => this.lose_trust(q, amt, why, by);
      if (fx.startsWith('MANUAL')) return await this._resolveManual(card, p, others);
      switch (fx) {
        case 'ALL_JUICE-1_TRUSTCHECK_FAILHYPE': for (const q of alive()) { q.juice -= 1; if (!(await this.trust_check(q))) q.hype -= 2; } break;
        case 'ALL_DISCARD_ELSE_RISK1': for (const q of alive()) { if (q.hand.length) q.hand.splice(R.randrange(q.hand.length), 1); else this.add_risk(q, 1, 'Audit Panic'); } break;
        case 'ROLL_SELF_OR_ALL_TRUST2': if (R.randint(1, 6) <= 3) await lt(p, 2, 'CEO Forfeits'); else for (const q of alive()) await lt(q, 2, 'CEO Forfeits'); break;
        case 'ALL_HYPE-2_DIRTY_DISCARD': for (const q of alive()) { q.hype -= 2; if (q.faceup_dirty().length) await this.loseDirtyAsset(q, q.faceup_dirty()[0]); } break;
        case 'ALL_REVEAL_0ASSET_RISK-1': for (const q of alive()) if (q.asset_count() === 0) this.add_risk(q, -1); break;
        case 'RISK3PLUS_JUICE-3': for (const q of alive()) if (q.risk >= 3) q.juice -= 3; break;
        case 'TRUST0_RISK+3': for (const q of alive()) if (q.trust <= 0) this.add_risk(q, 3, 'Fake Receipts'); break;
        case 'ALL_DISCARD_ELSE_TRUST-1': for (const q of alive()) { if (q.hand.length) q.hand.splice(R.randrange(q.hand.length), 1); else await lt(q, 1, 'Document Request'); } break;
        case 'ALL_DRAW_SEC': for (const q of alive()) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, q, alive().filter(x => x !== q)); this.after_sec_draw(c); } } break;
        case 'ALL_JUICE-2': for (const q of alive()) q.juice -= 2; break;
        case 'ALL_HYPE+2': for (const q of alive()) q.hype += 2; break;
        case 'HYPE4_TRUST-2_ELSE_DISCARD_OR_RISK2': for (const q of alive()) { if (q.hype >= 4) await lt(q, 2, 'Mark to Mayhem'); else { if (q.lineup.length) D(q, q.lineup[0]); else this.add_risk(q, 2, 'Mark to Mayhem'); } } break;
        case 'ASSET2_HYPE-2_THEN_0DISCARD': for (const q of alive()) if (q.asset_count() >= 2) { q.hype -= 2; if (q.hype <= 0 && q.lineup.length) D(q, q.lineup[0]); } break;
        case 'CLEAN_DISCARD_ELSE_0ASSET_HYPE2': for (const q of alive()) { if (q.faceup_clean().length) { if (q.hand.length) q.hand.splice(R.randrange(q.hand.length), 1); else D(q, q.faceup_clean()[0]); } else if (q.asset_count() === 0) q.hype += 2; } break;
        case 'HIGHEST_TRUST_SKIP': { const t = this.highest_trust(); if (t) t.skip_next = true; break; }
        case 'ALL_RISK1_UNLESS_MARKET_DISCARD': for (const q of alive()) { const md = q.hand.filter(c => c.deck === 'Market' || c.deck === 'AdvMarket'); if (md.length) q.hand.splice(q.hand.indexOf(md[0]), 1); else this.add_risk(q, 1, 'Regulatory Blitz'); if (q.hype >= 4) this.add_risk(q, 1, 'Blitz hype'); } break;
        case 'SELF_0FACEDOWN_RISK-1': if (p.facedown_count() === 0) this.add_risk(p, -1); break;
        case 'ALL_JUICE2_RISK2': for (const q of alive()) { q.juice += 2; this.add_risk(q, 2, 'Rolling Blackouts'); } break;
        case 'HIGHEST_TRUST_DISCARD_CLEAN_ELSE_SKIP_OTHERS_RISK-1': { const t = this.highest_trust(); if (t) { if (t.faceup_clean().length) D(t, t.faceup_clean()[0]); else t.skip_next = true; for (const q of alive()) if (q !== t) this.add_risk(q, -1); } break; }
        case 'ASSET3_RISK+3': for (const q of alive()) if (q.asset_count() >= 3) this.add_risk(q, 3, 'Senate Hearing'); break;
        case 'ALL_ROLL_DISCARD_HAND_OR_ASSET': for (const q of alive()) if (q.hand.length) { if (R.randint(1, 6) <= 4) q.hand.splice(R.randrange(q.hand.length), 1); else if (q.lineup.length) D(q, q.lineup[0]); else if (q.asset_count() === 0) this.add_risk(q, 2, 'Spreadsheet'); } break;
        case 'SHIFT_RISK_ELSE_TRUST-1': if (others.length) { const tgt = await this.pick_target(p, others); this.add_risk(p, -1); this.add_risk(tgt, 1, 'Token Diversion'); } if (p.bribes === 0) await lt(p, 1, 'Token Diversion'); break;
        case 'SELF_RISK_PER_DIRTY': this.add_risk(p, p.faceup_dirty().length, 'What the Hell'); break;
        case 'SELF_JUICE1': p.juice += 1; break;
        case 'GOLDEN_PARACHUTE': if (others.length) { const tgt = await this.pick_target(p, others); tgt.juice += 3; if (tgt.lineup.length) D(tgt, tgt.lineup[0]); } break;
        case 'JUICE_TANKER': { const roll = R.randint(1, 6); p.juice += roll; if (roll <= 2) { for (const t of p.lineup) if (t.card === card) { t.up = true; t.dirty = true; } this.log(`    Juice Tanker broke (rolled ${roll}) -> dead Dirty Asset`); } break; }
        case 'JUNK_VEHICLE': if (others.length) { const tgt = await this.pick_target(p, others); tgt._junk_tax_pending = true; this.log(`    Junk Vehicle Trust: ${tgt.name} pays 2 Juice/space on their next turn`); } break;
        case 'STAKEHOLDER_SUMMIT': if (others.length) { const tgt = await this.pick_target(p, others); if (tgt.hype > 0) { tgt.hype -= 1; p.hype += 1; } else this.add_risk(tgt, 1, 'Stakeholder Summit'); } break;
        case 'THE_SAFE': if (others.length) { const tgt = await this.pick_target(p, others); tgt._safe_pending = 6; this.log(`    The Safe: ${tgt.name} must roll a 6 to pass any Trust Check next turn`); } break;
        case 'BEARS': { if (p.facedown_count() >= 2) p.juice += 3; const cl = p.hand.filter(c => c.ctype === 'Clean'); if (cl.length) { this.add_risk(p, 2, 'Bears'); p.hand.splice(p.hand.indexOf(cl[0]), 1); } break; }
        case 'BULLS': if (p.asset_count() >= 2) { p.juice += 3; if (p.juice >= 8) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, p, others); this.after_sec_draw(c); } } } break;
        case 'EXEC_BACKPAT': if (others.length) { const tgt = await this.pick_target(p, others); if (tgt.trust > 0) { await lt(tgt, 1, 'Exec Back-Pat', p); this.gainTrust(p, 1); } if (tgt.hype > 0) { tgt.hype -= 1; p.hype += 1; } } break;
        case 'JUICE_SPLIT': if (others.length) (await this.pick_target(p, others)).juice += 1; p.juice += 1; break;
        case 'LATE_DISCLOSURE': if (p.hand.length === 0) for (const q of others) this.add_risk(q, 1, 'Late Disclosure'); break;
        case 'PIGS': if (p.asset_count() >= 3) { const tgt = p.faceup_clean().length ? p.faceup_clean()[0] : p.lineup[0]; D(p, tgt); await lt(p, 1, 'Pigs Get Slaughtered'); } break;
        case 'PUMP_DITCH': if (p.lineup.length) { D(p, p.lineup[0]); p.hype += 3; } break;
        case 'SHORT_SELLER': if (others.length) { const tgt = await this.pick_target(p, others); tgt.juice -= 1; p.juice += 1; if (!(await this.trust_check(tgt))) this.add_risk(tgt, 2, 'Short-Seller'); } break;
        case 'STOCK_INFLATE': p.hype *= 2; await lt(p, 1, 'Stock Inflation'); break;
        case 'TOWER_TOUR': p.pos = 'START'; p.in_lounge = false; break;
        case 'TRADING_WEATHER': if (R.randint(1, 6) >= 4) for (const q of alive()) q.juice += 2; else for (const q of alive()) this.add_risk(q, 1, 'Trading Weather'); break;
        case 'TRUST_OPTION_ROLLOVER': if (others.length) { const tgt = await this.pick_target(p, others); this.add_risk(p, -1); this.add_risk(tgt, 1, 'Rollover'); } break;
        case 'WALKING_WALK': { const fd = others.filter(q => q.facedown_count() > 0); if (fd.length) { const tgt = await this.pick_target(p, fd); D(tgt, tgt.lineup.filter(t => !t.up)[0]); } break; }
        case 'STOCK_BACK': { const dpile = this.discards['Asset']; const cleans = dpile.filter(c => c.ctype === 'Clean'); if (cleans.length) { const c = cleans[cleans.length - 1]; dpile.splice(dpile.indexOf(c), 1); p.hand.push(c); this.log(`    We're Gonna Get the Stock Back! recovers ${c.name}`); } break; }
        case 'CLASS_RING': p._ringTurns = 2; this.log(`    Class Ring: your Trust Checks pass on 2+ (this turn + your next)`); break;
        case 'ENDGAME_STOCK_BUY': break;  // scoring card — stays in hand (HOLD_IN_HAND); see victoryCleanCount
        case 'COMPLIANCE_DIVIDEND': { const t = p.faceup_dirty()[0]; if (t) { t.mods.push({ tag: 'clean', noeffect: true, turns: Infinity, src: card.name }); this.log(`    Compliance Dividend: a Dirty Asset now counts Clean (effects off)`); } break; }
        case 'BUZZ_BOMB': p.hype += 3; if (p.hype >= MAX_HYPE) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, p, others); this.after_sec_draw(c); } } break;
        case 'MOTHBALL': p.hype += 2; break;
        case 'FAVOR_SQUEEZE': { const t = this.highest_trust(); if (t) t.juice -= 1; break; }
        case 'HOT_MIC': for (const q of alive()) if (!q.hand.length) this.add_risk(q, 1, 'Hot Mic'); break;
        case 'KAHLEEFORNYUH': for (const q of alive()) if (q.lineup.length) D(q, q.lineup[0]); break;
        case 'LIMITED_HANGOUT': if (p.hype >= 4 && others.length) { p.hype -= 4; const tgt = await this.pick_target(p, others); if (tgt.faceup_clean().length) D(tgt, tgt.faceup_clean()[0]); else await lt(tgt, 2, 'Limited Hangout', p); } break;
        case 'PARKING_LOT': if (others.length) { const tgt = await this.pick_target(p, others); const ch = tgt.hand.filter(c => c.ctype === 'Clean'); if (ch.length) { tgt.hand.splice(tgt.hand.indexOf(ch[0]), 1); p.hand.push(ch[0]); } else { await lt(tgt, 2, 'Parking Lot', p); const c = this.draw('SEC'); if (c) { await this.resolve_card(c, tgt, alive().filter(x => x !== tgt)); this.after_sec_draw(c); } } } break;
        case 'PULL_TAPE': { const fd = others.filter(q => q.facedown_count() > 0); if (fd.length) { const tgt = await this.pick_target(p, fd); D(tgt, tgt.lineup.filter(t => !t.up)[0]); } break; }
        case 'REG_CAPTURE': if (this.collapsed) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, p, others); this.after_sec_draw(c); } } else this.global_sec = Math.max(0, this.global_sec - 1); break;
        case 'THROW_UNDER_BUS': for (const q of others) { q.hype += 2; if (q.hype >= MAX_HYPE) this.gainTrust(q, 1); } break;
        case 'WHISPERS_ELEVATOR': for (const q of alive()) if (!q.hand.length) this.add_risk(q, 1, 'Whispers'); this.raise_shadow_sec(1, 'Whispers in the Elevator (+1 Shadow)'); break;
        case 'BACKDATED_GOODWILL': p.hype += 1; for (const q of others) await lt(q, 1, 'Backdated Goodwill', p); break;
        case 'MEMORY_HOLE': if (p.hand.length) p.hand = []; else p.hype -= 2; break;
        case 'EXEC_RETREAT': if (others.length) { const tgt = await this.pick_target(p, others); this.add_risk(tgt, tgt.faceup_dirty().length, 'Exec Retreat'); } break;
        case 'HYPE_LOOP': p.hype += p.asset_count(); if (p.hype >= 8) p.juice += 2; this.raise_shadow_sec(1, 'Hype Loop (+1 Shadow)'); break;
        case 'INHOUSE_AUDIT': if (others.length) (await this.pick_target(p, others)).skip_next = true; break;
        case 'LEADERSHIP_THEATRE': for (const q of others) await lt(q, 1, 'Leadership Theatre', p); p.juice += 1; p.hype += 1; break;
        case 'MANDATORY_CLAUSE': if (others.length) { const tgt = await this.pick_target(p, others); const md = tgt.hand.filter(c => c.deck === 'Market' || c.deck === 'AdvMarket'); if (md.length) tgt.hand.splice(tgt.hand.indexOf(md[0]), 1); else if (tgt.lineup.length) { const t = tgt.lineup[0]; if (tgt.effDirty(t)) this.gainTrust(p, 1); D(tgt, t); } } break;
        case 'NARRATIVE_RESTATEMENT': for (const q of others) { q.hype -= 3; if (q.hype <= 0) p.juice += 3; } break;
        case 'REDACTED_EARNINGS': for (const q of alive()) { if (q.faceup_dirty().length) await this.loseDirtyAsset(q, q.faceup_dirty()[0]); else q.juice += 2; } this.raise_shadow_sec(1, 'Redacted Earnings Memo (+1 Shadow)'); break;
        case 'LIQUIDITY_SINK': for (const q of this.highest_juice()) this.add_risk(q, 2, 'Liquidity Sink'); break;
        // ---- assume-stubs finished with targeting prompts ----
        case 'FOUND_FAMILY': if (p.asset_count() <= 2 && others.length) { const tgt = await this.pick_target(p, others); this.gainTrust(p, 1); this.gainTrust(tgt, 1); this.log(`    Found Family Fund: ${p.name} and ${tgt.name} both +1 Trust`); } break;
        case 'TARGET_REVEAL': if (others.length) { const tgt = await this.pick_target(p, others); this.log(`    ${card.name}: ${tgt.name} reveals to ${p.name}`); } break;
        case 'RANK_YANK': if (others.length) { const tgt = await this.pick_target(p, others); if (tgt.lineup.length) D(tgt, tgt.lineup[0]); await lt(tgt, 1, 'Rank and Yank', p); } break;
        case 'SHREDDED_AUDIT': for (const q of alive()) { const fd = q.lineup.filter(t => !t.up); if (fd.length) D(q, fd[0]); } break;
        case 'FRESH_OFFSHORE': p.lineup.push(this.mkEntry(card, false, true)); return; // becomes a face-down dirty asset
        case 'PALACE_SKY': p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    Palace in the Sky: ${p.name} enters the Executive Lounge free`); this.emit('enter_lounge', { player: p.name }); break;
        case 'QUICK_RINSE': { const t = p.faceup_dirty()[0]; if (t) { t.mods.push({ tag: 'clean', turns: Infinity, src: card.name }); this.log(`    Quick Rinse: a Dirty Asset now counts CLEAN`); } break; }
        case 'LEGAL_OPINION': if (others.length) { const tgt = await this.pick_target(p, others); const c = tgt.hand.find(x => x.deck === 'Market' || x.deck === 'AdvMarket'); if (c) { tgt.hand.splice(tgt.hand.indexOf(c), 1); this.discards[this._discard_key(c)].push(c); } } break;
        case 'MYASS_HOLDINGS': if (others.length) { const tgt = await this.pick_target(p, others); p.juice -= 2; tgt.juice += 2; this.add_risk(p, -2); this.add_risk(tgt, 2, 'M. Yass Holdings'); } break;
        case 'BLACK_HOLE': if (others.length) { const tgt = await this.pick_target(p, others); if (tgt.lineup.length) { const a = await this.pick_asset(tgt, tgt.lineup, 'black-hole'); if (a) this._discard_asset(tgt, a); } else { tgt.juice = tgt.juice >= 0 ? 0 : tgt.juice * 2; } } break;
        case 'MARK_TO_MARKET': if (p.hype >= 3 && others.length) { p.hype -= 3; const tgt = await this.pick_target(p, others); const roll = R.randint(1, 6); const take = Math.min(roll, Math.max(0, tgt.juice)); tgt.juice -= take; p.juice += take; if (tgt.juice <= 0) { if (tgt.lineup.length) this._discard_asset(tgt, tgt.lineup[0]); else if (tgt.hand.length) tgt.hand.splice(R.randrange(tgt.hand.length), 1); } if (this.collapsed) this.add_risk(p, 2, 'Mark to Market post-collapse'); } break;
        case 'MARK_TO_MOOD': { const lvl = await this.decide(p, { kind: 'choice', options: [0, 3, 5, 7] }); p.trust = (lvl === null ? 5 : lvl); if (this.collapsed) this.add_risk(p, 2, 'Mark to Mood post-collapse'); break; }
        // ---- constants: passive; handled where they apply ----
        case 'CONSTANT_3ASSET_HYPE1': case 'CONSTANT_OPP_DISCARD_CLEAN_JUICE1': case 'CONSTANT_TARGETED_JUICE1':
        case 'CONSTANT_EXACTLY1OTHER_JUICE1': case 'CONSTANT_OPP_GAIN_TRUST_JUICE1': case 'CONSTANT_PLAY_ASSET_JUICE1':
        case 'CONSTANT_FAIL_TRUSTCHECK_RISK2': case 'CONSTANT_RISK_GIVES_HYPE': break;
        case 'DISCARD_CLEAN_OR_RISK2': if (p.faceup_clean().length) D(p, p.faceup_clean()[0]); else this.add_risk(p, 2, 'Adjusted Expectations'); break;
        default: break;
      }
    }

    // ============== MANUAL (interactive / targeting / asset-modifier) ==============
    async _resolveManual(card, p, others) {
      const fx = card.fx, R = this.rng;
      const lt = (q, amt, why, by) => this.lose_trust(q, amt, why, by);
      const target = async (pool) => (pool || others).length ? await this.pick_target(p, pool || others) : null;
      switch (fx) {
        // --- reaction-window cards: passive in lineup/hand until their trigger fires ---
        case 'MANUAL_INTERCEPT': case 'MANUAL_COUNTERPARTY': case 'MANUAL_TRUSTFALL':
        case 'MANUAL_RESTRUCTURE': case 'MANUAL_REROLL': case 'MANUAL_PHANTOM':
        case 'MANUAL_TECHNICALITY': case 'MANUAL_REVERSE': case 'MANUAL_CONTROLLED_BURN':
          // These were played to the lineup/hand by take_turn; they sit and wait for a trigger.
          return;
        case 'MANUAL_GRACE_PERIOD': p.skip_next = true; p.grace_immunity = true; this.log(`    ${p.name} takes a Regulatory Grace Period (skip + immunity)`); return;

        // --- targeting / interactive ---
        case 'MANUAL_MOU': { const tgt = await target(); if (tgt) { const c = tgt.faceup_clean()[0]; if (c) { c.mods.push({ tag: 'conditional', turns: Infinity, src: card.name }); this.log(`    MOU: ${tgt.name}'s Clean Asset is now Conditional`); } } return; }
        case 'MANUAL_BRIEFCASE': { const tgt = await target(); if (tgt) { const pool = tgt.lineup.slice(); if (pool.length) { const a = await this.pick_asset(p, pool, 'briefcase'); if (a) this._discard_asset(tgt, a); } const give = Math.min(3, tgt.juice); tgt.juice -= give; p.juice += give; } return; }
        case 'MANUAL_SHADOW_MERGER': { const dirty = p.faceup_dirty(); if (dirty.length >= 2) { const tgt = await target(); if (tgt && tgt.faceup_clean().length) { const a = tgt.faceup_clean()[0]; const i = tgt.lineup.indexOf(a); tgt.lineup.splice(i, 1); p.lineup.push(this.mkEntry(a.card, true, false)); p.ff_stole_asset += 1; } } return; }
        case 'MANUAL_BENCHMARK': { const tgt = await target(); if (!tgt) return; const third = this.others_of(p).filter(x => x !== tgt); let saved = false; for (const x of third) { if (x.hype > 0 && await this.decide(x, { kind: 'giveHype', target: tgt })) { x.hype -= 1; tgt.hype += 1; saved = true; break; } } if (saved) { p.lineup.push(this.mkEntry(card, true, true)); this.log(`    The Benchmark inverts to The Baseline (Dirty, no effect)`); } else { await lt(tgt, 1, 'The Benchmark', p); } return; }
        case 'MANUAL_LAST_ENCHILADA': { const tgt = await target(); if (tgt) { const clean = tgt.hand.find(c => c.ctype === 'Clean'); if (clean) { tgt.hand.splice(tgt.hand.indexOf(clean), 1); this.discards['Asset'].push(clean); } else tgt.hype = 0; } p._enchilada_clause = true; return; }
        case 'MANUAL_MARTYRDOM': { const d = p.faceup_dirty()[0]; if (d) this._discard_asset(p, d); for (const q of others) { await lt(q, 1, 'Mark to Martyrdom', p); if (q.trust <= 0) this.burnout(q); } p._martyr_clause = true; return; }
        case 'MANUAL_WASNT_SIGNED': { const mine = p.lineup.slice(); if (!mine.length) return; const tgt = await target(); if (!tgt || !tgt.lineup.length) return; const give = await this.pick_asset(p, mine, 'wasnt-signed-cost'); if (give) this._discard_asset(p, give); if (tgt.bribes > 0) { tgt.bribes -= 1; tgt.ff_bribe_used += 1; this.log(`    It Wasn't Signed blocked by ${tgt.name}'s Bribe`); } else { const a = await this.pick_asset(p, tgt.lineup, 'wasnt-signed-pick'); if (a) this._discard_asset(tgt, a); } return; }
        case 'MANUAL_RAPTOR_IMPLODE': { const tgt = await target(); if (tgt) { p.juice += tgt.faceup_clean().length + tgt.faceup_dirty().length; this.add_risk(p, 1, 'Raptor Implosion'); } return; }
        case 'MANUAL_MYASS_INTL': { const tgt = await target(); if (tgt) { const amt = tgt.juice; tgt.juice = 0; p.lineup.push(this.mkEntry(card, true, true)); this.log(`    M. Yass International: ${tgt.name} loses ${amt} Juice`); } return; }
        case 'MANUAL_FEED_RAPTORS': { const tgt = await target(); if (tgt) { const j = Math.min(4, p.juice); p.juice -= j; tgt.juice += j; const r = Math.min(3, p.risk); this.add_risk(p, -r); this.add_risk(tgt, r, 'Feeding the Raptors'); tgt.lineup.push(this.mkEntry(card, true, true)); } return; }
        case 'MANUAL_EXEC_SHUFFLE': { const tgt = await target(); if (tgt) { p.swap_with = tgt; this.log(`    Executive Shuffling: ${p.name} <-> ${tgt.name} ability swap pending`); } return; }
        case 'MANUAL_MARK_MAGIC': { if (p.lineup.length >= 3) { for (let k = 0; k < 3; k++) { if (p.lineup.length) this._discard_asset(p, p.lineup[0]); } await lt(p, 1, 'Mark to Magic'); p.lineup.push(this.mkEntry(card, true, false)); } return; }

        // --- asset-modifier (place-on-top retag with timers) ---
        case 'MANUAL_SHELL_GAME': { const t = p.lineup.find(x => x.up && this.effDirtyOrCond(p, x)); if (t) { t.up = false; t.mods.push({ tag: 'clean', turns: Infinity, src: card.name, riskPerTurn: true }); this.log(`    Offshore Shell Game: an Asset flips face-down, counts Clean (+1 Risk/turn)`); } return; }
        case 'MANUAL_PLAUSIBLE': { const tgt = await target(); if (tgt) { const c = tgt.faceup_clean()[0]; if (c) { const only = tgt.faceup_clean().length === 1; c.mods.push({ tag: 'dirty', turns: only ? 3 : 2, src: card.name }); this.log(`    Plausible Deniability: ${tgt.name}'s Clean Asset is Dirty for ${only ? 3 : 2} turns`); } } return; }
        case 'MANUAL_MARK_MISSION': { const t = p.faceup_dirty()[0]; if (t) { t.mods.push({ tag: 'clean', turns: 2, src: card.name }); this.log(`    Mark to Mission: a Dirty Asset counts Clean for 2 turns`); } return; }
        case 'MANUAL_TEMP_OPTICS': { const t = p.faceup_dirty()[0]; if (t) { t.mods.push({ tag: 'clean', turns: 1, src: card.name }); this.log(`    Temporary Optics: a Dirty Asset counts Clean until end of next turn`); } return; }
        case 'MANUAL_HYPO_FUTURE': if (p.hype >= 4 && p.trust >= 2) { p.hype -= 4; await lt(p, 2, 'Hypothetical Future Value'); const e = this.mkEntry(card, true, false); e.mods.push({ tag: 'clean', noeffect: true, turns: 3, src: card.name }); p.lineup.push(e); } return;
        case 'MANUAL_UNDERVALUATION': { const pool = []; for (const q of this.alive_players()) for (const t of q.lineup) pool.push({ q, t }); if (pool.length) { const pick = await this.decide(p, { kind: 'asset', candidates: pool.map(x => x.t), ctx: 'undervaluation' }); const hit = pool.find(x => x.t === pick) || pool[0]; hit.t.mods.push({ tag: 'conditional', turns: Infinity, src: card.name }); this.log(`    Strategic Undervaluation: an Asset is now Conditional/no-effect for the game`); } return; }

        // --- scoring-time ---
        case 'MANUAL_ACCT_WHISPER': p.acct_whisper = true; return;
        default: return;
      }
    }
    effDirtyOrCond(p, t) { return p.effDirty(t) || (t.card.ctype === 'Conditional'); }

    async enter_tower(p) {
      if (p.juice < 1) return false;
      p.juice -= 1;
      if (p.trust >= 4 || p.hype >= 8) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    ${p.name} enters Executive Lounge`); this.emit('enter_lounge', { player: p.name }); return true; }
      if (p.bribes > 0) { p.bribes -= 1; p.ff_bribe_used += 1; p.in_lounge = true; p.pos = 'LOUNGE'; return true; }
      if (this.rng.randint(1, 6) >= 5) { p.in_lounge = true; p.pos = 'LOUNGE'; return true; }
      this.add_risk(p, 1, 'failed Why Ask? roll'); return false;
    }

    check_table_risk() {
      const tot = this.alive_players().reduce((s, p) => s + Math.max(0, p.risk), 0);
      const thresh = this.players.length < 4 ? 6 : 8;
      if (tot >= thresh) this.raise_global_sec(1, `table Risk ${tot} >= ${thresh}`);
    }

    // start-of-turn character abilities (the printed secondary abilities). Optional ones route
    // through decide({kind:'ability'}); triggered ones (Reflux) fire automatically.
    async startAbilities(p) {
      const opps = this.others_of(p);
      const weakest = () => opps.length ? opps.reduce((m, x) => threat(this, x) < threat(this, m) ? x : m) : null;
      // Claudia — Unimpeachable: give 5 Juice to an opponent, gain +1 Trust
      if (p.name === 'Claudia Numbers' && p.juice >= 5 && opps.length &&
        await this.decide(p, { kind: 'ability', ability: 'Unimpeachable', cost: 'give 5 Juice → +1 Trust' })) {
        const t = weakest(); p.juice -= 5; t.juice += 5; this.gainTrust(p, 1);
        this.log(`    Claudia Unimpeachable: gives 5 Juice to ${t.name}, +1 Trust`);
      }
      // Danny — Doughmination: give 4 Juice to an opponent, DOUBLE current Hype
      if (p.name === 'Danny Dough' && p.juice >= 4 && p.hype > 0 && opps.length &&
        await this.decide(p, { kind: 'ability', ability: 'Doughmination', cost: 'give 4 Juice → double Hype' })) {
        const t = weakest(); p.juice -= 4; t.juice += 4; const b = p.hype; p.hype *= 2;
        this.log(`    Danny Doughmination: 4 Juice to ${t.name}, Hype ${b}->${p.hype}`);
      }
      // Danny — Reflux: start with 7+ Hype → highest-Trust player(s) roll a Trust Check (triggered)
      if (p.name === 'Danny Dough' && p.hype >= 7) {
        const hi = this.highest_trust();
        if (hi && hi !== p) { const top = this.alive_players().filter(q => q !== p && q.trust === hi.trust);
          for (const q of top) { this.log(`    Danny Reflux: ${q.name} (top Trust) must roll a Trust Check`); await this.trust_check(q); } }
      }
      // Vonda — Notary Public: spend 2 Trust to discard 1 of your own played Assets
      if (p.name === 'Vonda Vouch' && p.trust >= 2 && p.lineup.length &&
        await this.decide(p, { kind: 'ability', ability: 'Notary', cost: 'spend 2 Trust → discard a played Asset' })) {
        const a = await this.pick_asset(p, p.lineup, 'notary');
        if (a) { p.trust -= 2; this._discard_asset(p, a); this.log(`    Vonda Notary Public: -2 Trust, discards ${a.card.name}`); }
      }
    }

    async take_turn(p) {
      if (!p.alive) return;
      if (p.skip_next) { p.skip_next = false; this.log(`  ${p.name} skips this turn`); if (p.grace_immunity) p.grace_immunity = false; return; }
      this.log(`  -- ${p.name}'s turn (J${p.juice} T${p.trust} H${p.hype} R${p.risk} pos=${p.pos} lounge=${p.in_lounge}) --`);
      const R = this.rng;
      const roll = R.randint(1, 6); p.juice += roll;
      this.lastRoll = roll;
      this.emit('roll', { player: p.name, roll, juice: p.juice });
      this.log(`    rolls ${roll} -> Juice ${p.juice}`);

      // consume one-turn timers that target THIS player
      const junkTax = !!p._junk_tax_pending; p._junk_tax_pending = false;          // Junk Vehicle Trust: 2 Juice/space
      if (p._safe_pending) { p._forcePassOn = p._safe_pending; p._safe_pending = 0; } // The Safe: must roll 6

      if (p.name === 'Benny Boye') { p.in_lounge = true; p.pos = 'LOUNGE'; this.log('    Benny: Golden Walk -> Executive Lounge (free)'); }
      if (p.name === 'Danny Dough' && this.turn >= 2 && this.turn % 2 === 0) { const b = p.juice; p.juice *= 2; this.log(`    Danny: Dough-Man doubles Juice ${b}->${p.juice}`); }

      await this.startAbilities(p);   // printed secondary abilities (Unimpeachable / Doughmination / Reflux / Notary)

      if (p.juice >= 3 && p.bribes === 0) {
        if (await this.decide(p, { kind: 'bribe' })) { p.juice -= 3; p.bribes += 1; this.log(`    ${p.name} buys a Bribe (-3 Juice)`); this.emit('bribe', { player: p.name }); }
      }

      const DOOR = new Set([3, 7]); const LOOP_N = 9;
      let moved = false;
      if (!p.in_lounge) {
        let cur = (typeof p.pos === 'number') ? p.pos : 0;
        let want = await this.decide(p, { kind: 'steps' });
        const wu_free = (p.name === 'Wu Drainer');
        if (wu_free && want === 0) want = 1;
        let steps = 0;
        for (let k = 0; k < want; k++) {
          const free_step = (wu_free && p.juice < 1 && steps === 0);
          if (p.juice < 1 && !free_step) break;
          const nxt = (cur + 1) % LOOP_N;
          // Wu — Floorplan Master: ignores anything that would stop movement (walks through occupied spaces)
          if (!wu_free && this.alive_players().some(q => q !== p && typeof q.pos === 'number' && q.pos === nxt)) { this.log(`    ${p.name} blocked: space ${nxt} occupied`); break; }
          if (!free_step) p.juice -= 1;
          if (!free_step && junkTax) p.juice -= 1;   // Junk Vehicle Trust: 2 Juice per space this turn
          cur = nxt; steps += 1;
          if (DOOR.has(cur)) {
            if (p.juice >= 1 && await this.decide(p, { kind: 'door', at: cur })) { p.juice -= 1; cur = (cur + 1) % LOOP_N; p.ff_passed_to_market += 1; this.log(`    ${p.name} takes TO MARKET door -> ${cur} [+1 Final Favor]`); }
          }
        }
        p.pos = cur; moved = steps > 0;
        if (moved) {
          this.emit('move', { player: p.name, to: cur });
          const key = ['Asset', 'Market', 'SEC'][cur % 3];
          const c = this.draw(key);
          if (c) {
            this.log(`    lands on loop ${cur}, draws ${key}: ${c.name}`);
            this.emit('draw', { player: p.name, deck: key, card: c.name });
            if (key === 'Asset') { this.consecutive_assets += 1; if (this.consecutive_assets >= 3) { this.raise_global_sec(1, '3 Assets drawn consecutively'); this.consecutive_assets = 0; } }
            else this.consecutive_assets = 0;
            if (key === 'SEC') {
              if (p.sec_immunity > 0) { p.sec_immunity -= 1; this.log(`    ${p.name} uses SEC Immunity (ignores ${c.name})`); this.discards['SEC'].push(c); }
              else if (p.grace_immunity) { this.log(`    ${p.name} immune (Grace Period) — ignores ${c.name}`); this.discards['SEC'].push(c); }
              else { await this.resolve_card(c, p, this.others_of(p)); this.after_sec_draw(c); }
            }
            else p.hand.push(c);
          }
        }
        if ((p.trust >= 4 || p.hype >= 8) && await this.decide(p, { kind: 'enterLounge' })) await this.enter_tower(p);
      }
      if (p.name === 'Wu Drainer' && !moved) this.add_risk(p, -1);

      // play 1 card (reaction cards held in hand are excluded — they wait for their trigger)
      const playable = p.hand.filter(proactivelyPlayable);
      const chosen = await this.decide(p, { kind: 'play', candidates: playable });
      if (chosen && p.hand.indexOf(chosen) >= 0) {
        const c = chosen; p.hand.splice(p.hand.indexOf(c), 1);
        this.log(`    plays from hand: ${c.name}`);
        this.emit('play', { player: p.name, card: c.name });
        if (p.name === 'Mark Markit' && (c.deck === 'Market' || c.deck === 'AdvMarket')) p.hype += 1;
        const others = this.others_of(p);
        if (['Clean', 'Dirty', 'Conditional'].includes(c.ctype) && ['FaceUp', 'FaceDown', 'KeepInHand'].includes(c.play)) {
          const fu = (c.play === 'FaceUp'); const isdirty = (c.ctype === 'Dirty');
          const entry = this.mkEntry(c, fu, isdirty);
          p.lineup.push(entry);
          if (p.hasConstant('CONSTANT_PLAY_ASSET_JUICE1')) p.juice += 1;
          // reaction window: opponents may intercept a freshly-played Clean Asset
          if (fu && !isdirty) {
            const ctx = { actor: p, asset: entry };
            await this.offerReaction('playCleanAsset', ctx);
          }
          await this.resolve_card(c, p, others);
        } else {
          await this.resolve_card(c, p, others);
          this.discards[this._discard_key(c)].push(c);
        }
      }

      // end of turn
      if (p.hasConstant('CONSTANT_3ASSET_HYPE1') && p.asset_count() >= 3) p.hype += 1;
      if (p.hasConstant('CONSTANT_EXACTLY1OTHER_JUICE1') && p.asset_count() === 2) p.juice += 1;  // Leverage Loop (once/turn)
      if (p.name === 'Mark Markit' && p.hype >= MAX_HYPE) { p.juice += 1; p.trust -= 1; p.maxhype_streak += 1; }
      else if (p.name === 'Mark Markit') p.maxhype_streak = 0;
      if (p.name === 'Mark Markit' && p.maxhype_streak >= 3) { this.raise_global_sec(1, "Mark 'Too Loud to Fail'"); p.maxhype_streak = 0; }
      if (p.name === 'Claudia Numbers' && p.hype >= 4) p.trust -= 1;

      // Offshore Shell Game: +1 Risk/turn while the flipped asset is held
      for (const t of p.lineup) if (t.mods.some(m => m.riskPerTurn && (m.turns === Infinity || m.turns > 0))) this.add_risk(p, 1, 'Offshore Shell Game upkeep');

      if (p._ringTurns > 0) p._ringTurns -= 1;   // Class Ring buff counts down (this turn + next)
      p._forcePassOn = 0;                         // The Safe debuff was only for this turn

      // BENCHMARK edition only: ending a turn deep in Risk feeds the Shadow meter (self-inflicted collapse)
      if (this.rules.shadowOnRisk && p.risk >= this.rules.shadowRiskThreshold)
        this.raise_shadow_sec(1, `${p.name} ended a turn at Risk ${p.risk} (Benchmark: Shadow +1)`);

      if (p.in_lounge) { p.lounge_streak += 1; if (p.name === 'Benny Boye' && p.lounge_streak >= 3 && !this.collapsed) this.begin_collapse('Benny Castle Doctrine (3 turns ended in Lounge)'); }
      else p.lounge_streak = 0;

      p.tickMods();          // count down asset-modifier timers
      this.check_table_risk();

      if (this.collapsed && this.collapse_turns_left !== null && this.collapse_turns_left <= 2) {
        for (const q of this.alive_players()) if (q.in_lounge) {
          const under = (q.trust < 4 && q.hype < 8);
          if (under && q.bribes > 0) { q.bribes -= 1; q.ff_bribe_used += 1; continue; }
          const pass_on = under ? 5 : 4;
          const r = R.randint(1, 6);
          if (r >= pass_on) { q.ff_survived_collapse_round += 1; continue; }
          // Vonda — Leaky Bucket: stay anyway by discarding an Asset AND passing a (fee-free) Trust Check
          if (q.name === 'Vonda Vouch' && q.lineup.length &&
            await this.decide(q, { kind: 'ability', ability: 'LeakyBucket', cost: 'discard an Asset + pass a Trust Check to STAY' })) {
            const a = await this.pick_asset(q, q.lineup, 'leaky-bucket'); if (a) this._discard_asset(q, a);
            if (await this.trust_check(q)) { q.ff_survived_collapse_round += 1; this.log(`    Vonda Leaky Bucket: discards ${a ? a.card.name : 'an Asset'}, passes — STAYS in the Lounge`); continue; }
          }
          q.in_lounge = false; q.pos = 'START'; q.lounge_streak = 0; this.log(`    COLLAPSE EVICTION: ${q.name} failed check (rolled ${r}), booted to START`); this.emit('evict', { player: q.name });
        }
      }
    }

    meets_victory(p) {
      if (!(p.in_lounge && this.victoryCleanCount(p) === 2)) return false;
      if (this.collapsed) return p.ff_survived_collapse_round >= 1;
      return p.lounge_streak >= 1;
    }
    check_victory() {
      const q = this.alive_players().filter(p => this.meets_victory(p));
      if (!q.length) return null;
      if (q.length === 1) return q[0];
      return this.resolve_final_favor(q);
    }
    ff(p) {
      // Accounting Whisper (Risk->0 if Shadow<6) feeds tie-break ordering via effRisk, not the FF total.
      return p.final_favor();
    }
    resolve_final_favor(contenders) {
      const best = Math.max(...contenders.map(c => this.ff(c)));
      let top = contenders.filter(c => this.ff(c) === best);
      if (top.length === 1) return top[0];
      while (top.length > 1) {
        const rolls = new Map(top.map(c => [c, this.rng.randint(1, 6)]));
        const hi = Math.max(...rolls.values());
        for (const [c, r] of rolls) if (r < hi) this.add_risk(c, 1, 'Why Ask? roll-off loss');
        top = top.filter(c => rolls.get(c) === hi);
      }
      return top[0];
    }
    effRisk(p) { return (p.acct_whisper && this.shadow_sec < 6) ? 0 : p.risk; }
    score_on_timeout() {
      const q = this.alive_players().filter(p => this.meets_victory(p));
      if (q.length) return this.resolve_final_favor(q);
      return this.alive_players().slice().sort((a, b) => {
        const ka = [this.ff(a), a.juice, -this.effRisk(a)], kb = [this.ff(b), b.juice, -this.effRisk(b)];
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
        return 0;
      })[0];
    }

    // step ONE player's turn (async); returns the player who just acted (for the UI animator)
    async step() {
      if (this.done) return null;
      this.turn += 1;
      const p = this.players[this.order[this.idx % this.order.length]];
      this.activePlayer = p;
      this.log(`[Turn ${this.turn}] global_sec=${this.global_sec} shadow_sec=${this.shadow_sec} collapsed=${this.collapsed}`);
      this.emit('turn_start', { player: p.name, n: this.turn });
      await this.take_turn(p);
      const w = this.check_victory();
      if (w) { this.winner = w; this.end_reason = this.end_reason || 'Victory conditions met'; this.done = true; }
      else if (this.collapsed) {
        this.collapse_turns_left -= 1;
        if (this.collapse_turns_left <= 0) { this.winner = this.score_on_timeout(); this.end_reason = (this.end_reason || '') + ' (resolved on collapse timeout)'; this.done = true; }
      }
      if (this.done) this.emit('gameover', { winner: this.winner ? this.winner.name : null, reason: this.end_reason });
      else if (this.turn >= this.maxTurns) { this.winner = this.score_on_timeout(); this.end_reason = this.end_reason || 'max turns reached'; this.done = true; this.emit('gameover', { winner: this.winner ? this.winner.name : null, reason: this.end_reason }); }
      this.idx += 1;
      return p;
    }
    // run a whole game headlessly (bots only, or scripted agents)
    async run() { while (!this.done) await this.step(); return this.winner; }
  }

  global.makeRng = makeRng;
  global.ERSNGame = Game;
  global.ERSNPlayer = Player;
  global.ERSNBotAgent = BotAgent;
  global.ERSNCharacterAgent = CharacterAgent;
  global.ERSN_VERSION = VERSION;
  global.ERSN_EDITIONS = EDITIONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeRng, Game, Player, BotAgent, CharacterAgent, VERSION, EDITIONS };
})(typeof window !== 'undefined' ? window : globalThis);
