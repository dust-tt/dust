import { createHmac, timingSafeEqual } from "crypto";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import type {
  WebhookSourceSignatureAlgorithm,
  WebhookSourceWithViewsType,
} from "@app/types/triggers/webhooks";

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

  const expectedSignature = `${algorithm}=${createHmac(algorithm, secret)
    .update(signedContent, "utf8")
    .digest("hex")}`;

  // timingSafeEqual requires buffers of equal length
  // Return false immediately if it throws an error
  try {
    const isValid = timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    return isValid;
  } catch (e) {
    return false;
  }
};

export const buildWebhookUrl = ({
  apiBaseUrl,
  workspaceSId,
  webhookSourceSId,
  urlSecret,
}: {
  apiBaseUrl: string;
  workspaceSId: string;
  webhookSourceSId: string;
  urlSecret: string;
}): string => {
  return `${apiBaseUrl}/api/v1/w/${workspaceSId}/triggers/hooks/${webhookSourceSId}/${urlSecret}`;
};
