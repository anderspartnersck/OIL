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
    // THE PRIVILEGE (docs/THE-PRIVILEGE.md) — who gets to touch the dice
    privLost: [
      "On the record now. They'll be rolling with somebody else's hands.",
      "Fewer dice. That's what a file at the regulator buys you.",
      "The clean ones roll the world. The rest of them watch.",
    ],
    privBack: [
      "Somebody's been rehabilitated. Funny how that works.",
      "The record's gone quiet. The dice come back.",
    ],
    seize: [
      "Somebody else is throwing their dice now. That's what a file at the regulator gets you.",
      "Not their turn, not their market. Whoever's holding the dice holds the lever.",
      "They didn't lose the body. It was taken. There's a difference, and nobody cares.",
    ],
    snare: [
      "That's not a deal. That's a wire across the doorway.",
      "Somebody's waiting for a competitor to slip. It's called patience in the brochure.",
    ],
    arrest: [
      "Arrested in port. The paperwork was always going to find them.",
      "Admiralty law: older than oil, and it still bills by the day.",
    ],
    dues: [
      "Transit dues. The water has an owner, and the owner has a ledger.",
      "Every canal on earth is somebody's toll booth.",
    ],
    salvage: [
      "Salvage. Pull a man out of the fire and you own a piece of the fire.",
      "They put it out. Now they want a cut of what didn't burn.",
    ],
    wartime: [
      "Wartime. The governments have stopped asking.",
      "This is the part of the cycle where the state remembers it owns everything.",
      "You can hear it in the tape: somebody's talking about the bomb again.",
    ],
    requisition: [
      "Requisitioned. Nationalised. Whatever the word, the dice are the state's now.",
      "The biggest private operator always goes first. Ask Abadan.",
      "Wartime powers. Nobody at this table voted for them.",
    ],
    // MOMENTUM (docs/THE-MOMENTUM.md) — the ocean carries you
    camp: [
      "Demurrage. Every day at the berth is a day somebody bills you for.",
      "They're sitting on it. Sitting costs money in this business.",
      "Waiting out the market. The market does not wait back.",
    ],
    inspection: [
      "Customs. The paperwork found them before the cargo did.",
      "Port-state control. A clean record sails; theirs didn't.",
    ],
    storm: [
      "Weather took a barrel. The sea doesn't sign anything.",
      "Over the side. The insurers will call it an act of God.",
    ],
    // THE EXPANSION (docs/THE-EXPANSION.md)
    pirates: [
      "Boarded. The ransom note will be very professional.",
      "Piracy: the oldest private enterprise on the water.",
    ],
    piratesWake: [
      "The straits are restless. The skiffs are out again.",
      "When the world shakes, the Gulf of Aden gets crowded.",
    ],
    piratesQuiet: [
      "The pirate waters have gone quiet. Insurers call it a good quarter.",
      "Calm seas. The skiffs are back on the beach — for now.",
    ],
    dispute: [
      "Lawyered up. The dice will hear the case.",
      "A dispute. The bodies are thrown, and the bodies decide.",
    ],
    arbiter: [
      "A tie. The firm decides — the firm always decides.",
      "Anders & Partners have ruled. Nobody saw the ruling.",
    ],
    bribe: [
      "Waved through. Somebody at customs has a new boat.",
      "Anders made a call. The inspection is over.",
    ],
    toll: [
      "They still do the work. Somebody else cashes the cheque.",
      "Protection was always a business model.",
      "You throw the dice, they take the house cut. Old as the industry.",
    ],
    green: ["Anders just put a thumb on the scale.", "Somebody double-checked their career."],
    verdict: ["controls what's left — the rest control nothing.", "wins the ruins. No prize but the rubble.", "is last one standing on a dry field."],
  };
  // deterministic pick (seed = turn) so a replay narrates identically
  function pick(key, seed) { const a = LINES[key]; return a ? a[(seed >>> 0) % a.length] : ''; }
  global.OIL_DESK = { LINES, pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = { LINES, pick };
})(typeof window !== 'undefined' ? window : globalThis);
