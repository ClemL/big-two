import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../lib/cards.ts";
import { PASSWORD_WORDS, POKEMON_NAMES, suggestName, suggestPassword } from "../lib/names.ts";

test("the name pool is thirty distinct Pokemon that fit the seat field", () => {
  assert.equal(POKEMON_NAMES.length, 30);
  assert.equal(new Set(POKEMON_NAMES).size, 30);
  // claimSeat truncates at 16 characters, so a longer name would be cut off.
  for (const name of POKEMON_NAMES) {
    assert.ok(name.length <= 16, `${name} is too long for the seat name field`);
  }
});

test("every suggested password is exactly three letters", () => {
  for (const word of PASSWORD_WORDS) {
    assert.match(word, /^[a-z]{3}$/, `${word} is not a three-letter word`);
  }
  assert.equal(new Set(PASSWORD_WORDS).size, PASSWORD_WORDS.length);
});

test("a suggested password clears the three-character minimum the API enforces", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    assert.ok(suggestPassword(null, rng).length >= 3);
  }
});

test("suggestions come out of their pools", () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 100; i++) {
    assert.ok((POKEMON_NAMES as readonly string[]).includes(suggestName(rng)));
    assert.ok((PASSWORD_WORDS as readonly string[]).includes(suggestPassword(null, rng)));
  }
});

test("re-rolling a password never hands back the word already showing", () => {
  const rng = mulberry32(3);
  let current = suggestPassword(null, rng);
  for (let i = 0; i < 200; i++) {
    const next = suggestPassword(current, rng);
    assert.notEqual(next, current, "the shuffle button has to visibly change something");
    current = next;
  }
});

test("suggestions are reproducible from a seeded rng", () => {
  assert.equal(suggestName(mulberry32(42)), suggestName(mulberry32(42)));
  assert.equal(suggestPassword(null, mulberry32(42)), suggestPassword(null, mulberry32(42)));
});

test("both pools are reachable, so the suggestion is not effectively fixed", () => {
  const rng = mulberry32(11);
  const names = new Set<string>();
  const words = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    names.add(suggestName(rng));
    words.add(suggestPassword(null, rng));
  }
  assert.equal(names.size, POKEMON_NAMES.length);
  assert.equal(words.size, PASSWORD_WORDS.length);
});
