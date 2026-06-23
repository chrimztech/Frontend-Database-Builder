import { createFileRoute } from "@tanstack/react-router";

import { ORG_NAME } from "@/lib/cert";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Staff sign in - ${ORG_NAME}` },
      { name: "robots", content: "noindex" },
    ],
  }),
});
