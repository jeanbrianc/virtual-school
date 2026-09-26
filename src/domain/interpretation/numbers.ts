/** Tiny English number parser for parent narratives ("twelve", "a dozen", "2 1/2"). */
const UNITS: Record<string, number> = {
  zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, dozen: 12, couple: 2, several: 3, few: 3, half: 0.5,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Multi-word forms come first so alternation prefers the longest match.
export const NUMBER_WORD_PATTERN =
  '(?:a dozen|a couple(?: of)?|a few|a hundred|one hundred|half(?: a| an)?|\\d+\\s+\\d\\/\\d|\\d\\/\\d|\\d+(?:\\.\\d+)?|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|dozen|several|hundred|an?)';

export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+of$/, '');
  if (!s) return null;
  const mixed = s.match(/^(\d+)\s+(\d)\/(\d)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d)\/(\d)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(a |one )?hundred$/.test(s)) return 100;
  if (/^half( an?)?$/.test(s)) return 0.5;
  const cleaned = s.replace(/^a (dozen|couple|few)$/, '$1');
  if (cleaned in UNITS) return UNITS[cleaned] ?? null;
  const compound = cleaned.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](\w+))?$/);
  if (compound) {
    const tens = TENS[compound[1] ?? ''] ?? 0;
    const unit = compound[2] ? (UNITS[compound[2]] ?? 0) : 0;
    return tens + unit;
  }
  return null;
}

/** All plausible numbers mentioned in a sentence (ignores the article "a"). */
export function numbersIn(sentence: string): number[] {
  const re = new RegExp(`\\b${NUMBER_WORD_PATTERN}\\b`, 'gi');
  const out: number[] = [];
  for (const m of sentence.matchAll(re)) {
    const word = m[0].toLowerCase();
    if (word === 'a' || word === 'an') continue;
    const n = parseNumber(word);
    if (n !== null) out.push(n);
  }
  return out;
}
