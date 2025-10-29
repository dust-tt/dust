import { z } from "zod";

import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { WebhookSourceSignatureAlgorithm } from "@app/types/triggers/webhooks";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS } from "@app/types/triggers/webhooks";

export type WebhookSourceFormValues = {
  name: string;
  description: string;
  icon: string;
  sharingSettings: Record<string, boolean>;
  signatureHeader?: string;
  signatureAlgorithm?: WebhookSourceSignatureAlgorithm;
};

export function getWebhookSourceFormDefaults(
  view: WebhookSourceViewForAdminType,
  webhookSourceWithViews?: { views: Array<{ spaceId: string }> },
  spaces?: Array<{ sId: string; kind: string }>
): WebhookSourceFormValues {
  const name = view.customName;

  const sharingSettings: Record<string, boolean> = {};

  if (spaces) {
    for (const space of spaces) {
      if (space.kind === "regular" || space.kind === "global") {
        sharingSettings[space.sId] = false;
      }
    }
  }

  if (webhookSourceWithViews && spaces) {
    for (const webhookView of webhookSourceWithViews.views) {
      const space = spaces.find((s) => s.sId === webhookView.spaceId);
      if (space && (space.kind === "regular" || space.kind === "global")) {
        sharingSettings[webhookView.spaceId] = true;
      }
    }
  } else if (webhookSourceWithViews) {
    for (const webhookView of webhookSourceWithViews.views) {
      sharingSettings[webhookView.spaceId] = true;
    }
  }

  return {
    name,
    description: view.description ?? "",
    icon: normalizeWebhookIcon(view.icon),
    sharingSettings,
    signatureHeader: view.webhookSource.signatureHeader ?? undefined,
    signatureAlgorithm: view.webhookSource.signatureAlgorithm ?? undefined,
  };
}

export function getWebhookSourceFormSchema() {
  return z.object({
    name: z.string().min(1, "Name is required."),
    description: z.string(),
    icon: z.string(),
    sharingSettings: z.record(z.boolean()),
    signatureHeader: z.string().optional(),
    signatureAlgorithm: z.enum(WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS).optional(),
  });
}

type FormDiffType = {
  requestBody?: {
    name: string;
    description?: string;
    icon?: string;
  };
  sharingChanges?: Array<{
    spaceId: string;
    action: "add" | "remove";
  }>;
  webhookSourceUpdates?: {
    signatureHeader?: string | null;
    signatureAlgorithm?: WebhookSourceSignatureAlgorithm | null;
  };
};

export function diffWebhookSourceForm(
  initial: WebhookSourceFormValues,
  current: WebhookSourceFormValues
): FormDiffType {
  const out: FormDiffType = {};

  const hasNameChange = current.name !== initial.name;
  const hasDescriptionChange = current.description !== initial.description;
  const hasIconChange = current.icon !== initial.icon;

  if (hasNameChange || hasDescriptionChange || hasIconChange) {
    const requestBody: {
      name: string;
      description?: string;
      icon?: string;
      signatureHeader?: string;
      signatureAlgorithm?: WebhookSourceSignatureAlgorithm;
    } = {
      name: current.name,
    };

    if (hasDescriptionChange) {
      requestBody.description = current.description;
    }

    if (hasIconChange) {
      requestBody.icon = current.icon;
    }

    out.requestBody = requestBody;
  }

  const sharingChanges: typeof out.sharingChanges = [];
  const allSpaceIds = new Set([
    ...Object.keys(initial.sharingSettings),
    ...Object.keys(current.sharingSettings),
  ]);
  for (const spaceId of allSpaceIds) {
    const wasEnabled = initial.sharingSettings[spaceId] ?? false;
    const isEnabled = current.sharingSettings[spaceId] ?? false;
    if (wasEnabled !== isEnabled) {
      sharingChanges.push({
        spaceId,
        action: isEnabled ? "add" : "remove",
      });
    }
  }
  if (sharingChanges.length > 0) {
    out.sharingChanges = sharingChanges;
  }

  const hasSignatureHeaderChange =
    current.signatureHeader !== initial.signatureHeader;
  const hasSignatureAlgorithmChange =
    current.signatureAlgorithm !== initial.signatureAlgorithm;
  if (hasSignatureHeaderChange || hasSignatureAlgorithmChange) {
    out.webhookSourceUpdates = {};
    if (hasSignatureHeaderChange) {
      out.webhookSourceUpdates.signatureHeader =
        current.signatureHeader ?? null;
    }
    if (hasSignatureAlgorithmChange) {
      out.webhookSourceUpdates.signatureAlgorithm =
        current.signatureAlgorithm ?? null;
    }
  }

  return out;
}
