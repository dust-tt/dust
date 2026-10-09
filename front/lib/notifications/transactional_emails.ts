import config from "@app/lib/api/config";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { createHash } from "crypto";
import chunk from "lodash/chunk";

// Novu rejects bulk triggers with more than 100 events.
const NOVU_BULK_TRIGGER_MAX_EVENTS = 100;

const EXTERNAL_SUBSCRIBER_ID_PREFIX = "email-";

/**
 * Preferences of workflows the recipient MUST receive regardless of their notification settings
 * (billing, security, invitations, login codes).
 */
export const TRANSACTIONAL_EMAIL_PREFERENCES = {
  all: { enabled: true, readOnly: true },
};

export type TransactionalEmailCopy = {
  subject: string;
  content: string;
  action?: { label: string; url: string };
};

// Transactional emails come from a no-reply sender: point recipients to support instead.
export function contactSupportLine(i18n: I18n): string {
  const supportEmail = config.getSupportEmailAddress().email;
  return i18n._(msg`If you have any questions, contact us at ${supportEmail}.`);
}

export type EmailRecipient = {
  subscriberId: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

/**
 * @cc [owner:Nils-Fedrigo,label:security] external-subscriber-id-namespace
 * Subscriber IDs of recipients without a Dust user MUST start with `EXTERNAL_SUBSCRIBER_ID_PREFIX`
 * followed by the SHA-256 hex digest of the trimmed, lower-cased address. They MUST NOT embed the
 * raw address and MUST NOT be a possible user sId, so they never resolve to a Dust user.
 */
function makeExternalSubscriberId(email: string): string {
  const digest = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `${EXTERNAL_SUBSCRIBER_ID_PREFIX}${digest}`;
}

export function isExternalSubscriberId(subscriberId: string): boolean {
  return subscriberId.startsWith(EXTERNAL_SUBSCRIBER_ID_PREFIX);
}

export function emailRecipientFromUser(user: {
  sId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}): EmailRecipient {
  return {
    subscriberId: user.sId,
    email: user.email,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
  };
}

/**
 * @cc [owner:Nils-Fedrigo,label:product;security] recipients-from-addresses
 * Returns one recipient per entry of `emails`, in order. When `UserResource.fetchByEmails` finds a
 * Dust user for the address who is an active member of `workspace` (the most recently updated one
 * if several), the recipient MUST be that user, with their sId as subscriber so the email follows
 * their own locale. Otherwise, including for users of other workspaces only, it MUST be an external
 * subscriber for the trimmed address, with no name.
 */
export async function emailRecipientsFromAddresses(
  workspace: LightWorkspaceType,
  emails: string[]
): Promise<EmailRecipient[]> {
  const users = await MembershipResource.filterActiveMembers({
    users: await UserResource.fetchByEmails(emails.map((e) => e.trim())),
    workspace,
  });
  const userByEmail = new Map<string, UserResource>();
  for (const user of users) {
    const key = user.email.toLowerCase();
    const current = userByEmail.get(key);
    if (!current || user.updatedAt.getTime() > current.updatedAt.getTime()) {
      userByEmail.set(key, user);
    }
  }

  return emails.map((email) => {
    const user = userByEmail.get(email.trim().toLowerCase());
    if (user) {
      return emailRecipientFromUser(user);
    }
    return {
      subscriberId: makeExternalSubscriberId(email),
      email: email.trim(),
    };
  });
}

/**
 * @cc [owner:Nils-Fedrigo,label:product] dev-internal-recipients-only
 * In development, recipients whose address does not end with `@dust.tt` MUST be dropped (with a
 * warning) and MUST NOT be sent to Novu.
 */
function filterRecipientsForEnvironment(
  workflowId: string,
  recipients: EmailRecipient[]
): EmailRecipient[] {
  if (!isDevelopment()) {
    return recipients;
  }
  const internal = recipients.filter((r) => r.email.endsWith("@dust.tt"));
  if (internal.length < recipients.length) {
    logger.warn(
      { workflowId, droppedCount: recipients.length - internal.length },
      "Dropping external email recipients in development mode."
    );
  }
  return internal;
}

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] trigger-email-workflow-result
 * Triggers `workflowId` once per recipient with the same `payload`. Returns `Ok` when every event
 * was accepted by Novu (or there is nobody to send to), `Err` when Novu rejected at least one event
 * or the call failed. It MUST NOT throw.
 */
export async function triggerEmailWorkflow({
  workflowId,
  recipients,
  payload,
}: {
  workflowId: string;
  recipients: EmailRecipient[];
  payload: Record<string, unknown>;
}): Promise<Result<void, Error>> {
  const to = filterRecipientsForEnvironment(workflowId, recipients);
  if (to.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();
    let failedCount = 0;
    for (const batch of chunk(to, NOVU_BULK_TRIGGER_MAX_EVENTS)) {
      const r = await novuClient.triggerBulk({
        events: batch.map((recipient) => ({
          workflowId,
          to: recipient,
          payload,
        })),
      });
      failedCount += r.result.filter((res) => !!res.error?.length).length;
    }
    if (failedCount > 0) {
      return new Err(
        new Error(
          `Novu rejected ${failedCount} of ${to.length} "${workflowId}" events`
        )
      );
    }
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
