/* OiL! — THE DESK. A running market-commentary voice (the OiL! answer to ER$N's
   "Sharky"). PRESENTATION ONLY: it reads the engine state, never touches it, and uses
   its own line index — it cannot affect the seeded outcome (Charter E1).

   Tone follows the crux (docs/DESIGN-DIRECTION.md): gallows humour over real mourning.
   Cynical, never cute — the world is burning and the desk is still reading the tape. */
(function (global) {
  'use strict';
  const LINES = {
    chaotic: [
      "The tape's convulsing again.",
      "Wild print. Nobody's hands are clean today.",
      "Volatility like this — somebody planned it.",
    ],
    scarcity: [
      "Supply's tightening. Watch the pumps.",
      "The wells are getting shy, and the price knows it.",
      "Less oil, bigger number. Same as it ever was.",
    ],
    spike: [
      "Triple digits. Somebody's getting rich off the misery.",
      "Price is screaming — so is everyone who buys gas.",
      "A spike like that always has a name attached to it.",
    ],
    edd: [
      "And there it is. The Protocol.",
      "Eat, Divide, Destroy. God help the small holders.",
      "This is the part they leave out of the brochure.",
    ],
    EAT: ["Swallowed whole. Efficient.", "One less competitor, one more 'synergy.'"],
    DESTROY: ["Burned to deny it. Classic.", "If they can't hold it, nobody will."],
    DIVIDE: ["Carved up over coffee.", "A treaty. For now."],
    // CRISIS — the register the whole game is built on. Gallows humour over real
    // mourning; the desk never gets cute about a field on fire.
    blowout: [
      "There it goes. You can see that one from orbit.",
      "A well's alight. Somebody's quarter is about to get expensive.",
      "That's a field burning. Whatever else is true, that part isn't a metaphor.",
    ],
    flashpoint: [
      "The strait's shut. It was always going to be that strait.",
      "That's not weather. That's a decision somebody made in a room.",
    ],
    iws: [
      "Box and Scooter are on the ground. They'll cap it, and they'll invoice it.",
      "The Fire Cutters bill like surgeons and work like them too.",
      "Cheapest that well will ever be capped is right now. It only goes up.",
    ],
    // THE TABLE (docs/THE-TABLE.md) — the desk reads the room, not just the tape.
    pact: [
      "Two of them are holding the line. That never holds.",
      "A gentlemen's agreement. Between these gentlemen.",
      "They're calling it cooperation. The lawyers call it something else.",
    ],
    tribute: [
      "That's not a partnership. That's protection money.",
      "One of them just started paying rent on their own oil.",
      "Somebody bought a quiet year. Somebody's carrying the paperwork.",
    ],
    scapegoat: [
      "They've agreed on whose fault it was. It's the big one's fault.",
      "Two signatures, one neck.",
      "Consensus reached. The blame's been allocated.",
    ],
    betrayal: [
      "And there goes the handshake.",
      "The deal lasted exactly as long as it paid.",
      "You could see that one coming from the boardroom window.",
      "Nobody's shocked. Everybody's writing it down.",
    ],
    purge: [
      "Every deal on this table just died at once.",
      "Nasty, brutish, and this round.",
    ],
    revenge: [
      "They waited for this. They've been waiting.",
      "Turns out the Protocol keeps a guest list.",
    ],
    spared: [
      "The cartel walks out together. Nobody left to eat.",
      "Everyone at this table is somebody's partner. How cozy.",
    ],
    green: ["Anders just put a thumb on the scale.", "Somebody double-checked their career."],
    verdict: ["controls what's left — the rest control nothing.", "wins the ruins. No prize but the rubble.", "is last one standing on a dry field."],
  };
  // deterministic pick (seed = turn) so a replay narrates identically
  function pick(key, seed) { const a = LINES[key]; return a ? a[(seed >>> 0) % a.length] : ''; }
  global.OIL_DESK = { LINES, pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = { LINES, pick };
})(typeof window !== 'undefined' ? window : globalThis);
