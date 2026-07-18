const TAGS = [
  "ace",
  "bluff",
  "chip",
  "river",
  "flop",
  "mace",
  "nova",
  "wolf",
  "fox",
  "kite",
  "zen",
  "lux",
  "rex",
  "neo",
  "jax",
  "kai",
  "rio",
  "ash",
  "max",
  "leo",
  "sky",
  "onyx",
  "bolt",
  "dash",
  "hex",
  "vibes",
  "stack",
  "fold",
  "raise",
  "deal",
];

const PREFIX = [
  "xx",
  "x",
  "the",
  "pro",
  "mr",
  "ms",
  "i",
  "its",
  "only",
  "real",
  "no",
  "big",
  "lil",
];

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Random-looking usernames like `X44mace`, `name19`, `proRiver92`.
 * Stable per seed so the same bot keeps the same handle.
 */
export function generateBotDisplayName(seed: string) {
  const h = hash(seed);
  const style = h % 5;
  const n = 10 + (h % 90); // 10–99
  const n2 = 100 + ((h >>> 7) % 900); // 100–999
  const tag = TAGS[(h >>> 3) % TAGS.length]!;
  const tag2 = TAGS[(h >>> 11) % TAGS.length]!;
  const pref = PREFIX[(h >>> 15) % PREFIX.length]!;
  const letter = String.fromCharCode(65 + ((h >>> 19) % 26)); // A–Z

  switch (style) {
    case 0:
      return `${letter}${n}${tag}`; // X44mace
    case 1:
      return `${tag}${n}`; // name19 / ace42
    case 2:
      return `${pref}${tag[0]!.toUpperCase()}${tag.slice(1)}${n}`; // proRiver92
    case 3:
      return `${tag}_${n2}`; // bluff_417
    default:
      return `${letter}${letter.toLowerCase()}${n}${tag2}`; // Xx17dash
  }
}

/** True if the name still looks like an old bot label or real-name format. */
export function isLegacyBotName(name: string | null | undefined) {
  if (!name) return true;
  if (/bot/i.test(name)) return true;
  if (/\[\d{4}\]/.test(name)) return true;
  // Old "Elena Cruz" / "Theo Morales" style
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name)) return true;
  return false;
}
