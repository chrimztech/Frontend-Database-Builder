type CertificateDeliveryRecord = {
  id: string;
  certificate_id: string;
  certificate_code: string | null;
  recipient_name: string;
  recipient_email?: string | null;
  programme: string;
  issue_date: string;
  issuer_name?: string | null;
  national_id?: string | null;
};

function getCertificateCode(cert: Pick<CertificateDeliveryRecord, "certificate_code" | "certificate_id">) {
  return cert.certificate_code || cert.certificate_id;
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const message = (error as any).message ?? (error as any).data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return String(error ?? "Unknown error");
}

function isMissingPdfError(error: unknown) {
  return getErrorMessage(error).includes("Could not retrieve PDF from storage");
}

export async function sendCertificateEmailWithRepair(cert: CertificateDeliveryRecord) {
  const { sendCertificateEmail } = await import("@/lib/api/certificates.functions");

  try {
    return await sendCertificateEmail({ data: { certificateId: cert.id } });
  } catch (error) {
    if (!isMissingPdfError(error)) throw error;

    console.warn("[email] certificate PDF missing, regenerating before retry", {
      certificateId: cert.id,
      certificateCode: getCertificateCode(cert),
    });

    const { uploadCertificatePdf } = await import("@/lib/pdf");
    await uploadCertificatePdf({
      certificateId: getCertificateCode(cert),
      recipientName: cert.recipient_name,
      programme: cert.programme,
      issueDate: cert.issue_date,
      issuerName: cert.issuer_name ?? undefined,
      nrcNumber: cert.national_id ?? undefined,
    });

    return await sendCertificateEmail({ data: { certificateId: cert.id } });
  }
}

export function certificateSendErrorMessage(error: unknown) {
  return getErrorMessage(error);
}
