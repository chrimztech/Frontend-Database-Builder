import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { inflateSync } from "node:zlib";

// jsPDF only understands raw SFNT (TTF/OTF) font binaries — not WOFF/WOFF2.
// Google Fonts' CSS API now serves WOFF even for old-browser user-agent
// tricks that used to force TTF, so we unwrap WOFF1 into a plain SFNT here
// (once, server-side) rather than shipping an unusable format to the client.
function woff1ToSfnt(buf: Buffer): Buffer {
  if (buf.readUInt32BE(0) !== 0x774f4646) throw new Error("not a WOFF1 file");
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);

  const tables: { tag: string; data: Buffer; checksum: number }[] = [];
  let p = 44;
  for (let i = 0; i < numTables; i++) {
    const tag = buf.toString("ascii", p, p + 4);
    const offset = buf.readUInt32BE(p + 4);
    const compLength = buf.readUInt32BE(p + 8);
    const origLength = buf.readUInt32BE(p + 12);
    const origChecksum = buf.readUInt32BE(p + 16);
    let data = buf.subarray(offset, offset + compLength);
    if (compLength !== origLength) data = inflateSync(data);
    if (data.length !== origLength) throw new Error(`table ${tag} length mismatch`);
    tables.push({ tag, data, checksum: origChecksum });
    p += 20;
  }

  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = Math.pow(2, entrySelector) * 16;
  const rangeShift = numTables * 16 - searchRange;

  const headerSize = 12 + numTables * 16;
  let offset = headerSize;
  const dirEntries: { tag: string; checksum: number; offset: number; length: number }[] = [];
  const dataChunks: Buffer[] = [];
  for (const t of tables) {
    const padded = (t.data.length + 3) & ~3;
    const chunk = Buffer.alloc(padded);
    t.data.copy(chunk);
    dirEntries.push({ tag: t.tag, checksum: t.checksum, offset, length: t.data.length });
    dataChunks.push(chunk);
    offset += padded;
  }

  const out = Buffer.alloc(offset);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(rangeShift, 10);

  let dp = 12;
  for (const e of dirEntries) {
    out.write(e.tag, dp, "ascii");
    out.writeUInt32BE(e.checksum, dp + 4);
    out.writeUInt32BE(e.offset, dp + 8);
    out.writeUInt32BE(e.length, dp + 12);
    dp += 16;
  }

  let wp = headerSize;
  for (const chunk of dataChunks) {
    chunk.copy(out, wp);
    wp += chunk.length;
  }

  return out;
}

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

    // Accept both direct .ttf/.woff paths and kit-format URLs (l/font?kit=...).
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

    const buffer = Buffer.from(await fontResp.arrayBuffer());

    // Google now serves plain WOFF1 even for the spoofed old UA — unwrap it.
    // WOFF1 signature: 'wOFF' (0x774F4646). Anything else (real TTF/OTF, or
    // WOFF2) is passed through as-is; font-loader.ts's client-side WOFF2
    // guard still protects against that remaining edge case.
    let sfnt: Buffer = buffer;
    if (buffer.readUInt32BE(0) === 0x774f4646) {
      try {
        sfnt = woff1ToSfnt(buffer);
      } catch (err) {
        console.warn(`[fonts.functions] WOFF1->SFNT conversion failed for "${family}":`, err);
      }
    }

    return { base64: sfnt.toString("base64") };
  });
