import type { OrgSettings } from "./branding";

export interface IllustratorPayload {
  schemaVersion: 1;
  generatedAt: string;
  documentProfile: {
    textFrameNames: string[];
    placedItemNames: string[];
  };
  notes: string[];
  textFrames: Record<string, string>;
  placedItems: Record<string, string>;
}

export function buildIllustratorPayload(
  settings: OrgSettings,
): IllustratorPayload {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    documentProfile: {
      textFrameNames: [
        "org_name",
        "certificate_title",
        "certificate_subtitle",
        "recipient_name",
        "programme_name",
        "issue_date",
        "signatory1_name",
        "signatory1_title",
        "signatory2_name",
        "signatory2_title",
        "certificate_id",
        "nrc_number",
        "footer_text",
      ],
      placedItemNames: [
        "logo_asset",
        "seal_asset",
        "signature1_asset",
        "signature2_asset",
      ],
    },
    notes: [
      "Rename Illustrator text frames and placed items to match the keys in this file.",
      "Placed item values must be absolute local file paths on the computer running Illustrator.",
      "Values wrapped in double braces are placeholders you should replace before running the Illustrator script.",
    ],
    textFrames: {
      org_name: settings.org_name,
      certificate_title: "Certificate of Completion",
      certificate_subtitle:
        "Presented in recognition of successful course completion",
      recipient_name: "{{recipient_name}}",
      programme_name: "{{programme_name}}",
      issue_date: "{{issue_date}}",
      signatory1_name: settings.signatory1_name,
      signatory1_title: settings.signatory1_title,
      signatory2_name: settings.signatory2_name,
      signatory2_title: settings.signatory2_title,
      certificate_id: "{{certificate_id}}",
      nrc_number: "{{nrc_number}}",
      footer_text: `Issued by ${settings.org_name}`,
    },
    placedItems: {
      logo_asset: "",
      seal_asset: "",
      signature1_asset: "",
      signature2_asset: "",
    },
  };
}

export function downloadIllustratorPayload(
  payload: IllustratorPayload,
  fileName = "illustrator-certificate-payload.json",
) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
