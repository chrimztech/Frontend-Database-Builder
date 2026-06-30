/**
 * One-time migration: copies all certificate PDFs from Supabase Storage → Cloudflare R2.
 * Run AFTER filling in the R2 credentials in .env.local.
 *
 * Usage:
 *   node scripts/migrate-pdfs-to-r2.mjs
 *
 * Requires Node 18+ (native fetch, ESM).
 * Reads credentials from .env and .env.local automatically via dotenv.
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── load .env and .env.local manually (no dotenv dependency needed) ──────────
function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file may not exist — that's fine
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

// ── validate env vars ─────────────────────────────────────────────────────────
const required = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
};

const missing = Object.entries(required)
  .filter(([, v]) => !v || v.startsWith("your_"))
  .map(([k]) => k);

if (missing.length) {
  console.error("\n❌  Missing or unfilled env vars:");
  missing.forEach((k) => console.error(`     ${k}`));
  console.error("\n   Fill them in .env.local then re-run.\n");
  process.exit(1);
}

// ── clients ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

// ── helpers ───────────────────────────────────────────────────────────────────
async function fileExistsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
console.log("\n🚀  UNZA TeLS — Supabase Storage → Cloudflare R2 migration");
console.log(`    Supabase: ${process.env.SUPABASE_URL}`);
console.log(`    R2 bucket: ${BUCKET}\n`);

// List all files in the Supabase certificates bucket
const { data: files, error: listErr } = await supabase.storage
  .from("certificates")
  .list("", { limit: 10_000 });

if (listErr) {
  console.error("❌  Could not list Supabase storage:", listErr.message);
  process.exit(1);
}

if (!files || files.length === 0) {
  console.log("✅  No files in Supabase certificates bucket — nothing to migrate.");
  process.exit(0);
}

console.log(`    Found ${files.length} file(s) to migrate.\n`);

let skipped = 0;
let copied = 0;
let failed = 0;

for (const file of files) {
  const key = file.name;
  process.stdout.write(`    ${key} … `);

  // Skip if already in R2
  if (await fileExistsInR2(key)) {
    process.stdout.write("already in R2, skipped\n");
    skipped++;
    continue;
  }

  // Download from Supabase
  const { data: blob, error: dlErr } = await supabase.storage
    .from("certificates")
    .download(key);

  if (dlErr || !blob) {
    process.stdout.write(`DOWNLOAD FAILED: ${dlErr?.message ?? "empty"}\n`);
    failed++;
    continue;
  }

  // Upload to R2
  try {
    const buffer = Buffer.from(await blob.arrayBuffer());
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "application/pdf",
        ContentLength: buffer.length,
      }),
    );
    process.stdout.write(`✓ copied (${(buffer.length / 1024).toFixed(0)} KB)\n`);
    copied++;
  } catch (err) {
    process.stdout.write(`UPLOAD FAILED: ${err.message}\n`);
    failed++;
  }
}

console.log(`
────────────────────────────────────────
  ✅  Copied  : ${copied}
  ⏭️   Skipped : ${skipped}  (already in R2)
  ❌  Failed  : ${failed}
────────────────────────────────────────
`);

if (failed > 0) {
  console.log("  Re-run the script to retry failed files.\n");
  process.exit(1);
}

console.log("  Migration complete. You can now remove the certificates bucket");
console.log("  from Supabase Storage to free up space (optional).\n");
