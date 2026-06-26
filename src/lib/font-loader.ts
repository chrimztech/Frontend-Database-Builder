import type { jsPDF } from "jspdf";

interface CustomFontSpec {
  jsPdfName: string;
  jsPdfStyle: "normal" | "bold" | "italic" | "bolditalic";
  googleFamily: string;
  weight: number;
  italic: boolean;
}

const CUSTOM_FONTS: CustomFontSpec[] = [
  { jsPdfName: "cormorant", jsPdfStyle: "normal",     googleFamily: "Cormorant Garamond", weight: 400, italic: false },
  { jsPdfName: "cormorant", jsPdfStyle: "bold",       googleFamily: "Cormorant Garamond", weight: 700, italic: false },
  { jsPdfName: "cormorant", jsPdfStyle: "italic",     googleFamily: "Cormorant Garamond", weight: 400, italic: true  },
  { jsPdfName: "cormorant", jsPdfStyle: "bolditalic", googleFamily: "Cormorant Garamond", weight: 700, italic: true  },
  { jsPdfName: "playfair",  jsPdfStyle: "normal",     googleFamily: "Playfair Display",   weight: 400, italic: false },
  { jsPdfName: "playfair",  jsPdfStyle: "bold",       googleFamily: "Playfair Display",   weight: 700, italic: false },
  { jsPdfName: "playfair",  jsPdfStyle: "italic",     googleFamily: "Playfair Display",   weight: 400, italic: true  },
  { jsPdfName: "playfair",  jsPdfStyle: "bolditalic", googleFamily: "Playfair Display",   weight: 700, italic: true  },
  { jsPdfName: "manrope",   jsPdfStyle: "normal",     googleFamily: "Manrope",            weight: 400, italic: false },
  { jsPdfName: "manrope",   jsPdfStyle: "bold",       googleFamily: "Manrope",            weight: 700, italic: false },
  { jsPdfName: "lato",      jsPdfStyle: "normal",     googleFamily: "Lato",               weight: 400, italic: false },
  { jsPdfName: "lato",      jsPdfStyle: "bold",       googleFamily: "Lato",               weight: 700, italic: false },
  { jsPdfName: "lato",      jsPdfStyle: "italic",     googleFamily: "Lato",               weight: 400, italic: true  },
  { jsPdfName: "cinzel",    jsPdfStyle: "normal",     googleFamily: "Cinzel",             weight: 400, italic: false },
  { jsPdfName: "cinzel",    jsPdfStyle: "bold",       googleFamily: "Cinzel",             weight: 700, italic: false },
];

// In-memory cache — persists across PDF generations within a single page load
const fontBase64Cache = new Map<string, string>();

// sessionStorage key prefix — bump the version suffix to invalidate cached fonts
const SESSION_PREFIX = "tels_font_v1:";

function fontCacheKey(name: string, style: string) {
  return `${name}:${style}`;
}

async function fetchFontBase64(spec: CustomFontSpec): Promise<string | null> {
  const key = fontCacheKey(spec.jsPdfName, spec.jsPdfStyle);

  // 1. In-memory cache — fastest path
  if (fontBase64Cache.has(key)) return fontBase64Cache.get(key)!;

  // 2. sessionStorage — survives page refresh so fonts are only fetched once per session
  try {
    const stored = sessionStorage.getItem(SESSION_PREFIX + key);
    if (stored) {
      fontBase64Cache.set(key, stored);
      return stored;
    }
  } catch {}

  // 3. Fetch from Google Fonts via server function
  try {
    const { fetchGoogleFontTtf } = await import("./api/fonts.functions");
    const result = await fetchGoogleFontTtf({
      data: { family: spec.googleFamily, weight: spec.weight, italic: spec.italic },
    });
    fontBase64Cache.set(key, result.base64);
    try { sessionStorage.setItem(SESSION_PREFIX + key, result.base64); } catch {}
    return result.base64;
  } catch (e) {
    console.warn(`[font-loader] Failed to fetch ${spec.jsPdfName} ${spec.jsPdfStyle}:`, e);
    return null;
  }
}

const BUILTIN_FAMILIES = new Set(["helvetica", "times", "courier"]);

/**
 * Warms the font cache for every known custom font family.
 * Call this early (in parallel with other async work) so that
 * registerCustomFontsInDoc is instant when PDF generation begins.
 */
export async function preloadCustomFonts(): Promise<void> {
  await Promise.allSettled(CUSTOM_FONTS.map(fetchFontBase64));
}

/**
 * Loads all custom font variants needed by `families` and registers them in `doc`.
 * Built-in jsPDF fonts (helvetica/times/courier) are skipped.
 * Falls back silently — a missing custom font just renders in helvetica.
 */
export async function registerCustomFontsInDoc(doc: jsPDF, families: string[]): Promise<void> {
  const custom = [...new Set(families)].filter((f) => !BUILTIN_FAMILIES.has(f));
  if (custom.length === 0) return;

  const needed = CUSTOM_FONTS.filter((s) => custom.includes(s.jsPdfName));

  await Promise.allSettled(
    needed.map(async (spec) => {
      const base64 = await fetchFontBase64(spec);
      if (!base64) return;
      const filename = `${spec.jsPdfName}-${spec.jsPdfStyle}.ttf`;
      doc.addFileToVFS(filename, base64);
      doc.addFont(filename, spec.jsPdfName, spec.jsPdfStyle);
    }),
  );
}

/** CSS font-family string for the canvas preview in the template editor. */
export function getCssFontFamily(jsPdfName: string): string {
  const map: Record<string, string> = {
    helvetica: "system-ui, -apple-system, Arial, sans-serif",
    times:     "Georgia, 'Times New Roman', serif",
    courier:   "'Courier New', Courier, monospace",
    cormorant: "'Cormorant Garamond', Georgia, serif",
    playfair:  "'Playfair Display', Georgia, serif",
    manrope:   "'Manrope', system-ui, sans-serif",
    lato:      "'Lato', system-ui, sans-serif",
    cinzel:    "'Cinzel', Georgia, serif",
  };
  return map[jsPdfName] ?? "system-ui, sans-serif";
}
