/* OiL! THE RULEBOOK — the rules pages (THE RULES · THE EXPANSION · TWO PLAYERS).
   Written against the engine as the table plays it (audit 2026-10-23); every number below is read live from a
   probe game (ctx.core / ctx.exp / ctx.two — see src/oil-rulebook.js), so a dial change reprints the book.
   Where the engine and an older doc disagreed, THE ENGINE WINS here and the gap is listed for the designer
   (docs/RESUME-2026-10-22.md). House Rule 5: wording is a reading of the engine, not new canon. */
(function (global) {
  'use strict';
  const RB = global.OIL_RULEBOOK; if (!RB) return;
  const { esc, die, brandOf } = RB;
  const pct = x => Math.round(x * 100) + '%';
  const box = (h, cls) => `<div class="rb-box ${cls || ''}">${h}</div>`;

  // ======================================================================================== THE RULES
  RB.SECTIONS.rules = ctx => {
    const g = ctx.core, D = g.dials, C = g.crisisDials, L = g.dealDials, M = g.mapDials, P = g.pathDial ? (k => g.pathDial(k)) : (k => M[k]);
    const ER = D.EDD_ROLL;
    const faces = o => Object.keys(ER).filter(k => ER[k] === o).join('–');
    const peril = M.PERIL || {};
    return `<h2>THE RULES</h2>
    ${box(`<b>THE GAME IN ONE LINE.</b> Control a finite resource, and take it from the others before it runs out. Nobody refills the world. Every barrel any of you pulls is gone.`)}

    <h3>1 · THE TABLE</h3>
    <p><b>4–6 players.</b> Each takes a <b>company placard</b> (THE COMPANIES) and its ship pawn. You are that company for the whole game; your <b>HQ</b> is your seat on the board and your ship starts there.</p>
    <p><b>Each company starts with:</b> ${D.BARRELS_START} barrels · ${D.PIPS_START} pips · $0 · ▰0 control · 0 exposure. <span class="rb-dim">(Some placards change this — Stock Oil +$8, Milecastle +2 pips.)</span></p>
    <p><b>The world starts at:</b> price <b>$${D.PRICE_START}</b> on a track from $${D.PRICE_MIN} to $${D.PRICE_MAX} · the era <b>STABLE</b> · the well at <b>${D.OIL_START} oil</b>. Shuffle the three decks. Deal <b>${P('MARKET_SIZE')} contracts</b> face up (buyers waiting at places nobody stands on).</p>
    <p>Play goes round the table. A <b>round</b> is everyone taking one turn.</p>

    <h3>2 · A TURN</h3>
    <ol class="rb-turn">
      <li><b>ROLL THE THREE.</b> Roll ${die('Supply')} Supply, ${die('Weather')} Weather and ${die('World')} World together. Sort them low → high and read them as one number:
        ${box(`<b>the shove = low − 2 × middle + high</b> &nbsp;(from −5 to +5)`)}
        A shove of <b>${D.T_CHAOS} or more</b> either way makes the era <b>CHAOTIC</b>; anything smaller is <b>STABLE</b>. The dice are fair and aimed at nobody — they are weather and markets.
        <br><b>The slingshot (pips).</b> On a CHAOTIC roll you may spend <b>1 pip</b>: turn <b>all three dice upside down</b>. The shove keeps its size and <b>flips its sign</b> (+5 → −5) — a boom becomes a crash, a crash a boom. The spread is the same, so how far you sail is the same. Every <b>${D.PIP_REGEN_EVERY}rd turn of your own</b>, you gain a pip back (up to ${D.PIPS_START}; a company that starts with more keeps them until it spends them).</li>
      <li><b>THE PRICE MOVES.</b> Add the shove to the price. Once the well is down to <b>${D.SCARCITY_BAND} or less</b>, scarcity adds more every turn: <b>+ (${D.SCARCITY_BAND} − oil) ÷ ${D.SCARCITY_DIV}</b>, rounded up. The price never leaves $${D.PRICE_MIN}–$${D.PRICE_MAX}. Everyone's barrels are worth that price — there is one market and you are all in it.</li>
      <li><b>YOUR POWER.</b> Your placard's power happens now, every turn, automatically.</li>
      <li><b>SAIL.</b> The dice also say how far the world lets you move: <b>high die − low die</b> (at least ${M.MOVE_MIN}, at most ${M.MOVE_MAX}). Move your ship to any place that many route spaces away or fewer — or stay. <b>Shut gates (✕) block you</b>; the arctic is iced until it is developed. <b>In a CHAOTIC era the sea is dangerous:</b> each place you enter can cost you a barrel and +1 exposure — a strait ${pct(peril.gate || 0)}, open water ${pct(peril.ocean || 0)}, a cape ${pct(peril.cape || 0)}, the arctic ${pct(peril.arctic || 0)}. Going round a closure, a cape or the ice is <b>the long way</b>: +${M.LONGWAY_PCT}% on your next sale.</li>
      <li><b>ACROSS THE TABLE — draw, then one call.</b> Draw <b>1 card</b>: from <b>DEEDS</b> if you are at an HQ, <b>COMPETITION</b> at a strait or canal, <b>FREEDOM-MARKET</b> anywhere else. You hold at most <b>3</b> — a fourth pushes out your oldest. Then do <b>one</b>: <b>PLAY A CARD</b> · <b>OFFER A DEAL</b> (§4) · <b>BREAK A DEAL</b> · pass.</li>
      <li><b>ON THE GROUND — one call</b> (only where there is somebody to sell to: an HQ or onshore ground; at sea you are in transit and skip this):
        <ul>
          <li><b>SELL</b> one barrel where you stand (§3). That sale is your claim on the ground: <b>+1 control ▰</b>.</li>
          <li><b>CALL THE SERVICE</b> on a fire you are standing on, or buy a <b>RETAINER</b> at your own HQ (§5).</li>
          <li><b>HOLD</b> — always allowed, never free if you sat still: a turn you neither moved nor sold costs <b>+${D.HOLD_PENALTY} exposure</b>.</li>
        </ul></li>
      <li><b>THE WELL BURNS.</b> Take <b>1 + price ÷ ${D.BURN_PER_PRICE}</b> (rounded down) oil off the well: 1 under $${D.BURN_PER_PRICE}, 2 to $${2 * D.BURN_PER_PRICE - 1}, 3 to $${3 * D.BURN_PER_PRICE - 1}, 4 at $${3 * D.BURN_PER_PRICE}. Every fire burns <b>${C.FIRE_BURN}</b> more. Then check the end (§6).</li>
    </ol>
    ${box(`<b>Roll, sail, then two calls: one across the table, one on the ground.</b> If you are ever choosing a third thing, something has gone wrong.`)}
    <p class="rb-dim">Where barrels come from: you start with ${D.BARRELS_START}; more come only from cards and Petro Sur's power. <i>(Open design call CORE-022 — supply.)</i></p>

    <h3>3 · SELLING — what a barrel fetches</h3>
    <p>A sale is worth the <b>price</b>, adjusted for where you stand and what the world is doing:</p>
    <table><tr><td><b>A contract</b> — sell at a face-up contract's place</td><td>+${M.CONSIGN_BONUS}% and <b>+▰${P('CONSIGN_POINTS')} more</b>; the contract is filled and a new one is dealt</td></tr>
      <tr><td><b>No contract</b> — dumped on the market</td><td>×${M.CONSIGN_DUMP}% (onshore ground is never a dump)</td></tr>
      <tr><td><b>Shut straits</b> — the freight premium</td><td>+${M.FREIGHT_PCT}% for each shut gate (at most ${M.FREIGHT_CAP})</td></tr>
      <tr><td><b>Boxed in</b> — each blocked route out of where you stand</td><td>−${M.BLOCK_PCT}% (never below ${M.BLOCK_FLOOR}%)</td></tr>
      <tr><td><b>The long way</b> (round a closure, a cape or the ice)</td><td>+${M.LONGWAY_PCT}%</td></tr>
      <tr><td><b>Onshore ground</b></td><td>+${M.ONSHORE_PCT}%, and +${C.HEAT_ONSHORE} heat there</td></tr>
      <tr><td><b>A rival's HQ</b> (an incursion)</td><td>+${M.INCURSION_BONUS}% — but you and the host each take +${M.INCURSION_HIT} exposure and the place +${C.HEAT_INCURSION} heat</td></tr>
      <tr><td><b>A burning place</b></td><td>×${C.FIRE_DELIVERY}%</td></tr>
      <tr><td><b>Somebody else's station</b></td><td>${M.TOLL_PCT}% of the sale goes to whoever holds that place</td></tr></table>
    <p><b>Holding a place (stations).</b> Every barrel sold at a place counts for the seller there; the count fades each round (×${D.THROUGHPUT_DECAY}). You <b>hold</b> a place with at least ${D.CONTROL_MIN} and ${D.CONTROL_MARGIN}× the next company; otherwise it is contested. Holding is not the score — it earns tolls, and it is what Green Anders and the Protocol come for.</p>

    <h3>4 · THE CARDS AND THE DEALS</h3>
    <p><b>Three decks.</b> <b>DEEDS</b> — what you own and what owning it lets you do. <b>COMPETITION</b> — what you do to <i>them</i>: war, government, sabotage, blame (the biggest deck, because this is the game). <b>FREEDOM-MARKET</b> — what the market does to everyone. Every card's text is in IN THE BOX. Cards tagged as war and government also put <b>heat</b> on the place you stand.</p>
    <p><b>Deals.</b> Offer one of three; the other company says yes or no.</p>
    <table><tr><td><b>PACT</b></td><td>Each time it ticks, you both gain $${L.PACT_SKIM} and take +${L.PACT_HEAT} exposure.</td></tr>
      <tr><td><b>TRIBUTE</b></td><td>The payer gives the holder $${L.TRIB_VAL} each tick and sheds ${L.TRIB_SHIELD} exposure; the holder takes +${L.TRIB_CARRY}.</td></tr>
      <tr><td><b>SCAPEGOAT</b></td><td>One shot: you each pay ${L.SCAPE_PIP} pip and shed ${L.SCAPE_SHED} exposure, and the biggest control holder outside the two of you takes +${L.SCAPE_DUMP}.</td></tr></table>
    <p>A deal ticks on either partner's turn and lapses clean after <b>${L.LIFE} ticks</b> (about two rounds). <b>You may break it at any time.</b> Breaking costs you <b>+${L.BETRAY_HEAT} exposure</b> and earns a <b>grudge</b> (a pact-breaker loots up to $${L.BREAK_LOOT}; a broken tribute claws back). There is no enforcement — that is the point. <b>Partners are shielded</b> from each other's Protocol; a <b>grudge</b> aims it (§6).</p>

    <h3>5 · WHEN IT GOES WRONG — heat, fire, and who you call</h3>
    <table><tr><td><b>HEAT</b> — on a place</td><td>Stress on the ground. A CHAOTIC season puts +${C.HEAT_CHAOS_GATES} on every open strait and +${C.HEAT_CHAOS_LOCAL} where the roller stands; a shut strait warms the HQs beside it; war and government cards, incursions, onshore sales and Protocol strikes add more. It fades by ${C.HEAT_DECAY} everywhere every ${C.HEAT_DECAY_EVERY} turns (most ${C.HEAT_MAX} on a place).</td></tr>
      <tr><td><b>EXPOSURE</b> — on you</td><td>It is on the record that you needed help. It decides ties, and (with the expansion) how many dice you roll.</td></tr></table>
    <p><b>Absorbing heat.</b> When a hit of ${C.ABSORB_MIN}+ heat lands on a seated HQ, its company takes the edge off: a <b>state</b> company sheds ${C.STATE_ABSORB} heat for +${C.STATE_EXPOSURE} exposure (legitimacy); a <b>private</b> one sheds ${C.PRIVATE_ABSORB} for $${C.PRIVATE_FEE} (lobbying).</p>
    <p><b>What heat does.</b> A strait at <b>${C.GATE_SHUT_AT} heat shuts</b> (✕) for ${M.CLOSE_TURNS} turns (never if it would cut an HQ off the world). An HQ at <b>${C.BLOWOUT_AT} heat blows</b>: a <b>FIRE</b>. A fire never goes out on its own — it burns <b>${C.FIRE_BURN} oil a turn</b> for everyone and gives its company <b>+${C.FIRE_HEAT} exposure a turn</b>, and sales from it are halved.</p>
    <p><b>Call the service (IWS).</b> Stand on the fire and pay <b>$${C.IWS_BASE} + $${C.IWS_PER_TURN} for every extra turn it has burned</b>, +${C.IWS_EXPOSURE} exposure: the fire is out and the place cools. <b>A retainer:</b> $${C.RETAINER_COST} at your own HQ once its heat is ${C.RETAINER_AT}+ (not burning) — your HQ takes ${C.RETAINER_SHIELD} more heat before it blows, for ${C.RETAINER_TURNS} turns. Or let it burn.</p>

    <h3>6 · HOW IT ENDS — THE E.D.D. PROTOCOL</h3>
    <p><b>The oil only goes down, every turn.</b> The Protocol — <b>EAT · DIVIDE · DESTROY</b> — <b>arms</b> the first time any of these happens:</p>
    <ul><li>the well is down to <b>${D.EDD_OIL}</b> or less;</li>
      <li>the price is <b>$${D.EDD_PRICE}</b> or more in a <b>CHAOTIC</b> era;</li>
      <li>the board carries <b>${C.ANNIHILATION_AT} heat</b> in all (too much of the world on fire).</li></ul>
    <p>Once armed (starting that very turn), <b>the turn's player rolls one die</b> and strikes the <b>richest other company</b> (most $ + barrels × price) — but a company you hold a <b>grudge</b> against comes first (the grudge is spent), and your <b>deal partners are spared</b>. If everyone left is your partner, the Protocol finds nobody.</p>
    <table><tr><td class="r">${faces('EAT')}</td><td><b>EAT</b></td><td>You take +▰1 and their barrels' worth in $; they lose every barrel and take +3 exposure.</td></tr>
      <tr><td class="r">${faces('DIVIDE')}</td><td><b>DIVIDE</b></td><td>Half their control (rounded down) moves to you.</td></tr>
      <tr><td class="r">${faces('DESTROY')}</td><td><b>DESTROY</b></td><td>They lose ▰1 and take +2 exposure; 1 oil burns; the strait nearest them shuts.</td></tr></table>
    <p>Every strike also puts +${C.HEAT_EDD} heat where the target stands. <b>The game ends the moment the well hits 0 — always.</b></p>
    ${box(`<b>WHO WINS:</b> the most <b>control ▰</b>. Tied: the <b>least exposure</b>. Still tied: the richest <b>holdings</b> ($ + barrels at the final price). <br><span class="rb-dim">Most Protocols arm because the oil is nearly gone; some on a spike; a few because too much of the world is on fire. You are not playing to save it. You are playing to be holding the most when it goes.</span>`, 'red')}`;
  };

  // ==================================================================================== THE EXPANSION
  RB.SECTIONS.expansion = ctx => {
    const g = ctx.exp, D = g.dials, K = g.clockDials, V = g.privDials, O = g.momDials, H = g.hegDials, Mp = g.mapDials;
    const seatRow = n => { const oil = K.OIL_PER_SEAT * n; return `<tr><td class="r">${n}</td><td>${oil}</td><td>${Math.round(K.EDD_OIL_PER_SEAT * n)}</td><td>$${K.EDD_PRICE_BASE + K.EDD_PRICE_PER_SEAT * n}</td><td>${Math.round(K.SCARCITY_PER_SEAT * n)} / ${K.SCARCITY_DIV_PER_SEAT * n}</td></tr>`; };
    const PW = ((global.OIL_MOMENTUM || {}).PIRATE_WATERS || []);
    const dem = O.DEMURRAGE || [], dex = O.DEMURRAGE_EXP || [];
    const allyLine = Object.keys(H.AFFINITIES || {}).map(a => `${esc(brandOf(a))} with ${(H.AFFINITIES[a] || []).map(b => esc(brandOf(b))).join(' and ')}`).join('; ');
    return `<h2>THE EXPANSION</h2>
    <p class="rb-lede">The fourth die, the two franchises, and the sea's law. Play THE RULES first; this changes them. With the expansion, <b>2–8</b> play (two players: see TWO PLAYERS).</p>

    <h3>① THE GREEN ANDERS DIE ${die('Green Anders')}</h3>
    <p>The three bodies are nature and markets — symmetric, untargeted, nobody's enemy. <b>Anders is none of those things.</b> It is never anybody's die.</p>
    <p><b>On every CHAOTIC turn</b>, right after the price moves, throw the green die. On <b>${D.GREEN_TRIGGER}+</b> Anders leans on the tape: the price moves <b>3 more</b> the way the shove went. On a <b>${D.GREEN_PUNITIVE_AT}</b> it also reaches across the table to the <b>richest company</b> — who takes +1 exposure and, by the turn (count the table's turns: 1st, 2nd, 3rd, repeat): <b>SEIZE</b> (their first held place is stripped) · <b>BLAME</b> (+${D.GREEN_SEIZE_HEAT} heat there) · <b>LEVY</b> (up to $${D.GREEN_LEVY}). (Anders reads the dice as they lie, after any flip.)</p>
    <p><b>BUILD</b> becomes a ground call: with <b>▰${Mp.BUILD_CONTROL}+</b>, at an HQ, pay <b>▰${Mp.BUILD_COST}</b> and take +${Mp.BUILD_HEAT} exposure to raise a <b>megastructure</b> (THE BOARD). Ships passing through pay its builder $${Mp.PASSAGE_TOLL}; every contract landed there pays the builder ▰${Mp.MEGA_POINTS}.</p>
    <p><b>The franchises</b> — ${esc(brandOf('PETRO_SUR'))} and ${esc(brandOf('HADDAD'))} — join the eight companies.</p>

    <h3>② THE PRIVILEGE — who rolls the dice</h3>
    ${box(`<b>Your privilege is how many of the three dice you roll yourself.</b> Every <b>${V.PRIV_STEP} exposure</b> above the cleanest company costs one: ●●● → ●●○ → ●○○ (never fewer than ${V.PRIV_FLOOR}). You keep ${die('Supply')} first, then ${die('Weather')}; the house throws the rest.`, 'grn')}
    <ul><li><b>A die bends only for the hand that holds it:</b> you may flip the roll only if the <b>middle</b> die is yours.</li>
      <li><b>You sail on your own dice:</b> your move is the spread of the dice you hold.</li>
      <li><b>The sea's law:</b> halt at or sail through one of the seven gates (${['HORMUZ', 'SUEZ', 'BAB', 'MALACCA', 'PANAMA', 'GIBRALTAR', 'LAWRENCE'].map(RB.placeName).join(', ')}) and you are <b>a die short on your next roll</b>. The Turkish and Danish Straits halt you but take nothing. Round a cape and keep your dice.</li>
      <li><b>A rival gets your die only when something hands it over</b> — and only while you are already short:
        <br>◉ <b>SEIZE</b> — they throw it for <b>${V.SEIZE_ROLLS} rolls</b> and the flip is theirs. Handed over by: a <b>SNARE</b> they laid (cost them ${V.SNARE_PIP} pip and +1 exposure; it rusts after ${V.SNARE_LIFE} of your turns; never on a partner) springing when you lose a die · a dirty <b>inspection</b> in their home water · the Protocol's <b>EAT</b> · a card (Leviathan Knows, Boots On The Ground, Dog-Wagged, Strait Flush).
        <br>◐ <b>TOLL</b> — you throw it, they take its flip and <b>${V.TOLL_CUT}% of your sale</b>, for ${V.TOLL_TURNS} turns (a tribute toll lasts as long as the tribute). Handed over by: paying <b>tribute</b> or being made <b>scapegoat</b> while short · the Protocol's <b>DIVIDE</b> · a card (I've Travelled Across For You, Oligarcheology, Rogue Wave).</li>
      <li><b>The state</b> (private companies only): in <b>wartime</b> — the board at <b>${V.GOV_HEAT_AT} heat</b>, or the Protocol armed — each round the state requisitions a die from the private company with the most control, for ${V.GOV_ROLLS} rolls. A war or government card played in wartime does it too.</li>
      <li><b>Get back to ●●● and every claim on you ends.</b></li></ul>

    <h3>③ MOMENTUM — the sea carries you <span class="rb-dim">(replaces SAIL)</span></h3>
    <p>Your move is <b>double the spread of your own dice, in spaces</b> (at least ${2 * V.PRIV_MOM_MIN}, at most ${2 * 5}) and you <b>must</b> use all of it — the only choice is <b>which fork</b>. You stop early only at a <b>◆ STOP line</b> (every canal and strait), at a <b>⚖ INSPECTION</b> if you are on the record (${O.DIRTY_GAP}+ exposure above the cleanest: halted, fined $${O.INSPECT_FINE} and +1 exposure — in a rival's home water, arrested), or by <b>putting in</b> to a port you reach. A <b>» CURRENT</b> carries you ${O.CURRENT_PUSH} more space (${O.CURRENT_PUSH + 1} if your Weather die shows ${O.CURRENT_STRONG}+).</p>
    <p><b>Or CAMP:</b> stay put and pay <b>demurrage</b> — $${dem[1]}, then $${dem[2]} + ${dex[2]} exposure, then $${dem[3]} + ${dex[3]} every turn after; from the second turn it puts +${O.CAMP_HEAT} heat where you sit. Sailing out and back is camping too. Under momentum a HOLD costs nothing more. At sea you still draw — from FREEDOM-MARKET.</p>

    <h3>④ PIRATES, THE EMBARGO, AND THE FIRM</h3>
    <p><b>☠ Pirates</b> board <b>private</b> ships only, and only in pirate water: ${PW.map(esc).join(', ')}, and the straits of Bab el-Mandeb and Malacca. <b>In the Caribbean it is THE EMBARGO</b> — Cuba style: run it and you are stopped and held; same throw. They follow the world: a <b>STABLE</b> sea is quiet (unless that water carries ${V.PIRATE_HOT}+ heat); a <b>CHAOTIC</b> season (for a round) or a shut pirate strait wakes them — the house throws, <b>6</b> boards you; in <b>wartime</b> or once the Protocol is armed they are loose — <b>${V.PIRATE_SEVERE_AT}–6</b>. Boarded: a die held for ransom, <b>${V.PIRATE_ROLLS} rolls</b>.</p>
    <p><b>⊛ THE FIRM — the bribe.</b> Caught dirty at an inspection, throw the green die: <b>5–6</b> and Anders &amp; Partners wave you through (no fine, no arrest) — but it is on the record: +1 exposure.</p>
    ${box(`<b>⊛ THE PROTOCOL.</b> At every E.D.D. strike, throw the green die: on <b>5–6 the firm files it</b>. The strike goes to <b>the leader</b> — whoever would win if the game ended now — and <b>no grudge and no partner spares them</b>. On EAT or DIVIDE the <b>firm</b>, not the striker, holds one of the leader's dice for <b>${V.ANDERS_ROLLS} rolls</b> (the house throws it; the ⊛ on their dice) — even if they were clean.`, 'grn')}

    <h3>⑤ THE SEAT CLOCK — the well scales with the table</h3>
    <p>The well is <b>${K.OIL_PER_SEAT} oil a seat</b>, so every size of table plays about six rounds. The Protocol arms with <b>${K.EDD_OIL_PER_SEAT} oil a seat</b> left (about one last lap), or on a spike to <b>$${K.EDD_PRICE_BASE} + $${K.EDD_PRICE_PER_SEAT} a seat</b> in a CHAOTIC era, or when the board reaches <b>${K.ANNIHILATION_AT} heat</b>. A CHAOTIC season heats the straits <b>once a round</b>, not every turn.</p>
    <table><tr><td class="r"><b>seats</b></td><td><b>well</b></td><td><b>E.D.D. at</b></td><td><b>spike</b></td><td><b>scarcity from / ÷</b></td></tr>${[3, 4, 5, 6, 7, 8].map(seatRow).join('')}</table>
    <p class="rb-dim">Two players: the HEGEMONY numbers apply (TWO PLAYERS).</p>

    <h3>⑥ THE DUCKS · RICO</h3>
    <p>Under eight players, <b>every company nobody plays sits at its HQ as a sitting duck</b> (◇).</p>
    ${box(`<b>RICO — ducks on a pond, we all go down.</b> A Protocol strike that lands <b>spreads</b> when the board carries <b>${H.RICO_HEAT_AT}+ heat</b>, when <b>the firm filed it</b>, or when <b>${(H.RICO_CARDS || []).map(esc).join(', ')}</b> was played since the Protocol armed (that arms the next spread). Every standing <b>partner</b> of the struck company, and its <b>franchise ally</b> at the table, loses <b>▰${H.RICO_CONTROL}</b> and takes <b>+${H.RICO_EXPOSURE} exposure</b>. The striker is never splashed. It spreads once and never chains. Break the deal first if you want out — and carry the grudge.`, 'red')}
    <p><b>Franchise allies:</b> ${allyLine}. ${esc(brandOf('PETRO_SUR'))} and ${esc(brandOf('HADDAD'))} are <b>never</b> allies.</p>`;
  };

  // ================================================================================ TWO PLAYERS
  RB.SECTIONS.two = ctx => {
    const g = ctx.two, H = g.hegDials, D = g.dials, C = g.crisisDials;
    const BY = H.BACKYARD || {}, codes = Object.keys((global.OIL_FACTIONS_FX || {}).FACTIONS || {});
    return `<h2>TWO PLAYERS — HEGEMONY</h2>
    <p class="rb-lede">With the expansion and two players, all eight companies are on the board: you run one each, and the other six are <b>sitting ducks</b> at their HQs. Each duck is a stake of control you both hold — and collecting it off the board hurts your rival.</p>

    <h3>SETUP</h3>
    <ul><li>Put a duck pawn at the HQ of each of the six companies nobody plays.</li>
      <li><b>THE BACKYARD.</b> You each hold <b>◇1</b> in every duck — and <b>◇2</b> in your nearest few, as printed on your placard:
        <div class="rb-grid">${codes.map(c => `<div><b>${esc(brandOf(c).split(/[ /(]/)[0])}</b><span>◇2 × ${BY[c] != null ? BY[c] : H.BACKYARD_DEFAULT}</span></div>`).join('')}</div>
        Count your nearest ducks by sailing distance from your HQ (THE COMPANIES lists them in order). A duck that is your <b>franchise ally</b> leans +◇1 more. No dice.</li>
      <li><b>The well</b> counts every company: <b>${D.OIL_START} oil</b>. The Protocol arms at <b>${D.EDD_OIL}</b>, on a spike to <b>$${D.EDD_PRICE}</b> in a CHAOTIC era, or at <b>${C.ANNIHILATION_AT} board heat</b>.</li></ul>

    <h3>THE SCORE</h3>
    <p>Your control for the verdict is <b>your ▰ + your ◇ in every duck still standing + your ◇ in every duck you collected.</b> A duck your rival collects takes your ◇ in it with it.</p>

    <h3>COLLECTING A DUCK — tough, but designed</h3>
    <ol class="rb-turn">
      <li><b>Sail into the duck's yard</b> (its HQ) and end your turn there.</li>
      <li><b>Stay</b> and end your next turn there too (under momentum, that is a camp — you pay the demurrage). Once the Protocol is armed the ducks are loose: <b>one</b> turn is enough.</li>
      <li>You must be <b>clean — ●●● from your own record</b> (dice lost to the sea or the state do not count against you), your rival must <b>not be docked in the same yard</b>, and no <b>snare</b> may stand on you. If any of that fails, start again.</li>
      <li><b>Collected:</b> the duck comes off the board. You take <b>+▰${H.COLLECT_CONTROL}</b> (its ground) and <b>+${H.COLLECT_EXPOSURE} exposure</b> (it is on the record); you keep your ◇ in it; <b>your rival loses theirs</b>.</li></ol>
    ${box(`<b>The answers:</b> dock in the same yard (nobody collects while you are both there), or lay a <b>snare</b> on the collector — a standing snare stops the collection even if they are clean. The leader gets no extra turn; nobody does, unless a card or the game's own chain hands one over.`)}

    <h3>RICO AT TWO</h3>
    <p>When a Protocol strike spreads (THE EXPANSION ⑥), the duck the struck player holds the most ◇ in is <b>knocked off the pond</b> — and <b>everyone</b> loses their stake in it. (The only other player is the striker, who is never splashed.)</p>

    <h3>MINA GAZ AT TWO</h3>
    <p>With one rival the mine would never miss. In the two-player game Mina Gaz's Chokepoint goes off only while the rival is <b>richer than Mina</b>.</p>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
