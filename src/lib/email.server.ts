import nodemailer from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Email not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env.local"
    );
  }

  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

export async function sendEmail({
  to, subject, html, text, attachments,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
}) {
  const from = process.env.SMTP_FROM ?? `"UNZA TeLS" <train@unza.ac.zm>`;
  const transport = createTransport();
  await transport.sendMail({ from, to, subject, html, text, attachments });
}

export function certificateEmailHtml({
  recipientName, programme, certificateCode, pdfUrl, verifyUrl,
}: {
  recipientName: string;
  programme: string;
  certificateCode: string;
  pdfUrl: string;
  verifyUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#1a5c2e;padding:28px 40px;text-align:center">
            <p style="margin:0;color:#c9a44c;font-size:13px;letter-spacing:2px;text-transform:uppercase">University of Zambia</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700">Technology e-Learning Services</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a">Dear <strong>${recipientName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6">
              Congratulations! Your certificate of completion for the programme
              <strong>${programme}</strong> has been issued. Please find your certificate attached to this email.
            </p>

            <!-- Certificate code box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="background:#edf7f0;border:1px solid #b5d9c4;border-radius:6px;padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px">Certificate code</p>
                  <p style="margin:0;font-size:20px;font-weight:700;color:#1a5c2e;letter-spacing:2px;font-family:monospace">${certificateCode}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 12px;font-size:14px;color:#444">
              You can also download your certificate or verify its authenticity online:
            </p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
              <tr>
                <td style="padding-right:12px">
                  <a href="${pdfUrl}" style="display:inline-block;background:#c9a44c;color:#1a5c2e;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:6px">
                    Download PDF
                  </a>
                </td>
                <td>
                  <a href="${verifyUrl}" style="display:inline-block;background:#edf7f0;color:#1a5c2e;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;border:1px solid #b5d9c4">
                    Verify certificate
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:14px;color:#666;line-height:1.5">
              If you have any questions please contact us at
              <a href="mailto:train@unza.ac.zm" style="color:#1a5c2e">train@unza.ac.zm</a>
              or call +260 775 606 059.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;border-top:1px solid #eee;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:12px;color:#999">
              University of Zambia · Technology e-Learning Services<br>
              This is an automated message — please do not reply directly to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
