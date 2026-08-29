/** Capitalizes only the first letter of each space-separated word, lowercases the rest.
 * Apostrophes and hyphens do NOT trigger capitalization of the following letter:
 *   "MATAKALA CHRISHENT MUTONDO" -> "Matakala Chrishent Mutondo"
 *   "n'gandu"                    -> "N'gandu"
 *   "mary-jane o'brien"          -> "Mary-jane O'brien"
 *   "matakala c. mutondo"        -> "Matakala C. Mutondo"
 */
export function toTitleCaseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
