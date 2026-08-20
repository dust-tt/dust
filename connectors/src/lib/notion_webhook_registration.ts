import crypto from "node:crypto";

import { NotionWebhookRegistrationModel } from "@connectors/lib/models/notion_webhook_registration";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

const NOTION_WEBHOOK_REGISTRATION_TTL_MS = 15 * 60 * 1000;

type NotionWebhookRegistrationErrorCode =
  | "expired"
  | "invalid"
  | "used_with_different_secret";

export class NotionWebhookRegistrationError extends Error {
  constructor(public readonly code: NotionWebhookRegistrationErrorCode) {
    super(code);
    this.name = "NotionWebhookRegistrationError";
  }
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export async function issueNotionWebhookRegistration({
  notionWorkspaceId,
  now = new Date(),
}: {
  notionWorkspaceId: string;
  now?: Date;
}): Promise<{ expiresAt: Date; registrationToken: string }> {
  const registrationToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    now.getTime() + NOTION_WEBHOOK_REGISTRATION_TTL_MS
  );

  await NotionWebhookRegistrationModel.upsert({
    expiresAt,
    notionWorkspaceId,
    signingSecretHash: null,
    tokenHash: hash(registrationToken),
    usedAt: null,
  });

  return { expiresAt, registrationToken };
}

export async function redeemNotionWebhookRegistration({
  notionWorkspaceId,
  now = new Date(),
  registrationToken,
  signingSecret,
  storeSigningSecret,
}: {
  notionWorkspaceId: string;
  now?: Date;
  registrationToken: string;
  signingSecret: string;
  storeSigningSecret: () => Promise<void>;
}): Promise<
  Result<{ alreadyRedeemed: boolean }, NotionWebhookRegistrationError>
> {
  return withTransaction(async (transaction) => {
    const registration = await NotionWebhookRegistrationModel.findOne({
      where: { notionWorkspaceId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (
      !registration ||
      !hashesMatch(registration.tokenHash, hash(registrationToken))
    ) {
      return new Err(new NotionWebhookRegistrationError("invalid"));
    }

    const signingSecretHash = hash(signingSecret);
    if (registration.usedAt) {
      if (
        registration.signingSecretHash &&
        hashesMatch(registration.signingSecretHash, signingSecretHash)
      ) {
        return new Ok({ alreadyRedeemed: true });
      }
      return new Err(
        new NotionWebhookRegistrationError("used_with_different_secret")
      );
    }

    if (registration.expiresAt.getTime() <= now.getTime()) {
      return new Err(new NotionWebhookRegistrationError("expired"));
    }

    await storeSigningSecret();
    await registration.update(
      {
        signingSecretHash,
        usedAt: now,
      },
      { transaction }
    );

    return new Ok({ alreadyRedeemed: false });
  });
}
