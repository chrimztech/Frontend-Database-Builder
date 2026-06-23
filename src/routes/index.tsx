import { createFileRoute } from "@tanstack/react-router";

import { ORG_NAME } from "@/lib/cert";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${ORG_NAME} - Verify a Certificate` },
      {
        name: "description",
        content: `Verify the authenticity of certificates issued by ${ORG_NAME}.`,
      },
    ],
  }),
});
