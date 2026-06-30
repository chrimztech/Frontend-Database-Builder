/**
 * Restores data from a full JSON backup into a fresh Supabase project.
 *
 * Usage:
 *   node scripts/restore-from-backup.mjs ./unza-tels-full-backup-2026-xx-xx.json
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env / .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env files
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
  } catch { /* file may not exist */ }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env/.env.local");
  process.exit(1);
}

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("❌  Provide the backup file path as an argument:");
  console.error("    node scripts/restore-from-backup.mjs ./unza-tels-full-backup-2026-xx-xx.json");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(resolve(process.cwd(), backupPath), "utf-8"));
const tables = backup.tables;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

console.log(`\n🔄  Restoring backup from: ${backupPath}`);
console.log(`    Target: ${SUPABASE_URL}\n`);

async function upsertTable(name, rows, conflictColumn = "id") {
  if (!rows || rows.length === 0) {
    console.log(`    ${name}: no rows — skipped`);
    return;
  }

  // Insert in chunks of 500 to avoid request size limits
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(name)
      .upsert(chunk, { onConflict: conflictColumn, ignoreDuplicates: false });
    if (error) {
      console.error(`    ❌  ${name} chunk ${i}–${i + chunk.length}: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }
  console.log(`    ✅  ${name}: ${inserted} / ${rows.length} rows restored`);
}

// Restore in dependency order (parent tables first)
await upsertTable("org_settings",       tables.org_settings);
await upsertTable("courses",            tables.courses);
await upsertTable("students",           tables.students);
await upsertTable("enrolments",         tables.enrolments);
await upsertTable("certificates",       tables.certificates);
await upsertTable("student_access_log", tables.student_access_log);

// user_roles — skip if empty or if admin users haven't been re-invited yet
if (tables.user_roles?.length) {
  console.log(`\n    ⚠️   user_roles has ${tables.user_roles.length} row(s).`);
  console.log("        Skipping — re-invite admins manually after they sign up on the new project.");
}

console.log("\n✅  Restore complete.\n");
console.log("    Next steps:");
console.log("    1. Go to new Supabase → Authentication → invite each admin user by email");
console.log("    2. After they sign up, run the SQL below to grant admin role:");
console.log("       INSERT INTO user_roles (user_id, role)");
console.log("       SELECT id, 'admin' FROM auth.users WHERE email = 'their@email.com';\n");
