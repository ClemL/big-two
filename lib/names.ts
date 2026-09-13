/**
 * Suggested defaults for the room lobby: a name to sit under and a word to use
 * as the table password.
 *
 * Both pools are picked from rather than generated so the suggestions stay
 * pronounceable — these get read out across a room ("the password is 'fox'"),
 * which a random string fails at badly.
 *
 * `rng` is caller-supplied for the same reason the deal takes a seed: a test
 * can pin the choice. Callers must pick on the client, after mount — choosing
 * during render would differ between the server and client passes and break
 * hydration on the statically prerendered `/play`.
 */

/**
 * The thirty best-known Generation I Pokemon that are *basic* — nothing evolves
 * into them. That rules out the obvious crowd-pleasers who are not (Charizard,
 * Blastoise, Venusaur, Gengar, Gyarados, Dragonite), which is why the list
 * leans on starters, the legendary birds and the well-known one-stage species.
 */
export const POKEMON_NAMES = [
  "Pikachu",
  "Charmander",
  "Bulbasaur",
  "Squirtle",
  "Eevee",
  "Snorlax",
  "Mewtwo",
  "Mew",
  "Jigglypuff",
  "Magikarp",
  "Psyduck",
  "Lapras",
  "Dratini",
  "Ditto",
  "Abra",
  "Machop",
  "Growlithe",
  "Meowth",
  "Onix",
  "Scyther",
  "Cubone",
  "Chansey",
  "Articuno",
  "Zapdos",
  "Moltres",
  "Aerodactyl",
  "Vulpix",
  "Clefairy",
  "Geodude",
  "Electabuzz",
] as const;

/**
 * Three-letter words for the suggested table password. Concrete nouns only:
 * they survive being said out loud and typed by someone who half-heard them.
 */
export const PASSWORD_WORDS = [
  "ace",
  "ant",
  "ape",
  "arc",
  "art",
  "bat",
  "bay",
  "bee",
  "bud",
  "bug",
  "cab",
  "cap",
  "cat",
  "cog",
  "cow",
  "cub",
  "cup",
  "dam",
  "day",
  "den",
  "dot",
  "duo",
  "eel",
  "egg",
  "elf",
  "elk",
  "elm",
  "fan",
  "fig",
  "fin",
  "fox",
  "gem",
  "hat",
  "hen",
  "hub",
  "ice",
  "ink",
  "inn",
  "ivy",
  "jam",
  "jar",
  "jay",
  "jet",
  "joy",
  "key",
  "kit",
  "lab",
  "leg",
  "log",
  "map",
  "mug",
  "net",
  "nut",
  "oak",
  "oar",
  "orb",
  "owl",
  "pea",
  "pen",
  "pie",
  "pig",
  "pin",
  "pod",
  "pot",
  "pup",
  "ram",
  "ray",
  "rib",
  "rig",
  "rod",
  "rug",
  "sea",
  "ski",
  "sky",
  "sun",
  "tag",
  "tea",
  "tin",
  "toe",
  "top",
  "toy",
  "tub",
  "urn",
  "van",
  "vet",
  "wax",
  "web",
  "wig",
  "wok",
  "yak",
  "yam",
  "yew",
  "zoo",
] as const;

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** A name to prefill the seat form with. */
export function suggestName(rng: () => number = Math.random): string {
  return pick(POKEMON_NAMES, rng);
}

/**
 * A word to prefill the table password with. Takes the current value so the
 * re-roll button always visibly changes something.
 */
export function suggestPassword(current: string | null = null, rng: () => number = Math.random): string {
  if (PASSWORD_WORDS.length < 2) return PASSWORD_WORDS[0];
  for (let attempt = 0; attempt < 8; attempt++) {
    const word = pick(PASSWORD_WORDS, rng);
    if (word !== current) return word;
  }
  return pick(PASSWORD_WORDS, rng);
}
