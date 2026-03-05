import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import type {
  WebhookSourceForAdminType,
  WebhookSourceSignatureAlgorithm,
  WebhookSourceWithViewsType,
} from "@app/types/triggers/webhooks";
import { createHmac, timingSafeEqual } from "crypto";

export const DEFAULT_WEBHOOK_ICON: InternalAllowedIconType =
  "ActionGlobeAltIcon" as const;

export const normalizeWebhookIcon = (
  icon: string | null | undefined
): InternalAllowedIconType | CustomResourceIconType => {
  if (!icon) {
    return DEFAULT_WEBHOOK_ICON;
  }

  if (isInternalAllowedIcon(icon) || isCustomResourceIconType(icon)) {
    return icon;
  }

  return DEFAULT_WEBHOOK_ICON;
};

export const filterWebhookSource = (
  webhookSource: WebhookSourceWithViewsType,
  filterValue: string
) => {
  {
    return (
      webhookSource.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      webhookSource.views.some((view) =>
        view?.customName.toLowerCase().includes(filterValue.toLowerCase())
      ) ||
      (webhookSource.provider?.toLowerCase() ?? "custom").includes(
        filterValue.toLowerCase()
      )
    );
  }
};

export const verifySignature = ({
  signedContent,
  secret,
  signature,
  algorithm,
}: {
  signedContent: string;
  secret: string;
  signature: string;
  algorithm: WebhookSourceSignatureAlgorithm;
}): boolean => {
  if (!secret || !signature) {
    return false;
  }

  // Try "{algorithm}={hex}" format first (GitHub-style).
  const prefixedHex = `${algorithm}=${createHmac(algorithm, secret)
    .update(signedContent, "utf8")
    .digest("hex")}`;
  if (safeCompare(signature, prefixedHex)) {
    return true;
  }

  // Try raw base64 format (HelpScout, etc.).
  const rawBase64 = createHmac(algorithm, secret)
    .update(signedContent, "utf8")
    .digest("base64");
  if (safeCompare(signature, rawBase64)) {
    return true;
  }

  return false;
};

function safeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // Length mismatch.
    return false;
  }
}

export const buildWebhookUrl = ({
  apiBaseUrl,
  workspaceId,
  webhookSource,
}: {
  apiBaseUrl: string;
  workspaceId: string;
  webhookSource: WebhookSourceForAdminType;
}): string => {
  return `${apiBaseUrl}/api/v1/w/${workspaceId}/triggers/hooks/${webhookSource.sId}/${webhookSource.urlSecret}`;
};
