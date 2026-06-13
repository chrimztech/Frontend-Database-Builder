import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createCertificateWithCode } from "../certificate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signPayload, verifySignature } from "../certificate-signing";

export const generateCertificate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ enrolmentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { enrolmentId } = data;
    // load enrolment details
    const { data: enrolment, error: enErr } = await supabaseAdmin.from('enrolments').select('id, student_id, course_id, students(id, full_name, email), courses(id, prefix, name)').eq('id', enrolmentId).maybeSingle();
    if (enErr) throw enErr;
    if (!enrolment) throw new Error('Enrolment not found');

    const student = enrolment.students;
    const course = enrolment.courses;

    const cert = await createCertificateWithCode({
      enrolmentId: enrolment.id,
      courseId: enrolment.course_id,
      studentId: enrolment.student_id ?? null,
      recipientEmail: student?.email ?? null,
      recipientName: student?.full_name ?? null,
      programme: course?.name ?? null,
    });

    return cert;
  });

export const markCertificateQueued = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { certificateId } = data;
    const { error } = await supabaseAdmin.from('certificates').update({ email_status: 'queued' }).eq('id', certificateId);
    if (error) throw error;
    return { ok: true };
  });

export const updateCertificatesStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ certificateIds: z.array(z.string().uuid()), status: z.string() }))
  .handler(async ({ data }) => {
    const { certificateIds, status } = data;
    if (!certificateIds || certificateIds.length === 0) return { updated: 0 };
    const { data: updated, error } = await supabaseAdmin
      .from('certificates')
      .update({ email_status: status })
      .in('id', certificateIds);
    if (error) throw error;
    return { updated: (updated ?? []).length };
  });

export const signCertificate = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { certificateId } = data;
    const { data: cert, error: fetchErr } = await supabaseAdmin.from('certificates').select('*').eq('id', certificateId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!cert) throw new Error('Certificate not found');

    const secret = process.env.CERT_SIGNING_SECRET;
    if (!secret) throw new Error('Signing secret not configured');

    const payload = { certificate_code: cert.certificate_code, issued_at: cert.issue_date ?? new Date().toISOString(), issuer_id: cert.issued_by ?? null };
    const signature = signPayload(payload, secret);

    // signed_payload and signature are added via migration; cast until types regenerate
    const { error: updateErr } = await (supabaseAdmin.from('certificates') as any).update({ signed_payload: payload, signature }).eq('id', certificateId);
    if (updateErr) throw updateErr;
    return { ok: true, signature };
  });

export const verifyCertificateByCode = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ certificateCode: z.string() }))
  .handler(async ({ data }) => {
    const { certificateCode } = data;
    const { data: cert, error } = await supabaseAdmin.from('certificates').select('*').eq('certificate_code', certificateCode).maybeSingle();
    if (error) throw error;
    if (!cert) return { verified: false, reason: 'not_found' };

    const c = cert as any;
    if (!c.signature || !c.signed_payload) return { verified: false, reason: 'unsigned', certificate: cert };

    const secret = process.env.CERT_SIGNING_SECRET;
    const ok = secret ? verifySignature(c.signed_payload, c.signature, secret) : false;
    return { verified: ok, certificate: cert, reason: ok ? 'ok' : 'invalid_signature' };
  });
