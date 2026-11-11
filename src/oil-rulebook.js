/* OiL! THE RULEBOOK — the board game, in the game (Joe 2026-10-23: "code it all into the game, think of it
   as a board game first"; "we will need detailed instructions for each faction card and the rules and a
   key/legend for the board and materials").
   ============================================================================
   One overlay, six tabs: THE RULES · THE EXPANSION · TWO PLAYERS (HEGEMONY) · THE COMPANIES · THE BOARD ·
   IN THE BOX. Every number is READ FROM THE ENGINE (a throwaway OilGame built with the same options the
   table plays), every company fact from the faction / map / crisis modules, every card text from
   OIL_CARDTEXT — so the book cannot drift from the game. Printable (each tab, or the whole book).
   CONCEPT where it says so: component counts are what the engine uses, not a manufactured spec. */
(function (global) {
  'use strict';
  const doc = global.document;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---- the engine, read live ------------------------------------------------------------------------
  // seats 4 is the reference table; the seat clock scales with seats, so its numbers are printed per seat
  const CORE_OPTS = { cards: true, deals: true, map: true, crisis: true, path: 'path' };
  const EXP_OPTS = Object.assign({}, CORE_OPTS, { expansion: true, privilege: {}, momentum: {}, clock: true, hegemony: true });
  function probe(opts, seats, factions) {
    const OG = global.OilGame; if (!OG) return null;
    const F = Object.keys((global.OIL_FACTIONS_FX || {}).FACTIONS || {});
    try { return new OG(Object.assign({ seed: 1, n_players: seats || 4, factions: factions || F.slice(0, seats || 4) }, opts)); }
    catch (e) { return null; }
  }
  const FX = () => (global.OIL_FACTIONS_FX || {}).FACTIONS || {};
  const MAP = () => global.OIL_MAP || {};
  const CRX = () => global.OIL_CRISIS || {};
  const SKIN = () => global.OILSKIN || {};
  const brandOf = code => (((global.OIL || {}).FACTIONS || []).find(f => f.code === code) || {}).brand || code;
  const regionOf = code => (((global.OIL || {}).FACTIONS || []).find(f => f.code === code) || {}).region || '';
  const colorOf = code => (SKIN().colorFor ? SKIN().colorFor(code) : '#e0a32a');
  const hqOf = code => (MAP().FACTION_HQ || {})[code] || code;
  const placeName = c => ((MAP().BY || {})[c] || {}).name || c;

  // die colours (designer 2026-10-23): Supply red · Weather yellow · World blue · Green Anders green
  const DIE = { Supply: '#d6402e', Weather: '#e8c23a', World: '#3f7fd0', 'Green Anders': '#2f9e5b' };
  const die = (n, v) => `<span class="rb-die" style="--d:${DIE[n]}" title="${esc(n)}">${v == null ? '' : v}</span>`;

  // ---- tabs ---------------------------------------------------------------------------------------
  const TABS = [
    ['rules', 'THE RULES'], ['expansion', 'THE EXPANSION'], ['two', 'TWO PLAYERS'],
    ['companies', 'THE COMPANIES'], ['board', 'THE BOARD'], ['box', 'IN THE BOX'],
  ];
  const SECTIONS = {};   // id -> () => html   (rules/expansion/two are registered from oil-rulebook-text.js)

  // ---- THE COMPANIES — one placard each ---------------------------------------------------------------
  function statBars(st) {
    const A = (global.OIL_FACTIONS_FX || {}).STAT_AXES || Object.keys(st || {});
    return `<table class="rb-stats">${A.map(k => `<tr><td>${k}</td><td><span class="rb-bar"><i style="width:${(st[k] || 0) * 10}%"></i></span></td><td class="r">${st[k]}</td></tr>`).join('')}</table>`;
  }
  function routesFrom(code) {
    const M = MAP(), out = [];
    (M.ROUTES || []).forEach(r => {
      if (r[0] !== code && r[1] !== code) return;
      const to = r[0] === code ? r[1] : r[0], p = (M.BY || {})[to] || {};
      out.push({ to, name: p.name || to, kind: p.kind, cost: r[2], label: r[3] });
    });
    return out.sort((a, b) => a.cost - b.cost);
  }
  const KIND = { hq: 'a company HQ', gate: 'a strait / canal ◆', cape: 'a cape', ocean: 'open water', arctic: 'an arctic passage (iced)', onshore: 'onshore ground', built: 'a megastructure' };
  function distances(code) {
    const M = MAP(); if (!M.reach) return {};
    return (M.reach(hqOf(code), 999, {}) || {}).dist || {};
  }
  function companyCard(code, ctx) {
    const f = FX()[code] || {}, heg = ctx.heg, al = CRX().alignmentOf ? CRX().alignmentOf(code) : null;
    const hq = hqOf(code), hp = (MAP().BY || {})[hq] || {};
    const routes = routesFrom(hq);
    const d = distances(code), rivals = Object.keys(FX()).filter(c => c !== code)
      .map(c => ({ c, n: d[hqOf(c)] })).sort((a, b) => (a.n - b.n) || (a.c < b.c ? -1 : 1));
    const by = heg ? ((heg.BACKYARD || {})[code] != null ? heg.BACKYARD[code] : heg.BACKYARD_DEFAULT) : null;
    const allies = heg && heg.AFFINITIES ? Object.keys(FX()).filter(c => c !== code && ctx.allied(code, c)) : [];
    const stateNote = al === 'state'
      ? 'A <b>state</b> company. With the expansion the state never requisitions you and pirates never board you — you <i>are</i> the state. Heat on your ground you absorb with legitimacy.'
      : 'A <b>private</b> company. With the expansion, in wartime the state may requisition you, and in pirate water pirates (or the embargo) can board you. Heat on your ground you lobby away with cash.';
    const setupLine = f.setup ? (code === 'STOCK' ? 'Starts with <b>+$8</b> (capitalized).' : code === 'MC' ? 'Starts with <b>+2 pips</b> (the engineering edge).' : 'Has a setup bonus — see the power.') : 'No setup bonus — the standard kit.';
    return `<article class="rb-placard" style="--fc:${colorOf(code)}">
      <header><div class="rb-brand">${esc(brandOf(code))}</div>
        <div class="rb-ed ${f.edition === 'EXPANSION' ? 'x' : ''}">${f.edition === 'EXPANSION' ? 'EXPANSION FRANCHISE' : 'CORE'}</div></header>
      <div class="rb-lead">${esc(f.lead || '')}</div>
      <blockquote>${esc(f.tagline || '')}</blockquote>
      <div class="rb-cols">
        <div>
          <h4>WHO YOU ARE</h4>
          <p><b>HQ:</b> ${esc(hp.name || hq)} <span class="rb-dim">(${esc(regionOf(code) || hp.region || '')})</span> — your seat on the board. You start here and you never move house.</p>
          <p>${stateNote}</p>
          ${statBars(f.stats || {})}
          <p class="rb-dim">The five reads are the company's character, not a points budget. They do not change play.</p>
        </div>
        <div>
          <h4>YOUR POWER — ${esc((f.power || '').toUpperCase())}</h4>
          <p class="rb-power">${esc(f.text || '')}</p>
          <p><b>When:</b> once on <b>each of your turns</b>, right after the dice set the price (and after Green Anders, with the expansion) and before you move. It is automatic — you never choose to skip it.</p>
          ${code === 'MINA' ? `<p><b>Two players:</b> with one rival the mine would never miss. In the 2-player game it goes off only while your rival is <b>richer than you</b>.</p>` : ''}
          <p><b>Setup:</b> ${setupLine}</p>
        </div>
      </div>
      <h4>ON THE MAP</h4>
      <p>Routes out of your HQ (cost = spaces on the route):</p>
      <ul class="rb-routes">${routes.map(r => `<li><b>${esc(r.name)}</b> — ${esc(KIND[r.kind] || r.kind)}${r.kind === 'built' ? ' (once built)' : r.kind === 'arctic' ? ' (once developed)' : ''} · ${r.cost} space${r.cost > 1 ? 's' : ''} <span class="rb-dim">(${esc(r.label)})</span></li>`).join('')}</ul>
      <p>Nearest rival HQs by sea: ${rivals.slice(0, 3).map(x => `${esc(brandOf(x.c))} (${x.n})`).join(' · ')}. Farthest: ${esc(brandOf(rivals[rivals.length - 1].c))} (${rivals[rivals.length - 1].n}).</p>
      ${heg ? `<h4>WITH THE EXPANSION</h4>
      <p>${allies.length ? `<b>Standing allies:</b> ${allies.map(c => esc(brandOf(c))).join(' and ')}. If they sit as a duck, you lean <b>+◇1</b> in them; if they are at the table, a RICO spread that hits one of you splashes the other.` : (f.edition === 'EXPANSION' ? '' : 'No standing franchise ally of your own; the franchises may count you as theirs.')}
      ${code === 'PETRO_SUR' || code === 'HADDAD' ? ' <b>Never allied</b> with the other franchise.' : ''}</p>
      <p><b>Two players — your backyard:</b> you hold <b>◇2</b> in your <b>${by}</b> nearest duck${by === 1 ? '' : 's'} and ◇1 in every other. In order of distance: ${rivals.map((x, i) => `${i < by ? '<b>' : ''}${esc(brandOf(x.c))}${i < by ? '</b>' : ''}`).join(' → ')} <span class="rb-dim">(skip your rival — whichever ${by} of these are ducks are yours at ◇2)</span>.</p>` : ''}
    </article>`;
  }
  SECTIONS.companies = ctx => `<h2>THE COMPANIES</h2>
    <p class="rb-lede">Eight companies, eight HQs, always all on the board. Each player takes a placard and is that company for the whole game. Six are the core; ${esc(brandOf('PETRO_SUR'))} and ${esc(brandOf('HADDAD'))} are the expansion's franchises (with the expansion all eight are in the box; without it, play the six).</p>
    ${Object.keys(FX()).map(c => companyCard(c, ctx)).join('')}`;

  // ---- THE BOARD — the key / legend ----------------------------------------------------------------
  const SHAPE = { hq: '●', gate: '◆', cape: '▲', ocean: '○', arctic: '⬡', onshore: '■', built: '⬟' };
  SECTIONS.board = ctx => {
    const M = MAP(), byKind = {};
    (M.PLACES || []).forEach(p => { (byKind[p.kind] = byKind[p.kind] || []).push(p); });
    const S = (M.STRUCTURES || {});
    const PW = ((global.OIL_MOMENTUM || {}).PIRATE_WATERS || []);
    const row = (sym, name, what, cls) => `<tr><td class="rb-sym ${cls || ''}">${sym}</td><td><b>${name}</b></td><td>${what}</td></tr>`;
    return `<h2>THE BOARD</h2>
    <p class="rb-lede">The board is the world's oil trade: ${(M.PLACES || []).length} places joined by ${(M.ROUTES || []).length} routes. Every route is a track of spaces; each space is one move.</p>
    <h3>PLACES</h3>
    <table class="rb-key">
      ${row(SHAPE.hq, 'HQ (port)', `A company's home and a buyer — you can SELL here. ${(byKind.hq || []).length} on the board: ${(byKind.hq || []).map(p => esc(p.name)).join(', ')}.`, 'hq')}
      ${row(SHAPE.gate, 'Strait / canal', `A chokepoint. It can be <b>SHUT</b> (✕) by cards and heat; a shut gate blocks you — go round. ${(byKind.gate || []).map(p => esc(p.name)).join(', ')}.`, 'gate')}
      ${row(SHAPE.cape, 'Cape', `The long way round — never shuts. ${(byKind.cape || []).map(p => esc(p.name)).join(', ')}.`, 'cape')}
      ${row(SHAPE.ocean, 'Open water', `Crossroads at sea. ${(byKind.ocean || []).map(p => esc(p.name)).join(', ')}.`, 'ocean')}
      ${row(SHAPE.arctic, 'Arctic passage', `Iced — closed until Arctic Development is built. ${(byKind.arctic || []).map(p => esc(p.name)).join(', ')}.`, 'arctic')}
      ${row(SHAPE.onshore, 'Onshore ground', `Land you can work. ${(byKind.onshore || []).map(p => esc(p.name)).join(', ')}.`, 'onshore')}
      ${row(SHAPE.built, 'Megastructure', `Appears only when built (expansion). ${Object.values(S).map(s => `<b>${esc(s.name)}</b> — ${esc(s.effect)}`).join('; ')}.`, 'built')}
    </table>
    <h3>ROUTES</h3>
    <table class="rb-key">
      ${row('<i class="rb-ln gate"></i>', 'Through a gate', 'Short and fast; shuts when the gate shuts.')}
      ${row('<i class="rb-ln cape"></i>', 'Round a cape', 'Long, but always open.')}
      ${row('<i class="rb-ln ocean"></i>', 'Open sea', 'Between oceans.')}
      ${row('<i class="rb-ln pipe"></i>', 'Pipeline', 'Overland: no customs, no weather.')}
      ${row('<i class="rb-ln arctic"></i>', 'Arctic', 'Dashed while iced.')}
      ${row('✕', 'Shut', 'Marked on a shut gate. Nothing passes until it reopens.', 'shut')}
    </table>
    <h3>SPACES <span class="rb-dim">(expansion — MOMENTUM)</span></h3>
    <table class="rb-key">
      ${row('<span class="rb-mk" style="--m:#ff8a5a">⚖</span>', 'Inspection', 'Next to every HQ. If you are on the record (dirty) you are halted and fined — in a rival\'s home water, arrested.')}
      ${row('<span class="rb-mk" style="--m:#6fd0d8">»</span>', 'Current', 'Land on it and it carries you on.')}
      ${row('<span class="rb-mk" style="--m:#e8e8e8">☠</span>', 'Pirate water', `Private ships can be boarded here, on a house throw, when the world lets them out (the mark glows when they are awake). ${PW.map(esc).join(', ')}. <b>The Caribbean run</b> is <b>THE EMBARGO</b> — Cuba style: same space, same throw.`)}
      ${row('<span class="rb-mk dash">◆</span>', 'Stop line', 'Every canal and strait: you must halt there.')}
    </table>
    <h3>MARKS ON THE TABLE</h3>
    <table class="rb-key">
      ${row('▰', 'Control', 'Your claim on the ground — the score. +1 each time you SELL.')}
      ${row('●●●', 'Privilege <span class="rb-dim">(exp.)</span>', 'How many of the three dice you roll yourself. ●○○ = one.')}
      ${row('◉ / ◐', 'Seized / tolled <span class="rb-dim">(exp.)</span>', 'A rival throws your die (◉) or takes its flip and half your sale (◐).')}
      ${row('☠', 'Held by pirates / the embargo <span class="rb-dim">(exp.)</span>', 'A die held for ransom, two rolls.')}
      ${row('⊛', 'Held by THE FIRM <span class="rb-dim">(exp.)</span>', 'Green Anders filed the Protocol on you: the firm holds one of your dice for two rolls.', 'grn')}
      ${row('⌇', 'Snare', 'A rival laid a snare on you — it springs the turn you lose a die.')}
      ${row('⚓', 'Camped', 'You stayed put and pay demurrage.')}
      ${row('◇', 'Sitting duck <span class="rb-dim">(exp.)</span>', 'A company nobody plays, at its HQ. In 2 players each shows both players\' stakes ◇.')}
      ${row('▼', 'E.D.D. PROTOCOL', 'The endgame is armed — every turn rolls the Protocol.', 'red')}
    </table>
    <h3>THE DICE</h3>
    <p>${die('Supply')} <b>Supply</b> — red · ${die('Weather')} <b>Weather</b> — yellow · ${die('World')} <b>World</b> — blue · ${die('Green Anders')} <b>Green Anders</b> — green (expansion).</p>`;
  };

  // ---- IN THE BOX — materials + card reference ------------------------------------------------------
  SECTIONS.box = ctx => {
    const cards = ((global.OIL || {}).CARDS || []), T = global.OIL_CARDTEXT || {};
    const decks = {}; cards.forEach(c => (decks[c.deck] = decks[c.deck] || []).push(c));
    const DECK_WHAT = { DEEDS: 'what you own, and what owning it lets you do', COMPETITION: 'what you do to them — war, government, sabotage, blame', 'FREEDOM-MARKET': 'what the market does to everyone' };
    const g = ctx.core || {}, D = g.dials || {};
    return `<h2>IN THE BOX</h2>
    <p class="rb-lede">What the game uses. <span class="rb-dim">CONCEPT — counts are what the engine plays with, not a manufacturing spec.</span></p>
    <h3>CORE</h3>
    <ul class="rb-list">
      <li><b>The board</b> — the world map (see THE BOARD).</li>
      <li><b>6 company placards</b> + <b>6 ship pawns</b>, one per company, in its colour.</li>
      <li><b>3 dice</b> — ${die('Supply')} Supply (red), ${die('Weather')} Weather (yellow), ${die('World')} World (blue).</li>
      <li><b>${cards.length} cards in three decks</b> — ${Object.keys(decks).map(k => `${esc(k)} ${decks[k].length}`).join(' · ')}.</li>
      <li><b>The oil clock</b> — a track for the well (${D.OIL_START} oil at the core table) and the E.D.D. line.</li>
      <li><b>The price track</b> — $${D.PRICE_MIN}–$${D.PRICE_MAX}, starting at $${D.PRICE_START}; STABLE / CHAOTIC era marker.</li>
      <li><b>Barrels</b>, <b>money ($)</b>, <b>pips</b>, <b>control ▰</b> and <b>exposure</b> markers for each company.</li>
      <li><b>Heat</b> and <b>fire</b> markers (CRISIS), and <b>✕ shut</b> markers for the gates.</li>
      <li><b>Deal</b>, <b>grudge</b> and <b>snare</b> tokens (THE TABLE).</li>
    </ul>
    <h3>EXPANSION</h3>
    <ul class="rb-list">
      <li><b>The Green Anders die</b> ${die('Green Anders')}.</li>
      <li><b>2 franchise placards</b> + pawns — ${esc(brandOf('PETRO_SUR'))}, ${esc(brandOf('HADDAD'))} (eight companies in all).</li>
      <li><b>Duck pawns</b> — one for every company nobody plays (up to 6), and <b>◇ stake markers</b> for the 2-player game.</li>
      <li><b>Privilege markers</b> (●●●) and <b>held-die markers</b>: ◉ seized · ◐ tolled · ☠ pirates / embargo · ⊛ the firm.</li>
      <li><b>Megastructure tiles</b> — ${Object.values(MAP().STRUCTURES || {}).map(s => esc(s.name)).join(', ')}.</li>
      <li><b>The seat clock card</b>, the <b>expansion insert</b> and the <b>HEGEMONY card</b> (2 players).</li>
    </ul>
    <h3>THE CARDS</h3>
    ${Object.keys(decks).map(k => `<h4>${esc(k)} <span class="rb-dim">(${decks[k].length}) — ${esc(DECK_WHAT[k] || '')}</span></h4>
      <table class="rb-cards">${decks[k].map(c => `<tr><td><b>${esc(c.name)}</b><div class="rb-dim">${esc(c.type || '')}${(c.tags || []).length ? ' · ' + c.tags.map(esc).join(' · ') : ''}</div></td><td>${T[c.name] ? esc(T[c.name]) : '<span class="rb-dim">— text pending —</span>'}</td></tr>`).join('')}</table>`).join('')}`;
  };

  // ---- the overlay -----------------------------------------------------------------------------------
  const CSS = `
  #rulebook{position:fixed;inset:0;z-index:100;display:none;background:#0c0a08;color:#efe6cf;font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;-webkit-user-select:text;user-select:text}
  #rulebook.on{display:flex;flex-direction:column}
  #rulebook *{-webkit-user-select:text;user-select:text}
  #rulebook .rb-top{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #3a2c18;flex-wrap:wrap}
  #rulebook .rb-title{font-family:Georgia,serif;color:#f6c95a;font-size:20px;font-weight:700;margin-right:6px}
  #rulebook .rb-tabs{display:flex;gap:6px;flex-wrap:wrap;flex:1}
  #rulebook .rb-tab{padding:6px 12px;border-radius:999px;background:#241a0f;color:#cfc4ad;font-weight:800;font-size:12px;cursor:pointer;border:2px solid #4a3413}
  #rulebook .rb-tab.on{background:linear-gradient(180deg,#f6c95a,#e0a32a);color:#241405;border-color:#93660f}
  #rulebook .rb-body{flex:1;overflow:auto;padding:18px 16px 40px}
  #rulebook .rb-page{max-width:900px;margin:0 auto;line-height:1.55;font-size:14.5px}
  #rulebook h2{font-family:Georgia,serif;color:#f6c95a;font-size:26px;margin:.2em 0 .3em}
  #rulebook h3{color:#e0a32a;letter-spacing:.08em;font-size:15px;margin:1.4em 0 .4em;border-bottom:1px solid #3a2c18;padding-bottom:3px}
  #rulebook h4{color:#caa15e;letter-spacing:.06em;font-size:12.5px;margin:1em 0 .3em}
  #rulebook p{margin:.45em 0} #rulebook ul,#rulebook ol{margin:.4em 0 .6em;padding-left:1.4em} #rulebook li{margin:.22em 0}
  #rulebook .rb-lede{color:#cdbf9e;font-size:15.5px}
  #rulebook .rb-dim{color:#8a7c63;font-weight:400}
  #rulebook .rb-box{border:1px solid #4a3413;border-left:4px solid #e0a32a;background:#1a140d;border-radius:10px;padding:10px 14px;margin:.8em 0}
  #rulebook .rb-box.red{border-left-color:#c0392b} #rulebook .rb-box.grn{border-left-color:#2f9e5b}
  #rulebook table{width:100%;border-collapse:collapse;margin:.5em 0;font-size:13.5px}
  #rulebook td{padding:5px 8px;border-bottom:1px solid #2e2213;vertical-align:top;text-align:left}
  #rulebook td.r{text-align:right;font-weight:800}
  #rulebook .rb-key td:first-child{width:56px;text-align:center;font-size:18px} #rulebook .rb-key td:nth-child(2){width:190px}
  #rulebook .rb-sym.hq{color:#e0a32a} .rb-sym.gate{color:#f2c14e} .rb-sym.cape{color:#a58be0} .rb-sym.ocean{color:#4f8fd0} .rb-sym.arctic{color:#cfeeff} .rb-sym.onshore{color:#c9a46a} .rb-sym.built{color:#3fc073} .rb-sym.shut{color:#ff6a4a} .rb-sym.grn{color:#2f9e5b} .rb-sym.red{color:#ff5a4a}
  #rulebook .rb-ln{display:inline-block;width:40px;height:0;border-top:4px solid;vertical-align:middle}
  #rulebook .rb-ln.gate{border-color:#f2c14e} #rulebook .rb-ln.cape{border-color:#a58be0} #rulebook .rb-ln.ocean{border-color:#4f8fd0} #rulebook .rb-ln.pipe{border-color:#cf7a33;border-top-width:6px} #rulebook .rb-ln.arctic{border-color:#cfeeff;border-top-style:dashed}   /* #rulebook prefix: '#rulebook .rb-ln{border-top:4px solid}' outranked these and drew every swatch white */
  #rulebook .rb-mk{display:inline-flex;width:22px;height:22px;border-radius:50%;align-items:center;justify-content:center;background:#0a0603;border:1.5px solid var(--m);color:var(--m);font-size:12px;font-weight:800}
  #rulebook .rb-mk.dash{border:1.5px dashed #fff;color:#fff;--m:#fff}
  #rulebook .rb-die{display:inline-flex;width:20px;height:20px;border-radius:5px;align-items:center;justify-content:center;background:var(--d);color:#140c04;font-weight:900;font-size:11px;vertical-align:middle;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25)}
  #rulebook .rb-placard{border:1px solid #4a3413;border-top:6px solid var(--fc);border-radius:14px;background:linear-gradient(180deg,#1d160d,#130e08);padding:14px 18px;margin:18px 0;break-inside:avoid;page-break-inside:avoid}
  #rulebook .rb-placard header{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
  #rulebook .rb-brand{font-family:Georgia,serif;font-size:22px;color:var(--fc);font-weight:700}
  #rulebook .rb-ed{font-size:10px;letter-spacing:.14em;font-weight:800;color:#caa15e;border:1px solid #4a3413;border-radius:999px;padding:2px 9px}
  #rulebook .rb-ed.x{color:#2f9e5b;border-color:#2f9e5b}
  #rulebook .rb-lead{color:#cdbf9e;font-weight:700}
  #rulebook blockquote{margin:.4em 0 .6em;font-style:italic;color:#e8dcc0;border-left:3px solid var(--fc);padding-left:10px}
  #rulebook .rb-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  #rulebook .rb-power{font-size:15px;color:#f3e7c9;background:#241a0f;border-radius:8px;padding:8px 10px}
  #rulebook .rb-stats td{padding:2px 6px;font-size:11.5px;border:none} #rulebook .rb-stats td:first-child{width:90px;color:#b9ab8e;font-weight:700}
  #rulebook .rb-bar{display:block;height:7px;border-radius:4px;background:#3a2c18;overflow:hidden} #rulebook .rb-bar i{display:block;height:100%;background:var(--fc)}
  #rulebook .rb-routes{columns:2;column-gap:18px}
  #rulebook .rb-cards td:first-child{width:38%}
  #rulebook .rb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin:.5em 0}
  #rulebook .rb-grid>div{background:#241a0f;border:1px solid #3a2c18;border-radius:8px;padding:6px 9px;display:flex;flex-direction:column}
  #rulebook .rb-grid span{color:#f6c95a;font-weight:800}
  #rulebook table{display:block;overflow-x:auto} #rulebook table tbody{display:table;width:100%}
  #rulebook table.rb-stats{display:table;width:100%;max-width:340px} #rulebook .rb-stats td:nth-child(2){width:auto} #rulebook .rb-stats td.r{width:24px}
  #rulebook .rb-turn{counter-reset:st;list-style:none;padding-left:0}
  #rulebook .rb-turn>li{counter-increment:st;position:relative;padding-left:38px;margin:.6em 0}
  #rulebook .rb-turn>li:before{content:counter(st);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:#e0a32a;color:#241405;font-weight:900;display:flex;align-items:center;justify-content:center}
  @media (max-width:640px){ #rulebook .rb-top{gap:6px;padding:8px 12px} #rulebook .rb-title{font-size:16px} #rulebook .rb-tabs{order:9;flex-basis:100%;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px} #rulebook .rb-tab{flex:none} #rulebook .rb-top button{padding:5px 10px;font-size:11px} #rulebook .rb-cols{grid-template-columns:1fr} #rulebook .rb-routes{columns:1} #rulebook .rb-key td:nth-child(2){width:auto} #rulebook .rb-page{font-size:14px} }
  @media print{
    body>*:not(#rulebook){display:none!important}
    #rulebook{position:static;display:block!important;background:#fff;color:#111}
    #rulebook .rb-top{display:none} #rulebook .rb-body{overflow:visible;padding:0}
    #rulebook h2,#rulebook .rb-brand{color:#7a4a00} #rulebook h3{color:#7a4a00;border-color:#ccc} #rulebook h4{color:#7a5a20}
    #rulebook .rb-lede,#rulebook .rb-lead,#rulebook blockquote{color:#333} #rulebook .rb-dim{color:#777}
    #rulebook .rb-placard,#rulebook .rb-box{background:#fff;border-color:#bbb} #rulebook .rb-power{background:#f4efe3;color:#111}
    #rulebook td{border-color:#ddd} #rulebook .rb-mk{background:#fff}
    #rulebook .rb-section{page-break-after:always}
  }`;

  let root = null, cur = 'rules', ctxCache = null;
  function context() {
    if (ctxCache) return ctxCache;
    const core = probe(CORE_OPTS, 4), exp = probe(EXP_OPTS, 4), two = probe(EXP_OPTS, 2);
    ctxCache = { core, exp, two, heg: exp && exp.hegDials, allied: (a, b) => (exp && exp.allied ? exp.allied(a, b) : false) };
    return ctxCache;
  }
  function render(id) {
    const ctx = context(), f = SECTIONS[id];
    let html;
    try { html = f ? f(ctx) : '<p>—</p>'; } catch (e) { html = `<p class="rb-dim">This page could not be built: ${esc(e.message)}</p>`; }
    return `<section class="rb-section" data-id="${id}"><div class="rb-page">${html}</div></section>`;
  }
  function mount() {
    if (root || !doc) return root;
    const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    root = doc.createElement('div'); root.id = 'rulebook';
    root.innerHTML = `<div class="rb-top"><div class="rb-title">THE RULEBOOK</div><div class="rb-tabs"></div>
      <button class="alt sm" data-a="print">PRINT PAGE</button><button class="alt sm" data-a="printall">PRINT ALL</button><button class="sm" data-a="close">CLOSE ✕</button></div>
      <div class="rb-body"></div>`;
    doc.body.appendChild(root);
    const tabs = root.querySelector('.rb-tabs');
    TABS.forEach(([id, label]) => { const t = doc.createElement('div'); t.className = 'rb-tab'; t.dataset.id = id; t.textContent = label; t.onclick = () => show(id); tabs.appendChild(t); });
    root.querySelector('[data-a=close]').onclick = close;
    root.querySelector('[data-a=print]').onclick = () => global.print();
    root.querySelector('[data-a=printall]').onclick = () => { const b = root.querySelector('.rb-body'), keep = b.innerHTML;
      b.innerHTML = TABS.map(([id]) => render(id)).join(''); global.print(); b.innerHTML = keep; };
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('on')) close(); });
    return root;
  }
  function show(id) {
    mount(); cur = id || cur;
    root.querySelectorAll('.rb-tab').forEach(t => t.classList.toggle('on', t.dataset.id === cur));
    const b = root.querySelector('.rb-body'); b.innerHTML = render(cur); b.scrollTop = 0;
  }
  function open(id) { mount(); root.classList.add('on'); show(id || cur); }
  function close() { if (root) root.classList.remove('on'); }

  global.OIL_RULEBOOK = { open, close, show, SECTIONS, TABS, DIE, die, esc, context, brandOf, placeName, hqOf, render };
})(typeof window !== 'undefined' ? window : globalThis);
