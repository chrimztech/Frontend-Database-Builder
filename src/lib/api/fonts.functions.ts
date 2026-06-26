import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const fetchGoogleFontTtf = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      family: z.string(),
      weight: z.number().default(400),
      italic: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const { family, weight, italic } = data;

    // iOS 9 Safari: Google returns TTF src URLs (iOS < 10 has no WOFF2 support).
    // IE6 now also gets the new kit-format URL which may return EOT, so avoid it.
    const OLD_UA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 9_0 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13A344 Safari/601.1";

    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@${italic ? 1 : 0},${weight}&display=block`;

    const cssResp = await fetch(cssUrl, { headers: { "User-Agent": OLD_UA } });

    if (!cssResp.ok) {
      throw new Error(`Google Fonts CSS request failed: ${cssResp.status} for "${family}"`);
    }

    const css = await cssResp.text();

    // Accept both direct .ttf paths and kit-format URLs (l/font?kit=...).
    // When fetching the kit URL we use the same old UA so Google returns TTF bytes.
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (!match) {
      throw new Error(
        `No font URL found for "${family}" (weight:${weight}, italic:${italic}). ` +
          `CSS preview: ${css.slice(0, 300)}`,
      );
    }

    const fontResp = await fetch(match[1], { headers: { "User-Agent": OLD_UA } });
    if (!fontResp.ok) {
      throw new Error(`Font file download failed: ${fontResp.status} — ${match[1]}`);
    }

    const buffer = await fontResp.arrayBuffer();
    return { base64: Buffer.from(buffer).toString("base64") };
  });
