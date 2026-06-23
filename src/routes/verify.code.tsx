import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/verify/code")({
  head: () => ({ meta: [{ title: "Verify certificate by code" }] }),
});
