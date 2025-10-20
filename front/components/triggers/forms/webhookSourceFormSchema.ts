import { z } from "zod";

import { DEFAULT_WEBHOOK_ICON } from "@app/lib/webhookSource";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

export type WebhookSourceFormValues = {
  name: string;
  description: string;
  icon: string;
  sharingSettings: Record<string, boolean>;
};

export function getWebhookSourceFormDefaults(
  view: WebhookSourceViewType,
  webhookSourceWithViews?: { views: Array<{ spaceId: string }> },
  spaces?: Array<{ sId: string; kind: string }>
): WebhookSourceFormValues {
  const name = view.customName ?? view.webhookSource.name;

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
    icon: view.icon ?? DEFAULT_WEBHOOK_ICON,
    sharingSettings,
  };
}

export function getWebhookSourceFormSchema() {
  return z.object({
    name: z.string().min(1, "Name is required."),
    description: z.string(),
    icon: z.string(),
    sharingSettings: z.record(z.boolean()),
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

  return out;
}
