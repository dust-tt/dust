import { createHmac, timingSafeEqual } from "crypto";

import type {
  WebhookSourceSignatureAlgorithm,
  WebhookSourceWithViews,
} from "@app/types/triggers/webhooks";

export const filterWebhookSource = (
  webhookSource: WebhookSourceWithViews,
  filterValue: string
) => {
  {
    return (
      webhookSource.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      webhookSource.views.some(
        (view) =>
          view?.customName !== null &&
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
