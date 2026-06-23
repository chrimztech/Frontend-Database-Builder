import { createFileRoute } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";

import { ORG_NAME } from "@/lib/cert";
import { verifyCertificateByCode } from "@/lib/api/certificates.functions";

export type CertRow = {
  certificate_id: string;
  certificate_code: string | null;
  recipient_name: string;
  programme: string;
  issue_date: string;
  expiry_date: string | null;
  status: "valid" | "revoked";
  issuer_name: string;
  revoked_at: string | null;
  revoke_reason: string | null;
} | null;

async function findCertificateByPublicCode(id: string): Promise<CertRow> {
  const response = await verifyCertificateByCode({
    data: { certificateCode: id },
  });

  return (response.certificate ?? null) as CertRow;
}
const certQuery = (id: string) =>
  queryOptions({
    queryKey: ["verify", id],
    queryFn: async (): Promise<CertRow> => findCertificateByPublicCode(id),
  });

export const Route = createFileRoute("/verify/$certificateId")({
  head: ({ params }) => ({
    meta: [
      { title: `Verify ${params.certificateId} - ${ORG_NAME}` },
      {
        name: "description",
        content: `Verify certificate ${params.certificateId} issued by ${ORG_NAME}.`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(certQuery(params.certificateId)),
});
