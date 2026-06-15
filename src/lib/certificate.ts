import { supabaseAdmin } from '@/integrations/supabase/client.server';

function pad(num: number, size = 4) {
  return num.toString().padStart(size, '0');
}

export async function createCertificateWithCode({ enrolmentId, courseId, studentId, recipientEmail, recipientName, programme, nationalId, coursePrefix }: {
  enrolmentId: string;
  courseId: string;
  studentId: string | null;
  recipientEmail?: string | null;
  recipientName?: string;
  programme?: string;
  nationalId?: string | null;
  coursePrefix?: string | null;
}) {
  const admin = supabaseAdmin as any;
  const currentYear = new Date().getFullYear();

  // 1) Atomically increment the per-course, per-year counter via RPC.
  //    The RPC creates the row if absent and resets to 1 when the year rolls over.
  const upd = await admin.rpc('increment_certificate_counter', {
    p_course_id: courseId,
    p_year: currentYear,
  });

  let nextNumber: number | null = null;
  if (upd && !upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
    nextNumber = upd.data[0].last_number;
  } else {
    // Fallback (RPC not yet updated): manual upsert for current year row
    const ensure = await admin
      .from('certificate_counters')
      .select('last_number')
      .eq('course_id', courseId)
      .eq('year_issued', currentYear)
      .maybeSingle();
    if (ensure.error) throw ensure.error;

    if (!ensure.data) {
      await admin.from('certificate_counters').insert({ course_id: courseId, last_number: 0, year_issued: currentYear });
    }
    const res = await admin
      .from('certificate_counters')
      .update({ last_number: (ensure.data?.last_number ?? 0) + 1 })
      .eq('course_id', courseId)
      .eq('year_issued', currentYear)
      .select('last_number')
      .single();
    if (res.error) throw res.error;
    nextNumber = res.data.last_number;
  }

  if (nextNumber == null) throw new Error('Failed to allocate certificate number');

  // 2) Certificate code: PREFIX + YYYY + 7-digit annual sequence.
  //    Sequence resets to 0000001 each year per course.
  //    Example: SCM20260000001, SCM20260000002 … SCM20270000001 (new year → resets)
  const prefix = coursePrefix ? coursePrefix.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const code = `${prefix}${currentYear}${pad(nextNumber, 7)}`;

  // 4) insert certificate record
  const insertPayload: any = {
    certificate_code: code,
    course_id: courseId,
    student_id: studentId,
    recipient_email: recipientEmail ?? null,
    recipient_name: recipientName ?? null,
    programme: programme ?? null,
    national_id: nationalId ?? null,
    email_status: 'not_sent',
  };

  const insert = await admin.from('certificates').insert(insertPayload).select('id, certificate_code').single();
  if (insert.error) throw insert.error;

  // 5) link enrolment -> certificate_id if enrolment exists
  if (enrolmentId) {
    const enc = await admin.from('enrolments').update({ certificate_id: insert.data.id }).eq('id', enrolmentId);
    if (enc.error) throw enc.error;
  }

  return insert.data;
}
