import type {
  EmailAttachment,
  EmailTriggerError,
  InboundEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import { replyToEmail } from "@app/lib/api/assistant/email/email_trigger";
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
import apiConfig from "@app/lib/api/config";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { IncomingForm } from "formidable";
import { readFile } from "fs/promises";

/**
 * Node-style headers shape, matching both `NextApiRequest["headers"]` and the
 * record built from `Headers.forEach(...)` in the Hono adapter.
 */
export type EmailWebhookHeaders = Record<string, string | string[] | undefined>;

export const EMAIL_WEBHOOK_RELAY_HEADER = "x-dust-email-webhook-relayed";
export const EMAIL_WEBHOOK_RELAY_SOURCE_REGION_HEADER =
  "x-dust-email-webhook-source-region";
export const EMAIL_WEBHOOK_RELAY_HEADER_VALUE = "1";

export function isRelayedWebhookRequest(headers: EmailWebhookHeaders): boolean {
  return (
    headers[EMAIL_WEBHOOK_RELAY_HEADER] === EMAIL_WEBHOOK_RELAY_HEADER_VALUE
  );
}

function isRelayEligibleError(error: EmailTriggerError): boolean {
  return (
    error.type === "user_not_found" || error.type === "workspace_not_found"
  );
}

export function shouldRelayToOtherRegion({
  headers,
  error,
}: {
  headers: EmailWebhookHeaders;
  error: EmailTriggerError;
}): boolean {
  return isRelayEligibleError(error) && !isRelayedWebhookRequest(headers);
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
    authHeader.slice("Bearer ".length) === regionsConfig.getLookupApiSecret()
  );
}

export async function relayEmailToOtherRegion(
  email: InboundEmail
): Promise<Result<void, Error>> {
  try {
    const { url, name } = regionsConfig.getOtherRegionInfo();
    const formData = new FormData();

    formData.set("subject", email.subject);
    formData.set("text", email.text);
    formData.set("from", email.sender.full);
    formData.set("SPF", email.auth.SPF);
    formData.set("dkim", email.auth.dkimRaw);
    formData.set("envelope", JSON.stringify(email.envelope));

    if (email.rawHeaders) {
      formData.set("headers", email.rawHeaders);
    }

    for (const [index, attachment] of email.attachments.entries()) {
      const buffer = await readFile(attachment.filepath);
      formData.append(
        `attachment_${index}`,
        new Blob([buffer], { type: attachment.contentType }),
        attachment.filename
      );
    }

    const response = await fetch(`${url}/api/email/webhook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${regionsConfig.getLookupApiSecret()}`,
        [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
        [EMAIL_WEBHOOK_RELAY_SOURCE_REGION_HEADER]:
          regionsConfig.getCurrentRegion(),
      },
      body: formData,
    });

    if (!response.ok) {
      return new Err(
        new Error(
          `Relay to ${name} failed with status ${response.status}: ${response.statusText}`
        )
      );
    }

    logger.info(
      {
        senderEmail: email.sender.email,
        targetRegion: name,
        sourceRegion: regionsConfig.getCurrentRegion(),
      },
      "[email] Relayed inbound email to other region"
    );

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export function parseThreadingHeaders(rawHeaders: string | null) {
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
  error: EmailTriggerError
): Promise<void> => {
  logger.error(
    { error, envelope: email.envelope },
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
