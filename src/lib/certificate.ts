import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomSuffix(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes as Uint8Array)
    .map((b: number) => b % 10)
    .join("");
}

export async function createCertificateWithCode({
  enrolmentId,
  courseId,
  studentId,
  recipientEmail,
  recipientName,
  programme,
  nationalId,
  coursePrefix,
  issuerName,
}: {
  enrolmentId: string;
  courseId: string;
  studentId: string | null;
  recipientEmail?: string | null;
  recipientName?: string;
  programme?: string;
  nationalId?: string | null;
  coursePrefix?: string | null;
  issuerName?: string | null;
}) {
  const admin = supabaseAdmin as any;
  const currentYear = new Date().getFullYear();
  const prefix = coursePrefix ? coursePrefix.toUpperCase().replace(/[^A-Z0-9]/g, "") : "CERT";

  // Generate a cryptographically random code: PREFIX + YEAR + 8 random digits
  // e.g. PMP202647293815 — unpredictable, not guessable from adjacent codes.
  //
  // The DB has a UNIQUE constraint on certificate_code so no two certificates
  // can ever share a code regardless of race conditions. On the rare collision
  // (error code 23505) we generate a fresh code and retry rather than pre-checking
  // with a SELECT (which has a race window anyway).
  let insert: any;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `${prefix}${currentYear}${randomSuffix(8)}`;
    insert = await admin
      .from("certificates")
      .insert({
        certificate_id: code,
        certificate_code: code,
        issue_date: new Date().toISOString().split("T")[0],
        issuer_name: issuerName ?? "UNZA TeLS",
        course_id: courseId,
        student_id: studentId,
        recipient_email: recipientEmail ?? null,
        recipient_name: recipientName ?? null,
        programme: programme ?? null,
        national_id: nationalId ?? null,
        email_status: "not_sent",
      })
      .select("id, certificate_id, certificate_code")
      .single();

    if (!insert.error) break;
    // 23505 = unique_violation — another record already has this code, try again
    if (insert.error.code !== "23505") throw insert.error;
  }
  if (insert.error) throw new Error("Could not allocate a unique certificate code — please try again.");

  const code = insert.data.certificate_code;
  if (insert.data.certificate_id !== code) {
    throw new Error("Certificate ID guard failed. The generated code was not stored consistently.");
  }

  if (enrolmentId) {
    const enc = await admin
      .from("enrolments")
      .update({ certificate_id: insert.data.id })
      .eq("id", enrolmentId);
    if (enc.error) throw enc.error;
  }

  return insert.data;
}
