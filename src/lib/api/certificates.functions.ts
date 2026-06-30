import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { createCertificateWithCode } from "../certificate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signPayload, verifySignature } from "../certificate-signing";
import { sendEmail, certificateEmailHtml } from "../email.server";
import { getPresignedUploadUrl, downloadFromR2, getPublicOrPresignedUrl } from "@/lib/r2.server";

function readLogoBuffer(): Buffer | null {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), "public/logo.png"));
  } catch {
    return null;
  }
}

export const generateCertificate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ enrolmentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { enrolmentId } = data;

    const [enrolmentRes, settingsRes] = await Promise.all([
      supabaseAdmin
        .from("enrolments")
        .select(
          "id, student_id, course_id, certificate_id, students(id, full_name, email, national_id), courses(id, prefix, name)",
        )
        .eq("id", enrolmentId)
        .maybeSingle(),
      supabaseAdmin.from("org_settings").select("org_name").eq("id", true).maybeSingle(),
    ]);

    if (enrolmentRes.error) throw enrolmentRes.error;
    if (!enrolmentRes.data) throw new Error("Enrolment not found");

    if (enrolmentRes.data.certificate_id) {
      throw new Error(
        "A certificate has already been issued for this enrolment. A student can only receive one certificate per course.",
      );
    }

    const enrolment = enrolmentRes.data;
    const student = enrolment.students as any;
    const course = enrolment.courses;
    const issuerName = (settingsRes.data as any)?.org_name ?? "UNZA TeLS";

    const cert = await createCertificateWithCode({
      enrolmentId: enrolment.id,
      courseId: enrolment.course_id,
      studentId: enrolment.student_id ?? null,
      recipientEmail: student?.email ?? null,
      recipientName: student?.full_name ?? null,
      programme: course?.name ?? null,
      nationalId: student?.national_id ?? null,
      coursePrefix: (course as any)?.prefix ?? null,
      issuerName,
    });

    return cert;
  });

export const markCertificateQueued = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { certificateId } = data;
    const { error } = await supabaseAdmin
      .from("certificates")
      .update({ email_status: "queued" })
      .eq("id", certificateId);
    if (error) throw error;
    return { ok: true };
  });

export const updateCertificatesStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateIds: z.array(z.string().uuid()), status: z.string() }))
  .handler(async ({ data }) => {
    const { certificateIds, status } = data;
    if (!certificateIds || certificateIds.length === 0) return { updated: 0 };
    const { data: updated, error } = await supabaseAdmin
      .from("certificates")
      .update({ email_status: status })
      .in("id", certificateIds);
    if (error) throw error;
    return { updated: (updated ?? []).length };
  });

export const signCertificate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { certificateId } = data;
    const { data: cert, error: fetchErr } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("id", certificateId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!cert) throw new Error("Certificate not found");

    const secret = process.env.CERT_SIGNING_SECRET;
    if (!secret) throw new Error("Signing secret not configured");

    const payload = {
      certificate_code: cert.certificate_code,
      issued_at: cert.issue_date ?? new Date().toISOString(),
      issuer_id: cert.issued_by ?? null,
    };
    const signature = signPayload(payload, secret);

    // signed_payload and signature are added via migration; cast until types regenerate
    const { error: updateErr } = await (supabaseAdmin.from("certificates") as any)
      .update({ signed_payload: payload, signature })
      .eq("id", certificateId);
    if (updateErr) throw updateErr;
    return { ok: true, signature };
  });

export const sendCertificateEmail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { certificateId } = data;
    console.log("[sendCertificateEmail] called for", certificateId);

    // Load certificate + student details
    const { data: cert, error: certErr } = await supabaseAdmin
      .from("certificates")
      .select(
        "id, certificate_id, certificate_code, programme, recipient_name, recipient_email, issue_date, email_status",
      )
      .eq("id", certificateId)
      .maybeSingle();
    if (certErr) throw certErr;
    if (!cert) throw new Error("Certificate not found");

    const toEmail = (cert as any).recipient_email as string | null;
    if (!toEmail)
      throw new Error(
        "This certificate has no recipient email address — update the student record first.",
      );

    // Resolve the PDF key. New flow uses certificate_code; legacy fallback to certificate_id.
    const pdfName = (cert as any).certificate_code ?? (cert as any).certificate_id;
    if (!pdfName) throw new Error("Certificate has no ID or code — cannot locate PDF.");

    const pdfKey = `${pdfName}.pdf`;

    // Download the PDF from R2
    const pdfBuffer = await downloadFromR2(pdfKey).catch((err) => {
      throw new Error(`Could not retrieve PDF from storage: ${err.message}`);
    });

    // Generate a shareable URL for the PDF (public URL or presigned 7-day link)
    const pdfUrl = await getPublicOrPresignedUrl(pdfKey);
    const appUrl = process.env.APP_URL ?? "https://tels.unza.ac.zm";
    const code = (cert as any).certificate_code ?? (cert as any).certificate_id ?? "";
    const verifyUrl = `${appUrl}/verify/${encodeURIComponent(code)}`;

    const recipientName = (cert as any).recipient_name ?? "Student";
    const programme = (cert as any).programme ?? "your programme";

    try {
      const logoBuffer = readLogoBuffer();
      const logoAttachment = logoBuffer
        ? [{ filename: "logo.png", content: logoBuffer, contentType: "image/png", cid: "logo@unza.ac.zm" }]
        : [];

      await sendEmail({
        to: toEmail,
        subject: `Your Certificate — ${programme}`,
        html: certificateEmailHtml({
          recipientName,
          programme,
          certificateCode: code,
          pdfUrl,
          verifyUrl,
          logoSrc: logoBuffer ? "cid:logo@unza.ac.zm" : undefined,
        }),
        text: `Dear ${recipientName},\n\nCongratulations! Your certificate for ${programme} has been issued.\n\nCertificate code: ${code}\nDownload: ${pdfUrl}\nVerify: ${verifyUrl}\n\nQuestions? Email train@unza.ac.zm or call +260 775 606 059.\n\nUNZA Technology e-Learning Services`,
        attachments: [
          ...logoAttachment,
          {
            filename: `Certificate-${pdfName}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });
    } catch (err: any) {
      console.error("[sendCertificateEmail] SMTP error:", err?.message ?? err);
      throw new Error(`Email delivery failed: ${err?.message ?? "unknown SMTP error"}`);
    }

    // Mark as sent
    await supabaseAdmin
      .from("certificates")
      .update({ email_status: "sent" })
      .eq("id", certificateId);

    return { ok: true, sentTo: toEmail };
  });

export const getCertificatePdfUploadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateCode: z.string() }))
  .handler(async ({ data }) => {
    const key = `${data.certificateCode}.pdf`;
    const presignedUrl = await getPresignedUploadUrl(key);
    return { presignedUrl, key };
  });

export const verifyCertificateByCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateCode: z.string() }))
  .handler(async ({ data }) => {
    const { certificateCode } = data;
    const { data: byCode, error } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("certificate_code", certificateCode)
      .maybeSingle();
    if (error) throw error;
    let cert = byCode;

    if (!cert) {
      const legacy = await supabaseAdmin
        .from("certificates")
        .select("*")
        .eq("certificate_id", certificateCode)
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      cert = legacy.data;
    }

    if (!cert) return { verified: false, reason: "not_found" };

    const c = cert as any;
    if (!c.signature || !c.signed_payload)
      return { verified: false, reason: "unsigned", certificate: cert };

    const secret = process.env.CERT_SIGNING_SECRET;
    const ok = secret ? verifySignature(c.signed_payload, c.signature, secret) : false;
    return { verified: ok, certificate: cert, reason: ok ? "ok" : "invalid_signature" };
  });
