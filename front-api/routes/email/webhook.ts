import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type {
  EmailAttachment,
  EmailTriggerError,
  InboundEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  emailAssistantMatcher,
  replyToEmail,
  triggerFromEmail,
  userAndWorkspaceFromEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import {
  extractEmailAddressesFromHeader,
  extractSingleEmailAddressFromHeader,
  parseHeaderValue,
} from "@app/lib/api/assistant/email/header_parsing";
import {
  evaluateInboundAuth,
  parseSendgridDkimResults,
} from "@app/lib/api/assistant/email/inbound_auth";
import {
  createBufferedRequestFromRawBody,
  isSendgridParseFormRequest,
  validateSendgridParseWebhookSignature,
} from "@app/lib/api/assistant/email/sendgrid_parse_webhook_signature";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import apiConfig from "@app/lib/api/config";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { isSupportedFileContentType } from "@app/types/files";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import { IncomingForm } from "formidable";
import { readFile } from "fs/promises";
import { Hono } from "hono";

const EMAIL_WEBHOOK_RELAY_HEADER = "x-dust-email-webhook-relayed";
const EMAIL_WEBHOOK_RELAY_SOURCE_REGION_HEADER =
  "x-dust-email-webhook-source-region";
const EMAIL_WEBHOOK_RELAY_HEADER_VALUE = "1";

// SendGrid Parse limits inbound mail to ~30MB; matches the original
// `SENDGRID_PARSE_WEBHOOK_MAX_SIZE = "30mb"` enforced by `raw-body`.
const SENDGRID_PARSE_WEBHOOK_MAX_SIZE_BYTES = 30 * 1024 * 1024;

function headersToNodeHeaders(
  webHeaders: Headers
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  webHeaders.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function isRelayedWebhookRequest(
  headers: Record<string, string | string[] | undefined>
): boolean {
  return (
    headers[EMAIL_WEBHOOK_RELAY_HEADER] === EMAIL_WEBHOOK_RELAY_HEADER_VALUE
  );
}

function isRelayEligibleError(error: EmailTriggerError): boolean {
  return (
    error.type === "user_not_found" || error.type === "workspace_not_found"
  );
}

function shouldRelayToOtherRegion({
  headers,
  error,
}: {
  headers: Record<string, string | string[] | undefined>;
  error: EmailTriggerError;
}): boolean {
  return isRelayEligibleError(error) && !isRelayedWebhookRequest(headers);
}

function hasValidSendgridAuthorization(
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

function hasValidRelayAuthorization(
  headers: Record<string, string | string[] | undefined>
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

async function relayEmailToOtherRegion(
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

function parseThreadingHeaders(rawHeaders: string | null) {
  if (!rawHeaders) {
    return { messageId: null, inReplyTo: null, references: null };
  }
  return {
    messageId: parseHeaderValue(rawHeaders, "Message-ID"),
    inReplyTo: parseHeaderValue(rawHeaders, "In-Reply-To"),
    references: parseHeaderValue(rawHeaders, "References"),
  };
}

const parseSendgridWebhookContent = async (
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>
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
      auth: {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  } catch (_e) {
    return new Err(new Error("Failed to parse email content"));
  }
};

const replyToError = async (
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

// Mounted at /api/email/webhook.
const app = new Hono();

app.post("/", async (ctx) => {
  const headers = headersToNodeHeaders(ctx.req.raw.headers);
  const authHeader = isString(headers.authorization)
    ? headers.authorization
    : undefined;
  const isSendgridRequest = hasValidSendgridAuthorization(authHeader);
  const isRelayRequest = hasValidRelayAuthorization(headers);

  if (!authHeader) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
  }

  if (!isSendgridRequest && !isRelayRequest) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_basic_authorization_error",
        message: "Invalid Authorization header",
      },
    });
  }

  // SendGrid signs the exact multipart bytes, so we must verify the raw body
  // before formidable parses or rewrites anything.
  let rawBody: Buffer;
  try {
    const arrayBuffer = await ctx.req.arrayBuffer();
    if (arrayBuffer.byteLength > SENDGRID_PARSE_WEBHOOK_MAX_SIZE_BYTES) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Request body too large.",
        },
      });
    }
    rawBody = Buffer.from(arrayBuffer);
  } catch {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Failed to read raw request body.",
      },
    });
  }

  if (isSendgridRequest && !isDevelopment()) {
    const signatureValidationRes = validateSendgridParseWebhookSignature({
      publicKey: apiConfig.getSendgridParseWebhookPublicKey(),
      headers,
      rawBody,
    });
    if (signatureValidationRes.isErr()) {
      logger.warn(
        {
          errorType: signatureValidationRes.error.apiError.type,
          message: signatureValidationRes.error.apiError.message,
        },
        "[email] Rejected SendGrid Parse webhook before multipart parsing"
      );
      return apiError(ctx, {
        status_code: signatureValidationRes.error.statusCode,
        api_error: signatureValidationRes.error.apiError,
      });
    }
  }

  const emailRes = await parseSendgridWebhookContent(rawBody, headers);
  if (emailRes.isErr()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: emailRes.error.message,
      },
    });
  }

  const email = emailRes.value;

  // Acknowledge the webhook now — from here on, all errors should be sent as
  // a reply to the original sender, not surfaced to SendGrid. We finish the
  // remaining processing in a detached IIFE so the response goes out
  // immediately, matching the Next-side `res.status(200).json(...)` then
  // keep-working pattern.
  void (async () => {
    try {
      const authDecision = evaluateInboundAuth(email);
      if (!authDecision.authenticated) {
        logger.warn(
          {
            reason: authDecision.reason,
            headerFromDomain: authDecision.headerFromDomain,
            spfResult: authDecision.spfResult,
            spfEnvelopeDomain: authDecision.spfEnvelopeDomain,
            dkimEntries: authDecision.dkimEntries,
            senderEmail: email.sender.email,
            targetEmails: [
              ...(email.envelope.to ?? []),
              ...(email.envelope.cc ?? []),
              ...(email.envelope.bcc ?? []),
            ].filter((e) => e.endsWith(`@${ASSISTANT_EMAIL_SUBDOMAIN}`)),
          },
          "[email] Dropping unauthenticated inbound mail (SPF/DKIM failure)"
        );
        return;
      }

      logger.info(
        {
          reason: authDecision.reason,
          headerFromDomain: authDecision.headerFromDomain,
          senderEmail: email.sender.email,
        },
        "[email] Inbound sender authenticated"
      );

      const userRes = await userAndWorkspaceFromEmail({
        email: email.sender.email,
      });
      if (userRes.isErr()) {
        if (shouldRelayToOtherRegion({ headers, error: userRes.error })) {
          const relayRes = await relayEmailToOtherRegion(email);
          if (relayRes.isOk()) {
            return;
          }
          logger.error(
            {
              senderEmail: email.sender.email,
              error: relayRes.error,
              sourceRegion: regionsConfig.getCurrentRegion(),
              targetRegion: regionsConfig.getOtherRegionInfo().name,
            },
            "[email] Failed to relay inbound email to other region"
          );
        }
        await replyToError(email, userRes.error);
        return;
      }

      const { user, workspace } = userRes.value;

      const targetEmails = [
        ...(email.envelope.to ?? []),
        ...(email.envelope.cc ?? []),
        ...(email.envelope.bcc ?? []),
      ].filter((e) => e.endsWith(`@${ASSISTANT_EMAIL_SUBDOMAIN}`));

      if (targetEmails.length === 0) {
        await replyToError(email, {
          type: "invalid_email_error",
          message:
            `Failed to match any valid agent email. ` +
            `Expected agent email format: {ASSISTANT_NAME}@${ASSISTANT_EMAIL_SUBDOMAIN}.`,
        });
        return;
      }

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      if (workspace.metadata?.allowEmailAgents !== true) {
        await replyToError(email, {
          type: "invalid_email_error",
          message:
            "Email interactions with agents are not enabled for your workspace.",
        });
        return;
      }

      const allAgentConfigurations = await getAgentConfigurationsForView({
        auth,
        agentsGetView: "list",
        variant: "light",
        limit: undefined,
        sort: undefined,
      });

      const agentConfigurations: LightAgentConfigurationType[] = [];
      for (const targetEmail of targetEmails) {
        const matchResult = emailAssistantMatcher({
          allAgentConfigurations,
          targetEmail,
        });
        if (matchResult.isErr()) {
          await replyToError(email, matchResult.error);
          continue;
        }
        agentConfigurations.push(matchResult.value.agentConfiguration);
      }

      if (agentConfigurations.length === 0) {
        return;
      }

      const triggerRes = await triggerFromEmail(auth, {
        agentConfigurations,
        email,
      });

      if (triggerRes.isErr()) {
        await replyToError(email, triggerRes.error);
        return;
      }

      void emitAuditLogEvent({
        auth,
        action: "trigger.email_received",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("trigger", {
            sId: triggerRes.value.conversation.sId,
            name: triggerRes.value.conversation.sId,
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          sender_email: email.sender.email,
          agent_id: agentConfigurations.map((a) => a.sId).join(","),
          initiating_user_id: auth.user()?.sId ?? "unknown",
          initiating_user_email: auth.user()?.email ?? "unknown",
        },
      });

      logger.info(
        {
          conversationId: triggerRes.value.conversation.sId,
          workspaceId: workspace.sId,
          agentCount: agentConfigurations.length,
        },
        "[email] Triggered async email processing"
      );
    } catch (err) {
      logger.error(
        { error: normalizeError(err) },
        "[email] Unhandled error in async email processing"
      );
    }
  })();

  return ctx.json({ success: true });
});

export default app;
