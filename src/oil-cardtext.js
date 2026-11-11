/* OiL! CARD TEXT — the printed text of every card that has an effect in src/oil-cards.js.
   ============================================================================
   One line per card, saying exactly what the engine does (src/oil-cards.js FX, plus the
   card-keyed extras in src/oil-engine.js playCard: CRISIS heat and the HEGEMONY RICO arm).
   Board words: ▰ = control · $ = money · price = the shared oil price ($5–$120) ·
   the richest rival = highest holdings ($ + barrels × price) · the leading rival = the most ▰
   (ties: the earlier seat) · "short a body" = rolling fewer than 3 dice under THE PRIVILEGE.
   SEIZE = you throw their missing body for their next 3 rolls and hold their pip-flip.
   TOLL  = for their next 3 turns they throw it, and you take 50% of their sale and the
           pip-flip if it is the middle body.
   Bracketed parts apply only with that module on. If a card's FX changes, change its text. */
(function (global) {
  'use strict';
  const TEXT = {
    // ---------------- DEEDS ----------------
    "If I Say I'm An Oil Man": "Gain 2 control ▰. Every rival takes +1 exposure. The price moves +1.",
    "Texas Tea": "Gain 2 barrels. The price moves −1. Every rival takes +1 exposure. Burn 1 oil from the well.",
    "Ocean of Oil": "Gain 3 barrels and 1 control ▰. The price moves −2. Burn 2 oil from the well.",
    "...And It's All Mine": "The leading rival loses 1 barrel (if any). Gain 2 control ▰ and take +1 exposure.",
    "Get Yer Own": "The leading rival loses 1 control ▰ (if any).",
    "Juice Tanker": "Sell up to 2 of your barrels at the current price for $. If you sold any, the price moves −1.",
    "For The Love Of The Craft": "Gain $ equal to the current price. Remove 1 exposure (minimum 0). The richest rival takes +1 exposure.",
    "All Yours": "Move up to 3 of your exposure onto the richest rival. [HEGEMONY] If E.D.D. is armed, this arms RICO on the next strike.",

    // ---------------- FREEDOM-MARKET ----------------
    "Strait Flush": "The price moves +4 and the era turns CHAOTIC. [THE MAP] Shut the open strait or canal nearest the leading rival for 3 turns (skipping any that would strand a seat). [THE PRIVILEGE] If the leading rival is short a body, SEIZE it. [CRISIS] +4 heat where you stand.",
    "Split Tea": "The leading rival loses 1 control ▰ (if any). [THE MAP] Take one route out of their current place out of service for 3 turns (one that would not strand a seat).",
    "Ocean of Serenity": "The era turns STABLE. The price moves −2. Gain 1 pip (max 3).",
    "It's Just A Little Chop": "The price moves −1. Burn 1 oil from the well.",
    "Ocean of Time": "Gain 1 pip (max 3). Every rival loses 1 pip (if any).",
    "I've Travelled Across For You": "Take $ from the richest rival: up to the current price, or all they have if less. [THE PRIVILEGE] If they are short a body, TOLL it.",
    "Cash Wave": "Every player, you included, gains $10. The price moves +2.",
    "Rogue Wave": "The richest rival loses 2 barrels (down to 0). [THE PRIVILEGE] If they are short a body, TOLL it.",
    "Doldrums": "Every rival takes +1 exposure.",
    "Chiiiiiiiina": "The price moves −5.",
    "Cymbals and Gongs": "If you hold any barrels, the price moves +2; if you hold none, it moves −2.",
    "Up And Fill": "Gain $ equal to the current price. The price moves −1. Burn 1 oil from the well.",

    // ---------------- COMPETITION ----------------
    "Force Majeure": "The price moves halfway (rounded) toward $63. The era turns STABLE. [CRISIS] −3 heat where you stand.",
    "Leviathan Knows": "The leading rival takes +2 exposure. Gain 1 pip (max 3). [THE PRIVILEGE] If the leading rival is short a body, SEIZE it.",
    "Hobbesian": "Every player, you included, takes +1 exposure. [THE TABLE] Every standing deal dissolves at once, each as a betrayal by the player who offered it (+3 exposure, and the partner holds a grudge). [CRISIS] +2 heat where you stand.",
    "Locke'd In": "Remove 2 exposure (minimum 0). Every rival loses 1 barrel (if any).",
    "Ocean of Monsters": "The price moves by twice this turn's dice shove (the same direction). The era turns CHAOTIC.",
    "Ocean of Fire": "The price moves +4. The leading rival loses 1 control ▰ (if any). Burn 2 oil from the well. [CRISIS] +4 heat where you stand.",
    "Stop Laughing!": "The richest rival takes +2 exposure.",
    "Catastrophe": "Every player, you included, loses 1 control ▰ (if any). Burn 2 oil from the well. [CRISIS] +3 heat where you stand. [HEGEMONY] If E.D.D. is armed, this arms RICO on the next strike.",
    "No Words.": "Every rival takes +1 exposure. [THE TABLE] No new deal may be offered for one full round; standing deals still run. [CRISIS] +2 heat where you stand.",
    "Smoke Stack": "Gain 2 barrels. Every rival takes +1 exposure. Burn 2 oil from the well. [CRISIS] +2 heat where you stand.",
    "Stringent": "Every player, you included, loses 1 barrel (if any). The price moves −1. [CRISIS] −2 heat where you stand.",
    "Measured Austerity": "The price moves −2. Every player, you included, loses $5 (minimum $0). [CRISIS] −2 heat where you stand.",
    "Boots On The Ground": "The leading rival loses 1 control ▰ (if any). Gain 1 control ▰ and take +1 exposure. [THE PRIVILEGE] If the leading rival is short a body, SEIZE it. [CRISIS] +3 heat where you stand.",
    "Dog-Wagged": "The price moves by twice this turn's dice shove, the opposite direction. [THE PRIVILEGE] SEIZE a body from the rival rolling the fewest dice (ties: the most ▰), if they are short one. [HEGEMONY] If E.D.D. is armed, this arms RICO on the next strike.",
    "Tugger, No!": "The leading rival takes +2 exposure.",
    "Drones R Us": "The richest rival loses 1 control ▰ (if any) and takes +1 exposure. The era turns CHAOTIC. [CRISIS] +3 heat where you stand.",
    "The Titan Shifts": "The leading rival loses 1 control ▰ (if any). Gain 1 control ▰. The price moves +2.",
    "Oligarcheology": "The leading rival loses 1 control ▰ and $ equal to the current price (minimum 0 each). [THE PRIVILEGE] If they are short a body, TOLL it.",
    "Quiet Over Peace": "The era turns STABLE. The leading rival takes +1 exposure. Burn 2 oil from the well. [CRISIS] −3 heat where you stand.",
    "Gulf-Faw": "The price moves +3. The richest rival loses 1 control ▰ (if any). [CRISIS] +3 heat where you stand.",
    "Negotiating With A Worthy Adversary": "If you hold any barrels, the price moves +2; if you hold none, it moves −2. Gain 1 pip (max 3). Take +1 exposure. Burn 1 oil from the well.",
  };

  global.OIL_CARDTEXT = TEXT;
  if (typeof module !== 'undefined' && module.exports) module.exports = TEXT;
})(typeof window !== 'undefined' ? window : globalThis);
