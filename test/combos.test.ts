import test from "node:test";
import assert from "node:assert/strict";
import { RANKS, SUITS, makeCard, type Card } from "../lib/cards.ts";
import { beats, enumerateCombos, identify, legalMoves } from "../lib/combos.ts";

/** Build cards from shorthand like "3D", "10H", "2S". */
function hand(...ids: string[]): Card[] {
  return ids.map((id) => {
    const suit = SUITS.indexOf(id.slice(-1) as (typeof SUITS)[number]);
    const rank = RANKS.indexOf(id.slice(0, -1) as (typeof RANKS)[number]);
    assert.ok(rank >= 0 && suit >= 0, `bad card id ${id}`);
    return makeCard(rank, suit);
  });
}

test("single cards order by rank then suit", () => {
  assert.equal(beats(identify(hand("3S"))!, identify(hand("3H"))!), true);
  assert.equal(beats(identify(hand("3D"))!, identify(hand("3C"))!), false);
  assert.equal(beats(identify(hand("2D"))!, identify(hand("AS"))!), true);
});

test("pairs and triples require matching ranks", () => {
  assert.equal(identify(hand("5D", "5C"))!.type, "pair");
  assert.equal(identify(hand("5D", "6C")), null);
  assert.equal(identify(hand("9D", "9C", "9H"))!.type, "triple");
  assert.equal(identify(hand("9D", "9C", "8H")), null);
});

test("pair comparison uses the higher suit of the pair", () => {
  const spadePair = identify(hand("7S", "7H"))!;
  const lowPair = identify(hand("7C", "7D"))!;
  assert.equal(beats(spadePair, lowPair), true);
  assert.equal(beats(lowPair, spadePair), false);
});

test("five-card categories are detected", () => {
  assert.equal(identify(hand("3D", "4C", "5H", "6S", "7D"))!.type, "straight");
  assert.equal(identify(hand("3D", "7D", "9D", "JD", "KD"))!.type, "flush");
  assert.equal(identify(hand("4D", "4C", "4H", "9S", "9D"))!.type, "fullHouse");
  assert.equal(identify(hand("6D", "6C", "6H", "6S", "9D"))!.type, "fourOfAKind");
  assert.equal(identify(hand("8H", "9H", "10H", "JH", "QH"))!.type, "straightFlush");
});

test("category order: straight < flush < full house < quads < straight flush", () => {
  const straight = identify(hand("3D", "4C", "5H", "6S", "7D"))!;
  const flush = identify(hand("3C", "5C", "7C", "9C", "JC"))!;
  const boat = identify(hand("4D", "4C", "4H", "9S", "9D"))!;
  const quads = identify(hand("6D", "6C", "6H", "6S", "9D"))!;
  const sf = identify(hand("3H", "4H", "5H", "6H", "7H"))!;
  assert.equal(beats(flush, straight), true);
  assert.equal(beats(boat, flush), true);
  assert.equal(beats(quads, boat), true);
  assert.equal(beats(sf, quads), true);
  assert.equal(beats(straight, sf), false);
});

test("2 is high in straights and there is no wrap-around", () => {
  assert.equal(identify(hand("JD", "QC", "KH", "AS", "2D"))!.type, "straight");
  assert.equal(identify(hand("AD", "2C", "3H", "4S", "5D")), null);
  const top = identify(hand("JD", "QC", "KH", "AS", "2D"))!;
  const lower = identify(hand("10D", "JC", "QH", "KS", "AD"))!;
  assert.equal(beats(top, lower), true);
});

test("flushes compare by suit first, then by rank", () => {
  const lowSpadeFlush = identify(hand("3S", "4S", "5S", "6S", "8S"))!;
  const highDiamondFlush = identify(hand("9D", "JD", "QD", "KD", "AD"))!;
  assert.equal(beats(lowSpadeFlush, highDiamondFlush), true);
  const otherSpadeFlush = identify(hand("3S", "4S", "5S", "6S", "9S"))!;
  assert.equal(beats(otherSpadeFlush, lowSpadeFlush), true);
});

test("full houses compare by the rank of the triple", () => {
  const smallTripleBigPair = identify(hand("5D", "5C", "5H", "AS", "AD"))!;
  const bigTripleSmallPair = identify(hand("KD", "KC", "KH", "3S", "3D"))!;
  assert.equal(beats(bigTripleSmallPair, smallTripleBigPair), true);
});

test("shapes of different sizes never beat each other", () => {
  const quads = identify(hand("6D", "6C", "6H", "6S", "9D"))!;
  const single = identify(hand("2S"))!;
  assert.equal(beats(quads, single), false);
  assert.equal(beats(single, quads), false);
});

test("four cards are not a playable shape", () => {
  assert.equal(identify(hand("6D", "6C", "6H", "6S")), null);
});

test("legalMoves honours the mandatory card and the table", () => {
  const myHand = hand("3D", "3C", "4H", "5S", "9D");
  const opening = legalMoves(myHand, { current: null, mustInclude: "3D" });
  assert.ok(opening.length > 0);
  assert.ok(opening.every((c) => c.cards.some((card) => card.id === "3D")));

  const table = identify(hand("5D"))!;
  const replies = legalMoves(myHand, { current: table });
  assert.deepEqual(
    replies.map((c) => c.cards[0].id),
    ["5S", "9D"],
  );
});

test("legalMoves returns ascending strength", () => {
  const myHand = hand("3D", "3C", "3H", "4S", "4D", "7C", "9S", "JD", "QD", "KD", "AD", "2S", "2H");
  const moves = legalMoves(myHand, { current: null });
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1];
    const b = moves[i];
    assert.ok(a.size < b.size || (a.size === b.size && (a.tier < b.tier || (a.tier === b.tier && a.key <= b.key))));
  }
});

test("enumerateCombos finds every shape in a full hand", () => {
  const myHand = hand("3D", "3C", "3H", "3S", "4D", "5D", "6D", "7D", "9C", "10C", "JC", "QC", "KC");
  const types = new Set(enumerateCombos(myHand).map((c) => c.type));
  assert.ok(types.has("single"));
  assert.ok(types.has("pair"));
  assert.ok(types.has("triple"));
  assert.ok(types.has("straightFlush"));
  assert.ok(types.has("fourOfAKind"));
});
