/* OiL! THE MAP — the shipping world: 8 HQs, real passages, and the long ways round.
   ============================================================================
   Roadmap #3. Built to the designer's brief (2026-09-01):
     "a world of movement pipelines that represent commercial waterways and many
      actual known routes and channels and passages, such as the St Lawrence River,
      Strait of Hormuz, Panama Canal, or certainly long ways around Africa and South
      America or north, that offer opportunities and perils depending on the
      stable/chaotic nature of rolling three dice per turn."

   ASSEMBLED FROM LOCKED MATERIAL, NOT INVENTED (House Rule 5):
     · `../data.py` MAP_OBSERVED — "Pacific-centered world map, gold land on black
       ocean… LOGISTICS = gold (routes/chokepoints), MYTH = black ocean… Chokepoints
       implied by cards: Hormuz / Panama / Suez (Strait Flush), Malacca/Pacific lanes."
     · CORE-001, CLARIFIED by the designer 2026-06-15: all 8 factions are ALWAYS on
       the board; they don't move; each sits on its HQ; speculators play OVER a fixed
       8-HQ board. -> the HQ node set is the designer's.
     · each faction's `region` in ../data.py -> where its HQ sits.
     · EDD_PROTOCOL's own text: EAT "acquire territory", DIVIDE "split region",
       DESTROY "disable route" -> the protocol already speaks geography.
     · docs/EXPANSION-NOTES.md megastructures: Arctic Development "unlock hard
       reserves", Sea City "new strategic locations, CHANGES SHIPPING", Space
       Elevator "post-oil infrastructure" -> the late-game map hooks.
   STRAWMAN (CONCEPT, dials, the designer's — logged as CORE-016): the adjacency,
   which passage sits on which route, the coordinates, and every number below.

   ============================================================================
   THE THREE GRAMMARS OF A ROUTE — this is the design.
   The board is a network of PLACES, and the risk lives in the PLACE you pass
   through, not in an abstract edge weight:

     GATE   a canal or strait — Hormuz, Suez, Panama, Malacca, the Seaway.
            SHORT and cheap. But it can be CLOSED, and when it shuts everything
            through it stops. This is political risk. ("Strait Flush.")

     CAPE   the long way round — Good Hope, the Horn. LONG and expensive, but
            NOBODY CAN CLOSE THE OCEAN. In STABLE seas it is merely slow. In a
            CHAOTIC season it is where cargo is lost.
            THE OPPORTUNITY: if you deliver the long way while the fast gate
            between the same waters is shut, you land the FREIGHT PREMIUM —
            the real market's truth, that a closed canal is a payday for whoever
            already committed to the Cape.

     ARCTIC the northern routes — the NSR over Siberia, the Northwest Passage.
            CLOSED BY DEFAULT: ice. Arctic Development (megastructure) opens them
            for good and redraws the world's distances. Highest peril of all.

     PIPE   overland — Druzhba, the Caspian line, the domestic system. Immune to
            weather and immune to the sea's politics, but it goes where the ground
            goes, and the ground belongs to somebody.

   THE DICE DECIDE THE SEA. The engine already reads the locked three bodies for
   the price shove and sets era = CHAOTIC when |shove| >= T_CHAOS. That SAME read
   now says what the ocean is doing this turn. No new die (Charter: one roll,
   read on layers). Movement distance is a THIRD read of the same three bodies —
   the SPREAD (max - min): how far apart the bodies landed = how far the world
   moved. See CORE-016 for the open question about that read.

   Runs in Node (globalThis) and the browser (window). */
(function (global) {
  'use strict';

  // ---- DIALS (all CONCEPT) ---------------------------------------------------
  const MAP_DIALS = {
    // --- how the locked 3-die roll is read for MOVEMENT (a second emergent read) ---
    //   'spread' — steps = max - min (0..5, mean ~2.8). Default.
    //   'median' — steps = the middle body (1..6).
    //   'fixed'  — steps = MOVE_FIXED. The null hypothesis: movement isn't diced.
    MOVE_READ: 'spread',
    MOVE_FIXED: 3,
    MOVE_MIN: 1,            // you always get at least this much way on (never becalmed)
    MOVE_MAX: 5,            // cap, so a turn stays legible
    STAY_HEAT: 1,           // "always move or suffer": end where you started -> +exposure

    // --- gates (canals & straits) ---
    CLOSE_TURNS: 3,         // a closure is ALWAYS finite (gated in LAB 8)

    // --- the sea, when the three bodies disagree (era === 'CHAOTIC') ---
    // peril = chance of trouble entering a place at sea in a chaotic season.
    // A strait counts: a crowded chokepoint in a bad season is where hulls meet.
    // Overland and HQs are immune — the weather is the sea's argument, not the
    // pipeline's. In a STABLE season all of this is zero: the long way is merely long.
    PERIL: { gate: 0.10, ocean: 0.18, cape: 0.40, arctic: 0.60 },
    PERIL_BARREL: 1,        // cargo lost overboard
    PERIL_HEAT: 1,          // exposure (an incident is an incident)

    // --- the freight premium ---
    // When a gate shuts, freight gets scarce and every cargo that CAN move is worth
    // more. That is the real market's response, and it is why closing a strait is
    // never simply a punishment — it is a TRANSFER, from whoever is stuck behind it
    // to whoever is not. The squeeze below is the other half of the same trade.
    FREIGHT_PCT: 20,        // % bonus per shut gate (capped) on any delivery that can move
    FREIGHT_CAP: 2,         // ...counting at most this many shut gates
    LONGWAY_PCT: 25,        // extra, if you personally ran a Cape or the ice to get here

    // --- delivery squeeze: blocked routes out of where you stand cut what you sell ---
    BLOCK_PCT: 25,          // % of price lost per blocked route out of your node
    BLOCK_FLOOR: 25,        // never below this % of price — you always sell something

    // --- raising a megastructure (expansion; the late-game move) ---
    BUILD_CONTROL: 6,       // control you must hold before you can reshape the world
    BUILD_COST: 2,          // control spent raising it
    BUILD_HEAT: 2,          // exposure taken (a megaproject is a very visible thing)

    // --- standing on a rival's HQ ---
    // ONSHORE ground is DOMESTIC — nothing is shipped, no freight is bought, and no strait can be
    // shut on you. So the barrel nets more. That is the temptation, and the bill arrives instead as
    // HEAT on the place (crisisDials.HEAT_ONSHORE): the cheap barrel is the one pulled out from
    // under somebody's house. docs/THE-CONTROL-LAYER.md §4.
    ONSHORE_PCT: 12,        // % bonus for working your own ground
    INCURSION_BONUS: 25,    // % bonus on the sale (selling out of their yard)
    INCURSION_HEAT: 1,      // exposure you take for it
    INCURSION_HIT: 1,       // exposure the HQ's seat takes (the swing)

    // --- CONSIGNED CARGO (opts.consign — the 2026-09-24 model) ---
    // These two were READ by the engine but never DEFINED, so every consigned delivery was
    // worth NaN in the first A/B. The behaviour numbers (60% reached the buyer) were real,
    // because the bots never read the value; every $ and every holdings tie-break was not.
    CONSIGN_BONUS: 35,      // % added when you land the cargo at its named buyer
    CONSIGN_DUMP: 45,       // % of spot you get for dumping it anywhere else
    LAND_WITHIN: 4,         // a bot carries a cargo on (rather than dumping it) if a buyer is this close

    // --- THE PATH (opts.path — docs/THE-PATH.md). ALL CONCEPT DIALS. -----------------------
    // The shipping route as the game path: a small face-up CONTRACT MARKET everybody chases,
    // CONTROL of a buyer paying the controller a TOLL on every rival cargo landed there, and
    // megastructures that are places you can sell at and routes you pay to use.
    MARKET_SIZE: 3,         // face-up contracts on the table (shared buyers, first to land takes it)
    CLUSTER_W: 1,           // 'cluster': a buyer's weight in the draw = 1 + this × barrels landed there
    TOLL_PCT: 20,           // % of a landed cargo's value paid to whoever holds that buyer
    CONSIGN_THROUGHPUT: 1,  // station-meter barrels a LANDED contract counts for (1 = same as a sale)
    CONSIGN_POINTS: 0,      // extra ▰ for landing a contract at its buyer (the verdict reads ▰ first)
    PASSAGE_TOLL: 4,        // $ paid to a structure's builder for sailing through what they raised/opened
    MEGA_POINTS: 1,         // ▰ to a structure's builder each time a contract is landed AT it
    CLOSE_ROUNDS: 2,        // 'rounds': a closure lasts this many ROUNDS (the table all sails)
  };

  // ============================================================================
  // THE PLACES. `at` = normalized [x,y] on assets/board/oil_board.png
  // (Pacific-centered: Europe/Africa left, Asia centre-left, Pacific centre,
  // Americas right). Coordinates are a first read off the art — nudge freely.
  //   kind: 'hq' (the 8, where you can act) | 'gate' (closeable) |
  //         'ocean' (open water) | 'cape' (the long way) | 'arctic' (iced shut) |
  //         'built' (exists only once a megastructure is raised)
  // ============================================================================
  const PLACES = [
    // -- the 8 HQs (LOCKED node set) --
    { code: 'MILECASTLE', kind: 'hq', name: 'The North Sea',   region: 'UK / Europe',                          at: [0.125, 0.215] },
    { code: 'MINA',       kind: 'hq', name: 'The Volga',       region: 'Post-Soviet — Russian state sphere',   at: [0.205, 0.185] },
    { code: 'NIKOYL',     kind: 'hq', name: 'The Caspian',     region: 'Post-Soviet — private/oligarch sphere', at: [0.240, 0.268] },
    { code: 'HADDAD',     kind: 'hq', name: 'The Gulf',        region: 'Middle East — Gulf',                   at: [0.205, 0.360] },
    { code: 'BRIGHT',     kind: 'hq', name: 'The Mainland',    region: 'China',                                at: [0.330, 0.325] },
    { code: 'HARTSTARR',  kind: 'hq', name: 'The Gulf Coast',  region: 'USA — South / heartland',              at: [0.712, 0.372] },
    { code: 'STOCK',      kind: 'hq', name: 'The Northeast',   region: 'USA — Northeast / Wall Street',        at: [0.766, 0.312] },
    { code: 'PETRO_SUR',  kind: 'hq', name: 'The Orinoco',     region: 'South America — Venezuela',            at: [0.792, 0.452] },

    // -- GATES: the canals and straits. Every one of these can be shut. --
    { code: 'HORMUZ',   kind: 'gate', name: 'Strait of Hormuz',  at: [0.228, 0.378] },
    { code: 'SUEZ',     kind: 'gate', name: 'Suez Canal',        at: [0.176, 0.345] },
    { code: 'BAB',      kind: 'gate', name: 'Bab el-Mandeb',     at: [0.196, 0.412] },
    { code: 'MALACCA',  kind: 'gate', name: 'Strait of Malacca', at: [0.306, 0.428] },
    { code: 'PANAMA',   kind: 'gate', name: 'Panama Canal',      at: [0.746, 0.418] },
    { code: 'GIBRALTAR',kind: 'gate', name: 'Strait of Gibraltar', at: [0.108, 0.298] },

    { code: 'LAWRENCE', kind: 'gate', name: 'The St Lawrence Seaway', at: [0.742, 0.268] },

    // -- OPEN WATER: nobody closes the ocean. --
    { code: 'NATLANTIC', kind: 'ocean', name: 'The North Atlantic', at: [0.860, 0.250] },
    // Named passages that are NOT (yet) closeable gates: with the locked 8-HQ node
    // set and the overland pipelines in place, shutting either of these forces
    // nobody anywhere — and the LAB 8 'gates-bite' check will not let a decorative
    // chokepoint ship. They sail and they can bite you in a chaotic season; they
    // become real gates when the board grows the interior nodes (Great Lakes, the
    // Black Sea littoral) that would make them load-bearing. See CORE-016.
    { code: 'BOSPHORUS', kind: 'ocean', name: 'The Turkish Straits', at: [0.170, 0.288] },
    { code: 'DANISH',    kind: 'ocean', name: 'The Danish Straits',  at: [0.146, 0.192] },
    { code: 'INDIAN',    kind: 'ocean', name: 'The Indian Ocean',   at: [0.262, 0.500] },
    { code: 'PACIFIC',   kind: 'ocean', name: 'The Pacific',        at: [0.520, 0.430] },

    // -- CAPES: the long ways round. Slow, unclosable, and hungry in a bad season. --
    { code: 'GOODHOPE', kind: 'cape', name: 'The Cape of Good Hope', at: [0.158, 0.640] },
    { code: 'HORN',     kind: 'cape', name: 'Cape Horn',            at: [0.762, 0.762] },
    // ANTARCTICA. The Southern Ocean was an EDGE labelled 'the Southern Ocean', running Good Hope
    // straight to Cape Horn — but this board's rule is that risk lives in the PLACE you sail
    // through, not the edge. So the roughest water on earth was the one stretch that could carry
    // no peril at all. It is a place now, and the two capes reach each other THROUGH it. Like a
    // cape it can never be shut (nobody closes the Southern Ocean); like the Arctic it is where
    // a CHAOTIC season takes cargo.
    { code: 'SOUTHERN', kind: 'cape', name: 'The Southern Ocean', at: [0.470, 0.745],
      note: 'the Roaring Forties — the only water that circles the world unbroken' },

    // -- ARCTIC: iced shut until somebody develops the north. --
    { code: 'NSR', kind: 'arctic', name: 'The Northern Sea Route', at: [0.330, 0.072] },
    { code: 'NWP', kind: 'arctic', name: 'The Northwest Passage',  at: [0.636, 0.080] },

    // ---------------------------------------------------------------------------
    // ONSHORE — the ground the industry stands on. A CLASS THE MAP WAS MISSING.
    //
    // Every other flashpoint here is a CHOKEPOINT: Hormuz, Suez, Malacca — places where
    // the CARGO is at risk. The designer named "genesee county michigan", which is not
    // that at all. Nothing ships through it. What is at risk on an onshore place is the
    // people living on top of the industry.
    //
    // That is the distinction worth building, and it is the game's own thesis: the sea
    // takes cargo, the land takes everyone else. A chokepoint heats when somebody shuts
    // it; an onshore place heats IN PROPORTION TO THE BARRELS YOU RUN THROUGH IT —
    // producing is the thing that poisons it — and you cannot route around the place you
    // produce in. See docs/THE-CONTROL-LAYER.md §4.
    //
    // NAMING IS A DESIGNER CALL, NOT MINE (§4 of that doc). These are real places and
    // real people. Genesee County is carried verbatim because Joe named it; the others
    // use the REGIONAL naming the rest of this map already uses ("The Gulf", "The
    // Orinoco" — not company towns). Do not expand this into a roster of named towns
    // without that call being made deliberately.
    //
    // DATA ONLY at this stage: kind 'onshore' exists, carries no rules yet, and is not a
    // gate. Wiring production->heat is step 3 of the build order, gated on the
    // annihilation rate staying in band.
    // ---------------------------------------------------------------------------
    { code: 'GENESEE',  kind: 'onshore', name: 'Genesee County', at: [0.730, 0.286],
      note: "a company county, and what austerity did to its water — the designer's example" },
    { code: 'REFINERY_ROW', kind: 'onshore', name: 'The Refinery Coast', at: [0.704, 0.392],
      note: 'the petrochemical corridor along the Gulf — fence-line country' },
    { code: 'THE_DELTA', kind: 'onshore', name: 'The Delta', at: [0.146, 0.470],
      note: 'spills, flaring, and what was done to the people who objected' },

    // -- BUILT: the megastructures that redraw shipping (expansion). --
    { code: 'SEACITY', kind: 'built', name: 'Sea City', at: [0.505, 0.520],
      requires: 'SEA_CITY', note: 'a floating civilisation in the middle of the Pacific' },
    // THE ANTARCTIC STATION — Arctic Development's southern twin. The ice at BOTH ends is hard
    // reserve; developing the south raises a place on the Antarctic coast, and a lee shore in the
    // Forties shortens the Southern Ocean for whoever paid for it.
    { code: 'ANTARCTIC_BASE', kind: 'built', name: 'The Antarctic Station', at: [0.330, 0.805],
      requires: 'ANTARCTIC_DEV', note: 'hard reserve under the ice — and shelter in the Forties' },
    // THE SPACE ELEVATOR stands on the EQUATOR. That is not flavour, it is the engineering
    // constraint — which is why the tether lands mid-Pacific and not at anybody's HQ.
    { code: 'ELEVATOR', kind: 'built', name: 'The Space Elevator', at: [0.505, 0.452],
      requires: 'SPACE_ELEVATOR', note: 'equatorial tether — the map stops applying to whoever holds it' },
  ];

  // ============================================================================
  // THE ROUTES. [a, b, cost, label]. Cost = movement steps to cross.
  // The RISK is carried by the PLACES a route runs through, not by the edge —
  // so "the long way round Africa" is long because it is many places, and
  // dangerous because one of them is the Cape.
  // ============================================================================
  const ROUTES = [
    // ---- Europe & the Atlantic ----
    ['MILECASTLE', 'DANISH',    1, 'the Baltic approach'],
    ['DANISH',     'MINA',      2, 'the Baltic'],
    ['MILECASTLE', 'MINA',      3, 'Druzhba (overland)'],
    ['MILECASTLE', 'GIBRALTAR', 1, 'the Western Approaches'],
    ['MILECASTLE', 'NATLANTIC', 1, 'the North Atlantic run'],
    ['NATLANTIC',  'LAWRENCE',  1, 'the Grand Banks'],
    ['GIBRALTAR',  'SUEZ',      1, 'the Mediterranean'],
    ['GIBRALTAR',  'BOSPHORUS', 1, 'the Aegean'],
    ['GIBRALTAR',  'GOODHOPE',  3, 'the West Africa run'],
    ['BOSPHORUS',  'MINA',      1, 'the Black Sea'],

    // ---- the Gulf, the Red Sea, and the way east ----
    ['SUEZ',    'BAB',     1, 'the Red Sea'],
    ['BAB',     'INDIAN',  1, 'the Gulf of Aden'],
    ['HORMUZ',  'INDIAN',  1, 'the Arabian Sea'],
    ['HADDAD',  'HORMUZ',  1, 'out of the Gulf'],
    ['INDIAN',  'MALACCA', 1, 'the Bay of Bengal'],
    ['INDIAN',  'GOODHOPE',3, 'the southern Indian Ocean'],
    ['MALACCA', 'BRIGHT',  1, 'the South China Sea'],

    // ---- overland: the pipelines ----
    ['MINA',   'NIKOYL', 2, 'the near abroad'],
    ['NIKOYL', 'HADDAD', 3, 'the Caspian line'],
    ['NIKOYL', 'BRIGHT', 4, 'the Central Asia line'],
    ['MINA',   'BRIGHT', 4, 'the Siberian line'],

    // ---- the Americas ----
    ['STOCK',     'HARTSTARR', 2, 'the domestic system'],
    ['STOCK',     'LAWRENCE',  1, 'the Seaway'],   // the Northeast's only water gate
    ['HARTSTARR', 'PETRO_SUR', 1, 'the Caribbean run'],
    ['HARTSTARR', 'PANAMA',    1, 'the Gulf approach'],
    ['PETRO_SUR', 'PANAMA',    1, 'the Colón approach'],
    ['PETRO_SUR', 'GOODHOPE',  3, 'the South Atlantic haul'],
    ['PETRO_SUR', 'HORN',      3, 'the Brazil run'],

    // ---- the Pacific ----
    ['PANAMA',  'PACIFIC', 1, 'out of Balboa'],
    ['HORN',    'PACIFIC', 3, 'the Chile run'],
    ['PACIFIC', 'BRIGHT',  2, 'the Pacific crossing'],
    ['GOODHOPE','SOUTHERN', 2, 'into the Forties'],
    ['SOUTHERN', 'HORN',    2, 'the Drake Passage approach'],
    ['SOUTHERN', 'INDIAN',  3, 'the southern Indian Ocean run'],
    ['SOUTHERN', 'PACIFIC', 3, 'the South Pacific'],

    // ---- the far south: raised only if somebody develops Antarctica ----
    ['SOUTHERN', 'ANTARCTIC_BASE', 1, 'the ice approach'],
    ['ANTARCTIC_BASE', 'HORN',     1, 'the Weddell run'],
    ['ANTARCTIC_BASE', 'GOODHOPE', 2, 'the Enderby run'],

    // ---- onshore: the ground, reached from the HQ that works it ----
    ['STOCK',     'GENESEE',      1, 'the Great Lakes line'],
    ['HARTSTARR', 'REFINERY_ROW', 1, 'the fence line'],
    ['GIBRALTAR', 'THE_DELTA',    2, 'the West Africa coast'],
    ['THE_DELTA', 'GOODHOPE',     2, 'the Gulf of Guinea run'],

    // ---- the equatorial tether ----
    ['PACIFIC',  'ELEVATOR', 1, 'the tether approach'],

    // ---- the north (iced shut until developed) ----
    ['MINA',     'NSR', 1, 'the Kara Sea'],
    ['NSR',      'BRIGHT', 2, 'the Bering approach'],
    ['NSR',      'NWP', 2, 'the polar transit'],
    ['NWP',      'LAWRENCE', 2, 'the Labrador run'],

    // ---- Sea City: exists only once built. It changes shipping. ----
    ['PACIFIC', 'SEACITY', 1, 'the Sea City approach'],
    ['SEACITY', 'BRIGHT',  1, 'the Sea City–Mainland line'],
    ['SEACITY', 'HARTSTARR', 2, 'the Sea City–Gulf Coast line'],
  ];

  // ============================================================================
  // MEGASTRUCTURES that touch the map (docs/EXPANSION-NOTES.md — all CONCEPT).
  // These are the "structures worked for late-game scenarios": they don't just
  // score, they REDRAW THE WORLD.
  // ============================================================================
  const STRUCTURES = {
    ARCTIC_DEV: {
      name: 'Arctic Development',
      effect: 'opens the Northern Sea Route and the Northwest Passage — permanently',
      note: 'unlock hard reserves; high reward / high enviro-political risk',
      opens: ['NSR', 'NWP'],
    },
    SEA_CITY: {
      name: 'Sea City',
      effect: 'raises a new place in the middle of the Pacific and the lanes to it',
      note: 'floating civilisation; new strategic locations, changes shipping',
      raises: ['SEACITY'],
    },
    // ANTARCTIC DEVELOPMENT — THE DESPERATION PLAY.
    // Designer, 2026-09-24: "antarctica I believe is a potential but risky to the world
    // enterprise, but can be a way to compete if one is desperate but it is costly and
    // mortgages or turns off part of the board" — clarified moments later: "for that player's
    // company that is."
    //
    // That clarification is the whole mechanic, so it is worth stating plainly: the board it
    // turns off is YOUR OWN. Not the commons, not the dealer's choice — the developing player
    // mortgages their own operation to reach the ice. The RISK is to the world (this is a
    // global-heat enterprise and everybody lives with the weather); the COST is private.
    //
    // That is what separates it from Arctic Development. Arctic Development is an investment:
    // you pay cash, the world gets bigger, you are ahead. Antarctic Development is what you
    // reach for when you are LOSING — it buys reach you cannot otherwise afford by shutting
    // down part of the company that is buying it. You come back into the game smaller.
    //
    // WHEN it arrives changes WHO pays. Designer, same session: "perhaps late game stage as the
    // game is at a high risk of catastrophe ending the game do the other players suffer but this
    // is one of those things that can exacerbate a bad turn into a domino."
    //
    // So the cost is not fixed, it is CONDITIONAL on the state of the world, and that is the
    // elegant part:
    //   · EARLY / a cool world — the bill is entirely private. You mortgage your own company for
    //     reach, everyone else just watches you do something desperate.
    //   · LATE / a world already near catastrophe — the same act lands on EVERYBODY. It is not a
    //     separate penalty bolted on; it is the ordinary global-heat effect arriving on a board
    //     that can no longer absorb it.
    //
    // Which makes it a CASCADE AMPLIFIER rather than a cost: it does not usually end the game,
    // it makes a bad turn unsurvivable. That is the domino. It also means the temptation is
    // worst exactly when the consequence is worst — you reach for it when you are losing, and
    // you are usually losing late.
    //
    // This rides the crisis system that already exists (global heat, flashpoints, blowouts, fire
    // accelerating the collapse, ANNIHILATION at ~9% of endings) — it should add NO new kind of
    // decision, per LAB 11's one-page budget. It is a multiplier on heat already modelled.
    //
    // SHAPE ONLY — the numbers are the designer's (House Rule 5: this build does not invent
    // canon). Marked CONCEPT so nothing downstream treats these as settled.
    ANTARCTIC_DEV: {
      name: 'Antarctic Development',
      status: 'CONCEPT',
      effect: 'raises a station on the Antarctic coast and shortens the Southern Ocean',
      note: 'the desperation play — reach you buy by mortgaging the board',
      raises: ['ANTARCTIC_BASE'],
      // --- what makes it a last resort rather than an upgrade ---
      desperation: true,        // reachable mainly when you are behind — it is a comeback, not a lead
      costly: true,             // the priciest structure on the board
      worldRisk: 'high',        // RISK is shared: a global-heat enterprise, everybody lives with the weather
      costScope: 'self',        // the DIRECT cost is private — the developer's own company pays
      mortgages: 'own',         // ...by mortgaging its own operation, not the commons
      lateGame: true,           // it belongs to the end of the game, when catastrophe is already near
      cascade: true,            // and there it is a DOMINO: it turns a bad turn into an unsurvivable one
      // The shared damage scales with how hot the world ALREADY is. On a cool board this is one
      // company's private disaster; on a board near annihilation it is everyone's. Same act.
      sharedHarmScalesWithHeat: true,
      // Candidate prices, deliberately UNSET pending the designer's ruling — but all of them are
      // paid by the DEVELOPER, which is the part that is settled:
      //   · SHUT one of your OWN places/regions for the rest of the game ("turns off part of
      //     the board" — yours)
      //   · or MORTGAGE your HQ: it keeps producing but stops paying you
      //   · or forfeit your income for N turns to fund the station
      // The gate to write is the same whichever is chosen: a structure that makes the owner
      // REACH further while making the owner SMALLER — and warms the world for everyone.
      shuts: null,              // -> a place code owned by the developer
      mortgageTarget: null,     // -> 'HQ' | a region | null
    },
    SPACE_ELEVATOR: {
      name: 'Space Elevator',
      effect: 'deliver without a route at all — the map stops applying to you',
      note: 'transition from oil economy to post-oil infrastructure',
      bypass: true,
      raises: ['ELEVATOR'],
    },
  };

  // ---- indexes ---------------------------------------------------------------
  const BY = {}; PLACES.forEach(p => { BY[p.code] = p; });
  const CODES = PLACES.map(p => p.code);
  const HQS = PLACES.filter(p => p.kind === 'hq').map(p => p.code);
  const GATES = PLACES.filter(p => p.kind === 'gate').map(p => p.code);
  // two companies' codes are not their HQ's place code (MC sails from MILECASTLE, NIK from
  // NIKOYL), so every `place.code === faction` test misses them. Read ONLY by THE PATH's `home`
  // rule (OilGame.hqOf); the baseline keeps comparing raw codes, so its numbers don't move.
  const FACTION_HQ = { MC: 'MILECASTLE', NIK: 'NIKOYL' };

  const ADJ = {}; CODES.forEach(c => { ADJ[c] = []; });
  ROUTES.forEach((R, id) => {
    if (!BY[R[0]] || !BY[R[1]]) throw new Error('OIL_MAP: route to unknown place ' + R);
    ADJ[R[0]].push({ to: R[1], cost: R[2], label: R[3], id });
    ADJ[R[1]].push({ to: R[0], cost: R[2], label: R[3], id });
  });

  // ---- state helpers ---------------------------------------------------------
  // state = { closed:{GATE:turns}, disabled:{routeId:turns}, built:{STRUCT:true} }
  function placeOpen(code, state) {
    state = state || {};
    const p = BY[code]; if (!p) return false;
    if (p.kind === 'gate') return !(state.closed && state.closed[code] > 0);
    if (p.kind === 'arctic') return !!(state.built && state.built.ARCTIC_DEV);
    if (p.kind === 'built') return !!(state.built && state.built[p.requires]);
    return true;
  }
  function routeOpen(route, from, state) {
    state = state || {};
    if (state.disabled && state.disabled[route.id] > 0) return false;
    return placeOpen(route.to, state) && placeOpen(from, state);
  }
  // routes out of a place, split open/blocked (the delivery squeeze reads this)
  function trafficAt(code, state) {
    const all = ADJ[code] || [];
    const open = all.filter(r => routeOpen(r, code, state));
    return { open: open.length, blocked: all.length - open.length, total: all.length, routes: all };
  }
  // Dijkstra over route COST — every place reachable within `steps`, with its path.
  function reach(from, steps, state) {
    const dist = { [from]: 0 }, prev = { [from]: null };
    const q = [[0, from]];
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, cur] = q.shift();
      if (d > (dist[cur] !== undefined ? dist[cur] : Infinity)) continue;
      for (const r of ADJ[cur]) {
        if (!routeOpen(r, cur, state)) continue;
        const nd = d + r.cost;
        if (nd <= steps && (dist[r.to] === undefined || nd < dist[r.to])) {
          dist[r.to] = nd; prev[r.to] = cur; q.push([nd, r.to]);
        }
      }
    }
    return { dist, prev, places: Object.keys(dist) };
  }
  function pathOf(reachResult, to) {
    if (reachResult.dist[to] === undefined) return [];
    const p = []; let c = to;
    while (c !== null && c !== undefined) { p.unshift(c); c = reachResult.prev[c]; }
    return p;
  }
  // is every place that SHOULD be usable still connected? (LAB 8's stranding proof)
  function connected(state) {
    const live = CODES.filter(c => placeOpen(c, state));
    if (!live.length) return false;
    const seen = { [live[0]]: 1 }, q = [live[0]];
    while (q.length) {
      const cur = q.shift();
      for (const r of ADJ[cur]) { if (routeOpen(r, cur, state) && !seen[r.to]) { seen[r.to] = 1; q.push(r.to); } }
    }
    return live.every(c => seen[c]);
  }
  // the HQs must ALWAYS be able to reach each other, whatever is shut.
  function hqsConnected(state) {
    const seen = { [HQS[0]]: 1 }, q = [HQS[0]];
    while (q.length) {
      const cur = q.shift();
      for (const r of ADJ[cur]) { if (routeOpen(r, cur, state) && !seen[r.to]) { seen[r.to] = 1; q.push(r.to); } }
    }
    return HQS.every(c => seen[c]);
  }

  // how far does this roll carry you? A THIRD read of the SAME three bodies.
  function stepsFor(dice, dials) {
    const D = Object.assign({}, MAP_DIALS, dials || {});
    const s = dice.slice().sort((a, b) => a - b);
    let n;
    if (D.MOVE_READ === 'median') n = s[1];
    else if (D.MOVE_READ === 'fixed') n = D.MOVE_FIXED;
    else n = s[s.length - 1] - s[0];              // 'spread' (default)
    return Math.max(D.MOVE_MIN, Math.min(D.MOVE_MAX, n));
  }
  // what the sea does to you for entering this place in this era
  function perilOf(code, era, dials) {
    const D = Object.assign({}, MAP_DIALS, dials || {});
    if (era !== 'CHAOTIC') return 0;
    const p = BY[code]; if (!p) return 0;
    return D.PERIL[p.kind] || 0;
  }

  const REG = { MAP_DIALS, PLACES, ROUTES, STRUCTURES, BY, CODES, HQS, GATES, ADJ, FACTION_HQ,
    placeOpen, routeOpen, trafficAt, reach, pathOf, connected, hqsConnected, stepsFor, perilOf };
  global.OIL_MAP = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
