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

    // --- DECISIONS-0928 (docs/DECISIONS-0928.md). MODEL-ONLY dials for Joe's open calls. Every
    // one is read ONLY behind a new opts.path rule key (shut / supply / geo / botOnshore) or a
    // dial the presets do not set, so `path`, `quiet` and the baseline are byte-identical. ---
    HEADLINE_TURNS: 3,      // CORE-020 'headline': the round's flashpoint shuts a gate for this long
    LIFT_TO: 2,             // CORE-022 'lift': starting a turn in your own yard tops the hold up to this
    SUPPLY_BURN: 1,         // CORE-022: oil burned per barrel any supply rule creates (L2: never adds oil)
    CONTRACT_LOAD: 1,       // CORE-022 'cargo': barrels loaded (the backhaul) when you land a contract
    PRODUCE_CAP: 3,         // CORE-022 'produce': per-round production cap (yard 1 + 1 per held place)
    CONSIGN_BUILD: 0,       // CORE-018 middle: build credit per landed contract (spends on BUILD, never scores)
    SPREAD_EVERY: 0,        // CORE-020 cap (with `spreadRound`): 0 = once a round; N = every Nth seat-turn
    CONSIGN_POINTS_EVERY: 1,// CORE-018 middle: CONSIGN_POINTS is paid on every Nth contract a seat lands
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
    { code: 'MILECASTLE', kind: 'hq', name: 'The North Sea',   region: 'UK / Europe',                          at: [0.125, 0.215], ll: [57.15, -2.09], full: 'ABERDEEN, SCOTLAND, UK' },
    { code: 'MINA',       kind: 'hq', name: 'The Volga',       region: 'Post-Soviet — Russian state sphere',   at: [0.205, 0.185], ll: [55.76, 37.62], full: 'MOSCOW, RUSSIA' },
    { code: 'NIKOYL',     kind: 'hq', name: 'The Caspian',     region: 'Post-Soviet — private/oligarch sphere', at: [0.240, 0.268], ll: [47.10, 51.90], full: 'ATYRAU, KAZAKHSTAN' },
    { code: 'HADDAD',     kind: 'hq', name: 'The Gulf',        region: 'Middle East — Gulf',                   at: [0.205, 0.360], ll: [26.29, 50.11], full: 'DHAHRAN, SAUDI ARABIA' },
    { code: 'BRIGHT',     kind: 'hq', name: 'The Mainland',    region: 'China',                                at: [0.330, 0.325], ll: [39.90, 116.40], full: 'BEIJING, CHINA' },
    { code: 'HARTSTARR',  kind: 'hq', name: 'The Gulf Coast',  region: 'USA — South / heartland',              at: [0.699, 0.325], ll: [29.76, -95.37], full: 'HOUSTON, TEXAS, USA' },
    { code: 'STOCK',      kind: 'hq', name: 'The Northeast',   region: 'USA — Northeast / Wall Street',        at: [0.745, 0.305], ll: [40.71, -74.00], full: 'NEW YORK, NEW YORK, USA' },
    { code: 'PETRO_SUR',  kind: 'hq', name: 'The Orinoco',     region: 'South America — Venezuela',            at: [0.792, 0.452], ll: [10.48, -66.90], full: 'CARACAS, VENEZUELA' },

    // -- GATES: the canals and straits. Every one of these can be shut. --
    { code: 'HORMUZ',   kind: 'gate', name: 'Strait of Hormuz',  at: [0.228, 0.378] },
    { code: 'SUEZ',     kind: 'gate', name: 'Suez Canal',        at: [0.176, 0.345] },
    { code: 'BAB',      kind: 'gate', name: 'Bab el-Mandeb',     at: [0.196, 0.412] },
    { code: 'MALACCA',  kind: 'gate', name: 'Strait of Malacca', at: [0.306, 0.428] },
    { code: 'PANAMA',   kind: 'gate', name: 'Panama Canal',      at: [0.746, 0.418] },
    { code: 'GIBRALTAR',kind: 'gate', name: 'Strait of Gibraltar', at: [0.108, 0.298] },

    { code: 'LAWRENCE', kind: 'gate', name: 'The St Lawrence Seaway', at: [0.766, 0.265] },

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
    { code: 'PACIFIC',   kind: 'ocean', name: 'The Pacific',        at: [0.535, 0.395] },

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
    // NAMING — DECIDED 2026-11-17 (Joe): "write out Genesee County, Michigan USA for that location. be
    // specific" + "HQ spots … a city/state/country or at least a city and country". So every HQ, port and
    // onshore place now carries a `full` LOCATION ("GENESEE COUNTY, MICHIGAN, USA") that the gateway shows
    // on the map, in the log and in tooltips. `name` is untouched on purpose: the engine writes it into
    // the event stream, so renaming it would move the golden fingerprint for a display change. The HQ
    // cities other than Genesee are a first read from each faction's region (Q1190 in QUESTIONS-MASTER).
    // (Superseded:) NAMING IS A DESIGNER CALL, NOT MINE (§4 of that doc). These are real places and
    // real people. Genesee County is carried verbatim because Joe named it; the others
    // use the REGIONAL naming the rest of this map already uses ("The Gulf", "The
    // Orinoco" — not company towns). Do not expand this into a roster of named towns
    // without that call being made deliberately.
    //
    // DATA ONLY at this stage: kind 'onshore' exists, carries no rules yet, and is not a
    // gate. Wiring production->heat is step 3 of the build order, gated on the
    // annihilation rate staying in band.
    // ---------------------------------------------------------------------------
    { code: 'GENESEE',  kind: 'onshore', name: 'Genesee County', at: [0.723, 0.288], ll: [43.02, -83.69], full: 'GENESEE COUNTY, MICHIGAN, USA',
      note: "a company county, and what austerity did to its water — the designer's example" },
    { code: 'REFINERY_ROW', kind: 'onshore', name: 'The Refinery Coast', at: [0.729, 0.349], ll: [29.90, -93.93], full: 'PORT ARTHUR, TEXAS, USA',
      note: 'the petrochemical corridor along the Gulf — fence-line country' },
    { code: 'THE_DELTA', kind: 'onshore', name: 'The Delta', at: [0.146, 0.470], ll: [4.85, 6.20], full: 'NIGER DELTA, NIGERIA',
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
  // OPTIONAL ROUTES (docs/DECISIONS-0928.md, the Caspian question). NOT in ROUTES — the board art,
  // the route count and every static check stay as they were. Each exists only in a game whose
  // mapState.opts names it (THE PATH `geo` rule); everywhere else routeOpen() says no and
  // trafficAt() does not see it, so it cannot even count as a blocked route.
  //   BTC — the Baku–Tbilisi–Ceyhan line: the Caspian's real pipe out to the Mediterranean.
  const OPTIONAL_ROUTES = { BTC: ['NIKOYL', 'BOSPHORUS', 2, 'the BTC line (Baku–Ceyhan)'] };
  Object.keys(OPTIONAL_ROUTES).forEach(k => {
    const R = OPTIONAL_ROUTES[k], id = 'OPT_' + k;
    ADJ[R[0]].push({ to: R[1], cost: R[2], label: R[3], id, opt: k });
    ADJ[R[1]].push({ to: R[0], cost: R[2], label: R[3], id, opt: k });
  });
  // WEST COAST REACH (docs/DECISIONS-1110.md; Joe 2026-10-25: "the port of los angeles or alaska and then siberia
  // need some control or flash points … I imagine japan and australia might dictate some oil need"). MODEL ONLY.
  // Like BTC these places are NOT in PLACES/CODES/ROUTES: the board art, the counts and every baseline loop never
  // see them. A place exists only in a game whose mapState.opts names its set (THE PATH `west` rule):
  //   W_RIM    — THE RIM: Los Angeles, Valdez (Alaska), Vladivostok (Siberia). Ports you can sell at and HOLD (the
  //              station meter, like any buyer), and FLASHPOINTS: a chaotic season leans on them like a strait,
  //              and a hot one shuts (and its shut bleeds heat into the yard next door).
  //   W_DEMAND — THE PACIFIC BUYS: Japan and Australia, two buyers with no company of their own — contracts
  //              get dealt out there, so a cargo has a reason to cross the Pacific.
  // kind 'port' (a kind no baseline place has): placeOpen says no unless the set is on, or while it is shut.
  const OPTIONAL_PLACES = [
    { code: 'LA',        kind: 'port', set: 'W_RIM', flash: true, name: 'The Port of Los Angeles', at: [0.625, 0.335], ll: [33.74, -118.27], full: 'LOS ANGELES, CALIFORNIA, USA' },
    { code: 'ALASKA',    kind: 'port', set: 'W_RIM', flash: true, name: 'Valdez (Alaska)',         at: [0.585, 0.170], ll: [61.13, -146.35], full: 'VALDEZ, ALASKA, USA' },
    { code: 'SIBERIA',   kind: 'port', set: 'W_RIM', flash: true, name: 'Vladivostok (Siberia)',   at: [0.395, 0.205], ll: [43.12, 131.89], full: 'VLADIVOSTOK, RUSSIA' },
    { code: 'JAPAN',     kind: 'port', set: 'W_DEMAND', name: 'Tokyo Bay (Japan)',                 at: [0.405, 0.290], ll: [35.68, 139.77], full: 'TOKYO, JAPAN' },
    { code: 'AUSTRALIA', kind: 'port', set: 'W_DEMAND', name: 'Port Hedland (Australia)',          at: [0.400, 0.640], ll: [-20.31, 118.58], full: 'PORT HEDLAND, WESTERN AUSTRALIA, AUSTRALIA' },
    // THE SUPER-RIG (1117; Joe: "a major oil rig drilling spot that any company can try to control"). OFF by default:
    // it exists only in a game with opts.rig (gateway HOUSE RULES chip 'THE SUPER-RIG'). It is a 'port' so it rides
    // the machinery the WEST COAST ports already proved: a buyer you can sell at, HOLD on the station meter (the
    // ordinary control rule — nobody owns it at the start) and take the PATH toll on. It is NOT a season
    // flashpoint (flash:false): the first batch had chaotic seasons heating it like a strait, and the shut rig
    // bled heat into the Orinoco — fire endings +6..+15 pts at every table. Its heat comes from DRILLING only.
    // What only the rig does is DRILL (engine _drillAtRig, RIG_DIALS below). docs/THE-SUPER-RIG.md.
    // Placed on the Brazilian pre-salt (Santos Basin) — the world's biggest offshore drilling play, and in
    // nobody's yard: no company in the game is Brazilian, so every seat has to sail to it.
    { code: 'RIG', kind: 'port', set: 'RIG', flash: false, rig: true, name: 'The Pre-Salt Super-Rig', at: [0.826, 0.590],
      ll: [-25.40, -42.80], full: 'SANTOS BASIN, OFF RIO DE JANEIRO, BRAZIL', note: 'the deepwater pre-salt — the biggest offshore play on earth, and nobody\'s yard' },
  ];
  // what drilling at the rig does (all CONCEPT dials; read only when opts.rig is on)
  const RIG_DIALS = {
    STICKY: true,       // the rig's station meter does not decay: a lease is held until somebody out-sells you there
    DRILL_AT: 'rig',    // 'rig' = the holder lifts only when it starts a turn ON the rig · 'anywhere' = the rig ships to its holder
    LIFT: 1,            // barrels the HOLDER of the rig lifts when it starts a turn there (each burns SUPPLY_BURN oil: L2 holds)
    LIFT_CAP: 3,        // ...only while its hold is below this
    EXPOSURE: 1,        // the cost: offshore spills are on the record — +exposure per lift
    HEAT: 1,            // and the rig heats (with CRISIS on) — a hot rig shuts like a strait, so holding it is a fight
    BOT_PULL: 24,       // bot policy: an empty holder heads back to its rig (just under a buyer's 30)
  };
  const OPTIONAL_WEST_ROUTES = [
    ['W_RIM', 'HARTSTARR', 'LA', 2, 'the Southwest line (overland)'],
    ['W_RIM', 'LA', 'PACIFIC', 1, 'out of Long Beach'],
    ['W_RIM', 'LA', 'ALASKA', 2, 'the Alaska tanker run'],
    ['W_RIM', 'ALASKA', 'PACIFIC', 2, 'the Gulf of Alaska run'],
    ['W_RIM', 'ALASKA', 'NWP', 1, 'the Beaufort coast'],
    ['W_RIM', 'ALASKA', 'SIBERIA', 2, 'the Bering Sea'],
    ['W_RIM', 'SIBERIA', 'BRIGHT', 1, 'the Sea of Japan'],
    ['W_RIM', 'SIBERIA', 'MINA', 4, 'ESPO (overland)'],
    ['W_RIM', 'SIBERIA', 'NSR', 1, 'the Bering approach (west)'],
    ['W_DEMAND', 'JAPAN', 'BRIGHT', 1, 'the East China Sea'],
    ['W_DEMAND', 'JAPAN', 'PACIFIC', 2, 'the Kuroshio run'],
    ['W_DEMAND', 'AUSTRALIA', 'MALACCA', 2, 'the Timor run'],
    ['W_DEMAND', 'AUSTRALIA', 'PACIFIC', 3, 'the Coral Sea'],
    ['W_DEMAND', 'AUSTRALIA', 'SOUTHERN', 2, 'the Great Australian Bight'],
    ['RIG', 'RIG', 'PETRO_SUR', 2, 'the Brazil coast'],
    ['RIG', 'RIG', 'GOODHOPE', 3, 'the South Atlantic (to the rig)'],
    ['RIG', 'RIG', 'HORN', 2, 'the Santos run'],
  ];

  // ============================================================================
  // THE WORLD'S PIPELINES (1117; Joe: "make sure to include all major world pipelines mapped").
  // DRAWN CONTEXT. These are polylines on the board art, NOT routes: nothing here touches ADJ, the
  // engine or the fingerprint. Where a real line is what an existing PIPE route already models, `plays`
  // names that route (so the gateway can say which ones you actually ship on); the rest are context.
  // Coordinates are a first read off the art (the board is an illustrated, Pacific-centred world, not a
  // geodetic projection) — they land on the right coasts and countries, not the right kilometre.
  //   kind: 'crude' | 'products'. `ll` = the REAL [lat, lon] of each waypoint in `pts` (`bll` for `branch`), so a
  //   re-projection (the Equal Earth board, 1117) can place them; `pts` stays the hand read on today's art.
  //   Places carry `ll` too (HQs, onshore, ports, the rig) for the same reason.
  // ============================================================================
  const WORLD_PIPELINES = [
    // ---- Russia & the Caspian -> Europe ----
    { id: 'DRUZHBA', name: 'Druzhba', what: 'Russia → Belarus → Poland/Germany (north) and Ukraine → Hungary/Slovakia (south)',
      plays: 'Druzhba (overland)', ll: [[54.90, 52.30], [52.85, 32.68], [52.05, 29.25], [52.55, 19.70], [53.06, 14.28]], bll: [[52.05, 29.25], [50.08, 25.15], [47.32, 18.91]], pts: [[0.205, 0.188], [0.184, 0.198], [0.170, 0.207], [0.156, 0.214], [0.142, 0.222]],
      branch: [[0.170, 0.207], [0.165, 0.226], [0.152, 0.244]] },
    { id: 'BPS', name: 'Baltic Pipeline System', what: 'Volga–Urals → Primorsk & Ust-Luga on the Gulf of Finland',
      ll: [[54.90, 52.30], [57.60, 39.90], [60.35, 28.60]], pts: [[0.205, 0.188], [0.188, 0.180], [0.172, 0.178]] },
    { id: 'CPC', name: 'Caspian Pipeline Consortium (CPC)', what: 'Tengiz, Kazakhstan → Novorossiysk, Black Sea',
      ll: [[46.15, 53.40], [47.10, 51.90], [45.85, 40.10], [44.72, 37.77]], pts: [[0.222, 0.254], [0.205, 0.252], [0.192, 0.262], [0.182, 0.272]] },
    { id: 'BTC', name: 'Baku–Tbilisi–Ceyhan (BTC)', what: 'Baku, Azerbaijan → Tbilisi, Georgia → Ceyhan, Turkey (Mediterranean)',
      plays: 'the BTC line (Baku–Ceyhan) — only with THE PATH geo rule', ll: [[40.40, 49.87], [41.70, 44.80], [39.90, 41.30], [36.88, 35.93]], pts: [[0.203, 0.288], [0.191, 0.281], [0.180, 0.290], [0.168, 0.304]] },
    { id: 'KAZ_CHINA', name: 'Kazakhstan–China', what: 'Atyrau → Kenkiyak → Alashankou → Dushanzi, Xinjiang',
      plays: 'the Central Asia line', ll: [[47.10, 51.90], [48.60, 57.10], [46.40, 65.30], [45.17, 82.57], [44.32, 84.85]], pts: [[0.222, 0.254], [0.240, 0.250], [0.262, 0.250], [0.282, 0.256], [0.292, 0.262]] },
    { id: 'ESPO', name: 'ESPO (East Siberia–Pacific Ocean)', what: 'Taishet → Skovorodino → Kozmino (Pacific), spur to Daqing, China',
      plays: 'the Siberian line', ll: [[55.94, 98.00], [56.79, 105.76], [53.98, 123.90], [48.48, 135.08], [42.73, 133.00]], bll: [[53.98, 123.90], [52.97, 122.54], [46.59, 125.10]], pts: [[0.292, 0.205], [0.322, 0.205], [0.352, 0.214], [0.372, 0.228], [0.386, 0.246]],
      branch: [[0.352, 0.214], [0.358, 0.236], [0.360, 0.252]] },
    // ---- the Gulf: the ways around Hormuz and Suez ----
    { id: 'KIRKUK_CEYHAN', name: 'Kirkuk–Ceyhan', what: 'Kirkuk, Iraq → Ceyhan, Turkey', ll: [[35.47, 44.39], [37.10, 42.40], [36.88, 35.93]], pts: [[0.193, 0.322], [0.182, 0.312], [0.168, 0.304]] },
    { id: 'PETROLINE', name: 'East–West Pipeline (Petroline)', what: 'Abqaiq → Yanbu, Saudi Arabia — the Red Sea way round Hormuz',
      ll: [[25.94, 49.67], [24.70, 46.70], [24.09, 38.06]], pts: [[0.213, 0.370], [0.198, 0.372], [0.184, 0.372]] },
    { id: 'HABSHAN', name: 'Habshan–Fujairah (ADCOP)', what: 'Abu Dhabi → Fujairah, UAE — past Hormuz to the Gulf of Oman',
      ll: [[23.83, 53.62], [24.50, 55.50], [25.12, 56.33]], pts: [[0.222, 0.392], [0.230, 0.393], [0.237, 0.388]] },
    { id: 'SUMED', name: 'SUMED', what: 'Ain Sukhna (Red Sea) → Sidi Kerir (Mediterranean), Egypt — the pipe beside Suez',
      ll: [[29.60, 32.35], [30.05, 31.25], [31.10, 29.65]], pts: [[0.177, 0.350], [0.169, 0.340], [0.161, 0.330]] },
    // ---- Asia ----
    { id: 'CHINA_MYANMAR', name: 'China–Myanmar', what: 'Kyaukphyu, Myanmar → Kunming, China — the way round Malacca',
      ll: [[19.43, 93.55], [21.97, 96.08], [25.04, 102.70]], pts: [[0.296, 0.378], [0.306, 0.362], [0.316, 0.350]] },
    // ---- Africa ----
    { id: 'CHAD_CAMEROON', name: 'Chad–Cameroon', what: 'Doba, Chad → Kribi, Cameroon (Gulf of Guinea)', ll: [[8.65, 16.85], [7.30, 13.60], [2.94, 9.91]], pts: [[0.172, 0.430], [0.160, 0.452], [0.150, 0.468]] },
    // ---- North America ----
    { id: 'TAPS', name: 'Trans-Alaska (TAPS)', what: 'Prudhoe Bay → Valdez, Alaska, USA', ll: [[70.25, -148.34], [64.84, -147.70], [61.13, -146.35]], pts: [[0.574, 0.156], [0.580, 0.178], [0.586, 0.198]] },
    { id: 'TRANS_MOUNTAIN', name: 'Trans Mountain', what: 'Edmonton, Alberta → Burnaby, British Columbia, Canada', ll: [[53.55, -113.49], [50.67, -120.33], [49.25, -122.98]], pts: [[0.643, 0.230], [0.633, 0.238], [0.624, 0.246]] },
    { id: 'KEYSTONE', name: 'Keystone', what: 'Hardisty, Alberta → Steele City, Nebraska → Cushing, Oklahoma → Houston & Port Arthur, Texas',
      ll: [[52.67, -111.30], [49.00, -98.00], [40.00, -96.98], [35.98, -96.77], [29.76, -95.37], [29.90, -93.93]], pts: [[0.645, 0.234], [0.664, 0.262], [0.680, 0.288], [0.690, 0.308], [0.702, 0.330], [0.722, 0.344]] },
    { id: 'ENBRIDGE', name: 'Enbridge Mainline', what: 'Edmonton, Alberta → Superior, Wisconsin → Sarnia, Ontario',
      ll: [[53.55, -113.49], [50.45, -104.60], [46.72, -92.10], [41.80, -87.70], [42.97, -82.40]], pts: [[0.643, 0.230], [0.672, 0.246], [0.703, 0.262], [0.716, 0.270], [0.727, 0.280]] },
    { id: 'LINE5', name: 'Enbridge Line 5', what: 'Superior, Wisconsin → under the Straits of Mackinac → Michigan → Sarnia, Ontario — past Genesee County, Michigan',
      plays: 'the Great Lakes line', ll: [[46.72, -92.10], [46.00, -87.50], [45.81, -84.73], [43.05, -83.32], [42.97, -82.40]], pts: [[0.703, 0.262], [0.714, 0.266], [0.720, 0.276], [0.723, 0.286], [0.728, 0.282]] },
    { id: 'DAPL', name: 'Dakota Access (DAPL)', what: 'the Bakken, North Dakota → Patoka, Illinois', ll: [[48.32, -102.39], [43.50, -96.70], [38.75, -89.10]], pts: [[0.670, 0.250], [0.688, 0.268], [0.704, 0.284]] },
    { id: 'COLONIAL', name: 'Colonial Pipeline (products)', what: 'Houston, Texas → Linden, New Jersey — the East Coast\'s fuel', kind: 'products',
      plays: 'the domestic system', ll: [[29.76, -95.37], [33.75, -84.39], [36.07, -79.79], [40.62, -74.24]], pts: [[0.702, 0.330], [0.716, 0.322], [0.730, 0.312], [0.745, 0.302]] },
  ];
  const OPT_BY_ID = {};      // optional route id -> [a, b, cost, label] (+ sub: MOMENTUM may subdivide it)
  Object.keys(OPTIONAL_ROUTES).forEach(k => { OPT_BY_ID['OPT_' + k] = OPTIONAL_ROUTES[k]; });
  OPTIONAL_PLACES.forEach(p => { BY[p.code] = p; ADJ[p.code] = []; });
  OPTIONAL_WEST_ROUTES.forEach(([set, a, b, cost, label]) => {
    const id = 'OPT_' + set + '_' + a + '_' + b, R = [a, b, cost, label]; R.sub = true; R.set = set; OPT_BY_ID[id] = R;
    ADJ[a].push({ to: b, cost, label, id, opt: set });
    ADJ[b].push({ to: a, cost, label, id, opt: set });
  });

  // ---- state helpers ---------------------------------------------------------
  // state = { closed:{GATE:turns}, disabled:{routeId:turns}, built:{STRUCT:true} }
  function placeOpen(code, state) {
    state = state || {};
    const p = BY[code]; if (!p) return false;
    if (state.forbid && state.forbid[code]) return false;   // OIL LEVELS 'two': water this seat is not licensed for
    if (p.kind === 'port') return !!(state.opts && state.opts[p.set]) && !(state.closed && state.closed[code] > 0);   // WEST COAST (model)
    if (p.kind === 'gate') return !(state.closed && state.closed[code] > 0);
    if (p.kind === 'arctic') return !!(state.built && state.built.ARCTIC_DEV);
    if (p.kind === 'built') return !!(state.built && state.built[p.requires]);
    return true;
  }
  function routeOpen(route, from, state) {
    state = state || {};
    if (route.opt && !(state.opts && state.opts[route.opt])) return false;
    if (state.disabled && state.disabled[route.id] > 0) return false;
    return placeOpen(route.to, state) && placeOpen(from, state);
  }
  // routes out of a place, split open/blocked (the delivery squeeze reads this)
  function trafficAt(code, state) {
    const all = (ADJ[code] || []).filter(r => !r.opt || (state && state.opts && state.opts[r.opt]));
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

  const REG = { MAP_DIALS, RIG_DIALS, WORLD_PIPELINES, PLACES, ROUTES, OPTIONAL_ROUTES, OPTIONAL_PLACES, OPT_BY_ID, STRUCTURES, BY, CODES, HQS, GATES, ADJ, FACTION_HQ,
    placeOpen, routeOpen, trafficAt, reach, pathOf, connected, hqsConnected, stepsFor, perilOf };
  global.OIL_MAP = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
