/**
 * How the read-aloud voices say a child's name.
 *
 * Built-in computer voices guess a name's sound from its spelling and often
 * guess wrong ("Izzy" → "EYE-zee", "Isabelle" → "EYE-sabelle"). Browsers don't
 * support pronunciation markup, so the fix is a respelling: a parent picks a
 * spelling that the voice reads the right way, and it is used ONLY for speech —
 * everything on screen, in records and sent to AI teachers keeps her real name.
 */

/** Longest respelling a parent can save. */
export const SAY_NAME_MAX = 40;

/** Starting points for names that computer voices often misread (a parent can type anything). */
const SUGGESTIONS: Record<string, string[]> = {
  izzy: ['Izzee', 'Iz-ee', 'Izzie', 'Is-ee'],
  izzie: ['Izzee', 'Iz-ee', 'Is-ee'],
  izzi: ['Izzee', 'Iz-ee', 'Is-ee'],
  isabelle: ['Izza-bell', 'Iz-a-bell', 'Izabel', 'Is-a-bell'],
  isabel: ['Izza-bell', 'Iz-a-bell', 'Izabel', 'Is-a-bell'],
  isabella: ['Izza-bella', 'Iz-a-bella', 'Is-a-bella'],
  izabelle: ['Izza-bell', 'Iz-a-bell', 'Is-a-bell'],
  izabella: ['Izza-bella', 'Iz-a-bella', 'Is-a-bella'],
  isla: ['Eye-la', 'Ila'],
  niamh: ['Neeve', 'Neev'],
  siobhan: ['Shiv-awn', 'Sh-vawn'],
  saoirse: ['Sur-sha', 'Seer-sha'],
  aoife: ['Ee-fa', 'Eefa'],
};

/** Respellings worth trying for this name, or [] when we have no suggestions. */
export function sayNameSuggestions(name: string): string[] {
  return SUGGESTIONS[name.trim().toLowerCase()] ?? [];
}

/** Keeps a respelling to letters, spaces, hyphens and apostrophes (no markup the voice would read out). */
export function cleanSayName(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}' \-’]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim()
    .slice(0, SAY_NAME_MAX)
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The text a voice should read: each whole-word use of `name` (any letter case,
 * including "Izzy's" and "IZZY!") becomes `sayAs`. Words that merely contain the
 * name ("Izzybelle") are left alone. Without a respelling the text is unchanged.
 */
export function speakableText(text: string, name: string, sayAs: string | undefined): string {
  const target = name.trim();
  const say = sayAs ? cleanSayName(sayAs) : '';
  if (!target || !say || say.toLowerCase() === target.toLowerCase()) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(target)}(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  return text.replace(re, say);
}

/** What the "Hear it" button says. */
export function nameTestLine(spoken: string): string {
  return `Hoo-hoo! Hello, ${spoken}! Ready to read with me, ${spoken}?`;
}
