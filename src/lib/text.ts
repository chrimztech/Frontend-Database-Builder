/** Capitalizes the first letter of each name segment, lowercases the rest.
 * Handles multi-word names, hyphens, and apostrophes:
 *   "MATAKALA CHRISHENT MUTONDO" -> "Matakala Chrishent Mutondo"
 *   "mary-jane o'brien"          -> "Mary-Jane O'Brien"
 */
export function toTitleCaseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
