import { supabaseAdmin } from '@/integrations/supabase/client.server';

function pad(num: number, size = 4) {
  return num.toString().padStart(size, '0');
}

export async function createCertificateWithCode({ enrolmentId, courseId, studentId, recipientEmail, recipientName, programme }: {
  enrolmentId: string;
  courseId: string;
  studentId: string | null;
  recipientEmail?: string | null;
  recipientName?: string;
  programme?: string;
}) {
  // Ensure running on the server with service role
  const admin = supabaseAdmin as any;
  // Start a transaction-like sequence using sequential queries
  // 1) ensure counter exists
  const ensure = await admin.from('certificate_counters').select('last_number').eq('course_id', courseId).maybeSingle();
  if (ensure.error) throw ensure.error;
  if (!ensure.data) {
    const ins = await admin.from('certificate_counters').insert({ course_id: courseId, last_number: 0 });
    if (ins.error) throw ins.error;
  }

  // 2) atomically increment and read
  const upd = await admin.rpc('increment_certificate_counter', { p_course_id: courseId });
  // If RPC not available, fall back to UPDATE ... RETURNING
  let nextNumber: number | null = null;
  if (upd && !upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
    nextNumber = upd.data[0].last_number;
  } else {
    const res = await admin.from('certificate_counters').update({ last_number: (ensure.data?.last_number ?? 0) + 1 }).eq('course_id', courseId).select('last_number').single();
    if (res.error) throw res.error;
    nextNumber = res.data.last_number;
  }

  if (nextNumber == null) throw new Error('Failed to allocate certificate number');

  // 3) build the certificate_code using course prefix
  const courseRes = await admin.from('courses').select('prefix').eq('id', courseId).maybeSingle();
  if (courseRes.error) throw courseRes.error;
  const prefix = courseRes.data?.prefix ?? 'CERT';
  const date = new Date().toISOString().slice(0,10).replace(/-/g,''); // YYYYMMDD
  const code = `${prefix}-${date}-${pad(nextNumber,4)}`;

  // 4) insert certificate record
  const insertPayload: any = {
    certificate_code: code,
    course_id: courseId,
    student_id: studentId,
    recipient_email: recipientEmail ?? null,
    recipient_name: recipientName ?? null,
    programme: programme ?? null,
    email_status: 'not_sent'
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
