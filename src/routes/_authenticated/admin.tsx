import { createFileRoute } from "@tanstack/react-router";

import { ORG_NAME } from "@/lib/cert";

export type SectionId =
  | "overview"
  | "students"
  | "profiles"
  | "users"
  | "courses"
  | "enrolments"
  | "certificates"
  | "pending"
  | "email-queue"
  | "reports"
  | "audit"
  | "branding"
  | "template"
  | "settings";

const SECTION_IDS = new Set<SectionId>([
  "overview",
  "students",
  "profiles",
  "users",
  "courses",
  "enrolments",
  "certificates",
  "pending",
  "email-queue",
  "reports",
  "audit",
  "branding",
  "template",
  "settings",
]);

function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && SECTION_IDS.has(value as SectionId);
}

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: isSectionId(search.section) ? search.section : "overview",
  }),
  head: () => ({
    meta: [{ title: `Admin - ${ORG_NAME}` }, { name: "robots", content: "noindex" }],
  }),
});
