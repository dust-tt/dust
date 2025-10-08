import { z } from "zod";

import { DEFAULT_WEBHOOK_ICON } from "@app/lib/webhookSource";
import type { WebhookSourceView } from "@app/types/triggers/webhooks";

export type WebhookSourceFormValues = {
  name: string;
  description: string;
  icon: string;
  sharingSettings: Record<string, boolean>;
};

export function getWebhookSourceFormDefaults(
  view: WebhookSourceView,
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
  name?: string;
  description?: string;
  icon?: string;
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

  if (current.name !== initial.name) {
    out.name = current.name;
  }

  if (current.description !== initial.description) {
    out.description = current.description;
  }

  if (current.icon !== initial.icon) {
    out.icon = current.icon;
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
