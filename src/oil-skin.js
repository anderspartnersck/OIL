/* OiL! SKIN LAYER — identity over the ER$N engine substrate.
   ----------------------------------------------------------------------------
   The ER$N engine (src/engine.js) and its card/character data (src/data.js) run
   UNCHANGED so their balance-tested rules stay byte-faithful (Charter E1/E2).
   This file is the ONLY place OiL! identity touches the running game, and it
   touches it the safe way:

     * The engine keys behavior on character .name (e.g. `p.name === 'Mark Markit'`),
       so we NEVER rename a character — names stay the engine's. We override only
       display-safe fields (.color, .role) and supply a DISPLAY name the UI shows.
     * Decks/meters/locations are relabeled to OiL!'s charter grammar (G6/G1) for
       display only; the engine still draws 'SEC'/'Asset'/'Market' internally.

   Nothing here invents OiL! canon. Faction→character pairing is arbitrary
   (faction powers = toolkit stub CORE-014 = None); the ER$N ability on each seat
   is the SUBSTRATE engine for that faction, clearly flagged. Dice identity is the
   only certified OiL! gameplay fact carried in (see docs + [[oil-dice-canon]]). */
(function (global) {
  'use strict';

  // Per-faction pawn colours. Pawns reuse the BW PAWN.png master (tinted at runtime
  // in index.html), so a faction "skin" is just a distinct hex. 8 total: 6 core that
  // seat onto the 6 engine characters, + 2 expansion roster factions (no engine seat
  // yet — the ER$N substrate has exactly 6 character slots).
  const FACTION_COLORS = {
    HARTSTARR: '#e0a32a', // Texas gold star
    STOCK:     '#c0512b', // Standard-Oil torch rust-red
    MC:        '#2f6fb0', // British motorway royal blue
    BRIGHT:    '#d6342f', // China neon red
    MINA:      '#7e8a4a', // Soviet steppe olive
    NIK:       '#8a7c92', // oligarch grey-violet
    PETRO_SUR: '#e2632a', // Venezuela petro-nationalist orange-red (EXPANSION; brand = red)
    HADDAD:    '#1f8f8f', // Gulf teal for table-distinctness (EXPANSION; brand = gold-on-black)
  };

  // engine character name  ->  OiL! CORE faction (index-aligned, documented).
  const PAIRING = [
    { engine: 'Wu Drainer',      code: 'HARTSTARR' },
    { engine: 'Vonda Vouch',     code: 'STOCK'     },
    { engine: 'Mark Markit',     code: 'MC'        },
    { engine: 'Danny Dough',     code: 'BRIGHT'    },
    { engine: 'Claudia Numbers', code: 'MINA'      },
    { engine: 'Benny Boye',      code: 'NIK'       },
  ].map(p => ({ ...p, color: FACTION_COLORS[p.code] }));

  function factionByCode(code) {
    const list = (global.OIL && global.OIL.FACTIONS) || [];
    return list.find(f => f.code === code) || null;
  }

  // engine-name -> {code, brand, color, region}
  const BY_ENGINE = {};
  for (const p of PAIRING) {
    const f = factionByCode(p.code);
    BY_ENGINE[p.engine] = {
      code: p.code,
      color: p.color,
      brand: f ? f.brand : p.code,
      region: f ? f.region : '',
      design_read: f ? f.design_read : '',
    };
  }

  // Display-name helper the UI calls instead of reading p.name directly.
  function dn(pOrName) {
    const name = (pOrName && pOrName.name) ? pOrName.name : pOrName;
    const f = BY_ENGINE[name];
    return f ? f.brand : name;
  }
  function factionFor(pOrName) {
    const name = (pOrName && pOrName.name) ? pOrName.name : pOrName;
    return BY_ENGINE[name] || null;
  }

  // Apply display-safe overrides to the shared CHARACTERS table BEFORE a Game is
  // built. Colour + role are decoration the engine never branches on; .name is
  // left untouched so engine logic keyed on it still fires.
  function applyToCharacters() {
    const chars = global.CHARACTERS || [];
    for (const cd of chars) {
      const f = BY_ENGINE[cd.name];
      if (!f) continue;
      cd.color = f.color;
      cd.faction = f;                 // stash for the UI
      cd.role = f.region || cd.role;  // seat sub-label = faction region
    }
    return chars;
  }

  // ---- charter-grammar relabels (display only; engine vocabulary unchanged) ---
  // G6: 3 decks = Assets / Signature force / Institutional Oversight.
  //     ER$N  Asset / Market / SEC   ->   OiL!  DEEDS / FREEDOM-MARKET / COMPETITION
  // G1: two-phase arc; OiL! collapse phase is the E.D.D. PROTOCOL.
  const LABELS = {
    title:        'OiL!',
    subtitle:     'THE HOME GAME',
    railTag:      'PREDATORY CAPITALISM FOR THE WHOLE FAMILY',
    'GLOBAL SEC': 'GLOBAL CRISIS',     // the visible collapse-pressure clock
    'SHADOW SEC': 'SHADOW MARKET',     // the hidden layer (Green-Anders register)
    Asset:        'DEEDS',
    Market:       'FREEDOM-MARKET',
    SEC:          'COMPETITION',
    lounge:       'THE CARTEL SUITE',  // ER$N Executive Lounge skin (substrate win-spot)
    collapse:     'E.D.D. PROTOCOL ENGAGED',
  };

  // Certified dice identity (see [[oil-dice-canon]]). Display-only; NOT wired to
  // any roll resolution (that is toolkit stub CORE-002, unresolved).
  const DICE = {
    core: [
      { name: 'Red Die',   color: '#c0392b', locked: true,
        reading: 'external pressure — war / sanctions / panic / disruption',
        reading_confidence: 'CONCEPT (~80%, not certified)' },
      { name: 'Black Die', color: '#1c1c1c', locked: true,
        reading: 'system response — price movement / shortages / consequences',
        reading_confidence: 'CONCEPT (~80%, not certified)' },
    ],
    expansion: [
      { name: 'Green Anders Die', color: '#2f8f5b', locked: true,
        reading: 'the wildcard — intervention / corruption / opportunity / IWS / unexpected outcomes',
        reading_confidence: 'CONCEPT (~80%, not certified)' },
    ],
    open: 'Count discrepancy: toolkit data.py records 3 core / 4 expansion dice ' +
          '(designer-confirmed 2026-06-06); thread-recovery has Red+Black core + ' +
          'Green expansion. Unresolved — surfaced, not guessed (stub CORE-002).',
  };

  // Expansion megastructures (CONCEPT brainstorm — see docs/EXPANSION-NOTES.md).
  const MEGASTRUCTURES = [
    'Franchise', 'Fusion Plant', 'Arctic Development', 'Antarctic Development',
    'Sea City', 'Space Elevator', 'Moon Base',
    'International Well Service (IWS) — "Box & Scooter Well Intervention"',
  ];

  global.OILSKIN = {
    dn, factionFor, applyToCharacters, PAIRING, BY_ENGINE,
    LABELS, DICE, MEGASTRUCTURES, FACTION_COLORS,
    colorFor: code => FACTION_COLORS[code] || '#d6a93f',
    label: k => LABELS[k] || k,
  };
})(typeof window !== 'undefined' ? window : globalThis);
