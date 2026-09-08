import type {
  EmailAttachment,
  EmailTriggerError,
  InboundEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import {
  makeEmailAgentsDisabledEmailTriggerError,
  makeUserNotFoundEmailTriggerError,
  makeWorkspaceNotFoundEmailTriggerError,
  replyToEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import {
  extractEmailAddressesFromHeader,
  extractSingleEmailAddressFromHeader,
  parseHeaderValue,
} from "@app/lib/api/assistant/email/header_parsing";
import { parseSendgridDkimResults } from "@app/lib/api/assistant/email/inbound_auth";
import {
  createBufferedRequestFromRawBody,
  isSendgridParseFormRequest,
} from "@app/lib/api/assistant/email/sendgrid_parse_webhook_signature";
import { config as cellsConfig } from "@app/lib/api/cells/config";
import apiConfig from "@app/lib/api/config";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { withRetry } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { CellInfo } from "@app/types/cell";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { IncomingForm } from "formidable";
import { readFile } from "fs/promises";

/**
 * Node-style headers shape: matches the record built from
 * `Headers.forEach(...)` in the Hono adapter and the legacy `IncomingMessage`
 * headers shape.
 */
export type EmailWebhookHeaders = Record<string, string | string[] | undefined>;

export const EMAIL_WEBHOOK_RELAY_HEADER = "x-dust-email-webhook-relayed";
const EMAIL_WEBHOOK_RELAY_SOURCE_CELL_HEADER =
  "x-dust-email-webhook-source-cell";
export const EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER =
  "x-dust-email-webhook-source-error";
export const EMAIL_WEBHOOK_RELAY_REMAINING_CELLS_HEADER =
  "x-dust-email-webhook-remaining-cells";
export const EMAIL_WEBHOOK_RELAY_HEADER_VALUE = "1";

const EMAIL_RELAY_KEY_PREFIX = "email-webhook-relay";
const EMAIL_RELAY_DEDUPE_TTL_SECONDS = 5 * 60;
const HTTP_SERVER_ERROR_STATUS_MIN = 500;

function isRelayedWebhookRequest(headers: EmailWebhookHeaders): boolean {
  return (
    headers[EMAIL_WEBHOOK_RELAY_HEADER] === EMAIL_WEBHOOK_RELAY_HEADER_VALUE
  );
}

const RELAY_ELIGIBLE_ERROR_TYPES = [
  "user_not_found",
  "workspace_not_found",
  "email_agents_disabled",
] as const;

type RelayEligibleErrorType = (typeof RELAY_ELIGIBLE_ERROR_TYPES)[number];

function isRelayEligibleErrorType(
  value: string
): value is RelayEligibleErrorType {
  return RELAY_ELIGIBLE_ERROR_TYPES.some((type) => type === value);
}

function isRelayEligibleError(error: EmailTriggerError): boolean {
  return isRelayEligibleErrorType(error.type);
}

/**
 * @cc [owner:philipperolet,label:product] remaining-relay-cells
 * Relayed requests may only visit configured cells listed in the remaining-cells header;
 * legacy relays without that header must not relay again.
 */
function getEmailRelayCells(headers: EmailWebhookHeaders): CellInfo[] {
  const cells = cellsConfig.getOtherCells();
  if (!isRelayedWebhookRequest(headers)) {
    return cells;
  }

  const remainingCells = headers[EMAIL_WEBHOOK_RELAY_REMAINING_CELLS_HEADER];
  if (!isString(remainingCells)) {
    return [];
  }
  const remaining = new Set(remainingCells.split(","));
  return cells.filter((cell) => remaining.has(cell.name));
}

export function shouldRelayToOtherCells({
  headers,
  error,
}: {
  headers: EmailWebhookHeaders;
  error: EmailTriggerError;
}): boolean {
  return isRelayEligibleError(error) && getEmailRelayCells(headers).length > 0;
}

// Ordered from least to most informative: a user unknown in one cell may still
// exist in the other, and a user without an enabled workspace in one cell may
// still have one in the other.
const RELAY_ERROR_INFORMATIVENESS: Record<RelayEligibleErrorType, number> = {
  user_not_found: 0,
  workspace_not_found: 1,
  email_agents_disabled: 2,
};

/**
 * Carry the most informative lookup error across relay hops, for the final cell's
 * error reply. The source cell's error type (forwarded via header) may
 * be more informative than the local one — e.g. the sender has a real account with
 * Email Agents disabled in the source cell but no account locally; replying with
 * the local `user_not_found` ("please sign up") would be wrong.
 */
export function resolveRelayedErrorReply({
  headers,
  localError,
  senderEmail,
}: {
  headers: EmailWebhookHeaders;
  localError: EmailTriggerError;
  senderEmail: string;
}): EmailTriggerError {
  if (!isRelayedWebhookRequest(headers)) {
    return localError;
  }

  const sourceErrorType = headers[EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER];
  if (
    !isString(sourceErrorType) ||
    !isRelayEligibleErrorType(sourceErrorType) ||
    !isRelayEligibleErrorType(localError.type) ||
    RELAY_ERROR_INFORMATIVENESS[sourceErrorType] <=
      RELAY_ERROR_INFORMATIVENESS[localError.type]
  ) {
    return localError;
  }

  switch (sourceErrorType) {
    // Unreachable given the informativeness check above (rank 0 is never strictly
    // greater), kept for exhaustiveness.
    case "user_not_found":
      return makeUserNotFoundEmailTriggerError(senderEmail);
    case "workspace_not_found":
      return makeWorkspaceNotFoundEmailTriggerError(senderEmail);
    case "email_agents_disabled":
      return makeEmailAgentsDisabledEmailTriggerError();
    default:
      return assertNever(sourceErrorType);
  }
}

export function hasValidSendgridAuthorization(
  authHeader: string | undefined
): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "ascii"
  );
  const [username, password] = credentials.split(":");

  return (
    username === "sendgrid" && password === apiConfig.getEmailWebhookSecret()
  );
}

export function hasValidRelayAuthorization(
  headers: EmailWebhookHeaders
): boolean {
  const authHeader = headers.authorization;
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  return (
    isRelayedWebhookRequest(headers) &&
    authHeader.slice("Bearer ".length) === cellsConfig.getLookupApiSecret()
  );
}

function makeEmailRelayKey(messageId: string): string {
  return `${EMAIL_RELAY_KEY_PREFIX}:${messageId}`;
}

export async function recordEmailRelay(
  messageId: string | null
): Promise<boolean> {
  if (!messageId) {
    return true;
  }

  const redis = await getRedisStreamClient({ origin: "email_context" });
  const result = await redis.set(makeEmailRelayKey(messageId), "1", {
    NX: true,
    EX: EMAIL_RELAY_DEDUPE_TTL_SECONDS,
  });

  return result === "OK";
}

/**
 * @cc [owner:philipperolet,label:product] relay-handoff
 * Each relay passes only the cells after its target as remaining destinations, and stops
 * after a successful HTTP handoff. The receiving cell owns further lookup and error replies.
 */
export async function relayEmailToOtherCells(
  email: InboundEmail,
  {
    sourceError,
    headers: requestHeaders,
  }: {
    sourceError: EmailTriggerError;
    headers: EmailWebhookHeaders;
  }
): Promise<Result<void, Error>> {
  try {
    const cells = getEmailRelayCells(requestHeaders);

    const headers = {
      Authorization: `Bearer ${cellsConfig.getLookupApiSecret()}`,
      [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
      [EMAIL_WEBHOOK_RELAY_SOURCE_CELL_HEADER]:
        cellsConfig.getCurrentCell().name,
      [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: sourceError.type,
    };

    const body = new FormData();
    body.set("subject", email.subject);
    body.set("text", email.text);
    body.set("from", email.sender.full);
    body.set("SPF", email.auth.SPF);
    body.set("dkim", email.auth.dkimRaw);
    body.set("envelope", JSON.stringify(email.envelope));

    if (email.rawHeaders) {
      body.set("headers", email.rawHeaders);
    }

    for (const [index, attachment] of email.attachments.entries()) {
      const buffer = await readFile(attachment.filepath);
      body.append(
        `attachment_${index}`,
        new Blob([buffer], { type: attachment.contentType }),
        attachment.filename
      );
    }

    for (const [index, cell] of cells.entries()) {
      const responseRes = await withRetry(
        async () => {
          const response = await fetch(`${cell.url}/api/email/webhook`, {
            method: "POST",
            headers: {
              ...headers,
              [EMAIL_WEBHOOK_RELAY_REMAINING_CELLS_HEADER]: cells
                .slice(index + 1)
                .map((remainingCell) => remainingCell.name)
                .join(","),
            },
            body,
          });

          if (response.status >= HTTP_SERVER_ERROR_STATUS_MIN) {
            throw new Error(
              `Relay to ${cell.name} failed with status ${response.status}: ${response.statusText}`
            );
          }
          return response;
        },
        {
          shouldRetry: (error) => {
            logger.warn(
              {
                error: normalizeError(error),
                senderEmail: email.sender.email,
                sourceCell: cellsConfig.getCurrentCell().name,
                targetCell: cell.name,
              },
              "[email] Retrying inbound email relay"
            );
            return true;
          },
        }
      );

      if (responseRes.isErr() || !responseRes.value.ok) {
        logger.error(
          {
            error: responseRes.isErr()
              ? responseRes.error
              : new Error(
                  `Relay to ${cell.name} failed with status ${responseRes.value.status}: ${responseRes.value.statusText}`
                ),
            sourceCell: cellsConfig.getCurrentCell().name,
            targetCell: cell.name,
          },
          "[email] Failed to relay inbound email to cell"
        );
        continue;
      }

      logger.info(
        {
          senderEmail: email.sender.email,
          targetCell: cell.name,
          sourceCell: cellsConfig.getCurrentCell().name,
        },
        "[email] Relayed inbound email to other cell"
      );

      return new Ok(undefined);
    }
  } catch (error) {
    return new Err(normalizeError(error));
  }

  return new Err(new Error("Failed to relay inbound email to other cells"));
}

function parseThreadingHeaders(rawHeaders: string | null) {
  if (!rawHeaders) {
    return {
      messageId: null,
      inReplyTo: null,
      references: null,
    };
  }

  return {
    messageId: parseHeaderValue(rawHeaders, "Message-ID"),
    inReplyTo: parseHeaderValue(rawHeaders, "In-Reply-To"),
    references: parseHeaderValue(rawHeaders, "References"),
  };
}

type EmailWebhookErrorLogContext = {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
};

// Parses the Sendgrid webhook form data and validates it returning a fully formed InboundEmail.
export const parseSendgridWebhookContent = async (
  rawBody: Buffer,
  headers: EmailWebhookHeaders
): Promise<Result<InboundEmail, Error>> => {
  const req = createBufferedRequestFromRawBody(rawBody, headers);
  if (!isSendgridParseFormRequest(req)) {
    return new Err(
      new Error("Failed to recreate request body for multipart parsing")
    );
  }
  const form = new IncomingForm({
    allowEmptyFiles: true,
    minFileSize: 0,
  });
  const [fields, files] = await form.parse(req);

  try {
    const subject = fields["subject"] ? fields["subject"][0] : null;
    const text = fields["text"] ? fields["text"][0] : null;
    const senderFull = fields["from"] ? fields["from"][0] : null;
    const SPF = fields["SPF"] ? fields["SPF"][0] : null;
    const dkim = fields["dkim"] ? fields["dkim"][0] : null;
    const rawHeaders = fields["headers"] ? fields["headers"][0] : null;
    const envelope = fields["envelope"]
      ? JSON.parse(fields["envelope"][0])
      : null;

    const dkimRaw = isString(dkim) ? dkim : "";

    if (!envelope) {
      return new Err(new Error("Failed to parse envelope"));
    }

    const from = envelope.from;

    if (!from || typeof from !== "string") {
      return new Err(new Error("Failed to parse envelope.from"));
    }
    if (!senderFull || typeof senderFull !== "string") {
      return new Err(new Error("Failed to parse from"));
    }

    const senderHeaderValue =
      (isString(rawHeaders) ? parseHeaderValue(rawHeaders, "From") : null) ??
      senderFull;
    const senderRes = extractSingleEmailAddressFromHeader(
      "From",
      senderHeaderValue
    );
    if (senderRes.isErr()) {
      return senderRes;
    }

    // Extract attachments from files, filtering to supported content types.
    const attachments: EmailAttachment[] = [];
    for (const [key, fileArray] of Object.entries(files)) {
      if (!fileArray) {
        continue;
      }
      for (const file of fileArray) {
        if (file.size === 0) {
          continue;
        }
        if (file.mimetype && isSupportedFileContentType(file.mimetype)) {
          attachments.push({
            filepath: file.filepath,
            filename: file.originalFilename ?? key,
            contentType: file.mimetype,
            size: file.size,
          });
        }
      }
    }

    return new Ok({
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      subject: subject || "(no subject)",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      text: text || "",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      auth: {
        SPF: SPF || "",
        dkim: parseSendgridDkimResults(dkimRaw),
        dkimRaw,
      },
      threadingHeaders: parseThreadingHeaders(
        isString(rawHeaders) ? rawHeaders : null
      ),
      rawHeaders: isString(rawHeaders) ? rawHeaders : null,
      sender: {
        email: senderRes.value,
        full: senderHeaderValue,
      },
      envelope: {
        // Use raw headers to get all To/Cc recipients: Sendgrid's envelope.to only
        // contains addresses matching the inbound-parse domain, omitting human recipients.
        // envelope.cc is not populated by Sendgrid at all.
        // Fall back to envelope.to if headers are absent so agent routing still works.
        to: (() => {
          const fromHeaders = extractEmailAddressesFromHeader(
            isString(rawHeaders) ? parseHeaderValue(rawHeaders, "To") : null
          );
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          return fromHeaders.length > 0 ? fromHeaders : envelope.to || [];
        })(),
        cc: extractEmailAddressesFromHeader(
          isString(rawHeaders) ? parseHeaderValue(rawHeaders, "Cc") : null
        ),
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        bcc: envelope.bcc || [],
        from,
      },
      attachments,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
  } catch (e) {
    return new Err(new Error("Failed to parse email content"));
  }
};

export const replyToError = async (
  email: InboundEmail,
  error: EmailTriggerError,
  context?: EmailWebhookErrorLogContext
): Promise<void> => {
  logger.error(
    {
      error,
      envelope: email.envelope,
      ...(context ?? {}),
    },
    "[email] Error handling email."
  );
  const htmlContent =
    `<p>Error running agent:</p>\n` +
    `<p>(${error.type}) ${error.message}</p>\n`;
  await replyToEmail({
    email,
    htmlContent,
    recipient: email.sender.email,
  });
};
