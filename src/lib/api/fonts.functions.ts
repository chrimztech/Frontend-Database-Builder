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

    // Request Google Fonts CSS with an old browser UA — this causes Google to return
    // TTF src URLs rather than WOFF2, which jsPDF can embed directly.
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@${italic ? 1 : 0},${weight}&display=block`;

    const cssResp = await fetch(cssUrl, {
      headers: {
        "User-Agent": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)",
      },
    });

    if (!cssResp.ok) {
      throw new Error(`Google Fonts CSS request failed: ${cssResp.status} for "${family}"`);
    }

    const css = await cssResp.text();

    // Extract TTF URL from the @font-face rule
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
    if (!match) {
      throw new Error(
        `No TTF URL found for "${family}" (weight:${weight}, italic:${italic}). ` +
          `Google may have stopped serving TTF for this UA. CSS preview: ${css.slice(0, 300)}`,
      );
    }

    const fontResp = await fetch(match[1]);
    if (!fontResp.ok) {
      throw new Error(`Font file download failed: ${fontResp.status} — ${match[1]}`);
    }

    const buffer = await fontResp.arrayBuffer();
    return { base64: Buffer.from(buffer).toString("base64") };
  });
