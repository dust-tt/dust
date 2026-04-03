/** @ignoreswagger */
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
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import apiConfig from "@app/lib/api/config";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { IncomingForm } from "formidable";
import { readFile } from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";

// Disabling Next.js's body parser as formidable has its own
export const config = {
  api: {
    bodyParser: false,
  },
};

const EMAIL_WEBHOOK_RELAY_HEADER = "x-dust-email-webhook-relayed";
const EMAIL_WEBHOOK_RELAY_SOURCE_REGION_HEADER =
  "x-dust-email-webhook-source-region";
const EMAIL_WEBHOOK_RELAY_HEADER_VALUE = "1";

function isRelayedWebhookRequest(
  req: Pick<NextApiRequest, "headers">
): boolean {
  return (
    req.headers[EMAIL_WEBHOOK_RELAY_HEADER] === EMAIL_WEBHOOK_RELAY_HEADER_VALUE
  );
}

function isRelayEligibleError(error: EmailTriggerError): boolean {
  return (
    error.type === "user_not_found" || error.type === "workspace_not_found"
  );
}

export function shouldRelayToOtherRegion({
  req,
  error,
}: {
  req: Pick<NextApiRequest, "headers">;
  error: EmailTriggerError;
}): boolean {
  return isRelayEligibleError(error) && !isRelayedWebhookRequest(req);
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
  req: Pick<NextApiRequest, "headers">
): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  return (
    isRelayedWebhookRequest(req) &&
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
const parseSendgridWebhookContent = async (
  req: NextApiRequest
): Promise<Result<InboundEmail, Error>> => {
  const form = new IncomingForm();
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

export type PostResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostResponseBody>>
): Promise<void> {
  switch (req.method) {
    case "POST":
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "missing_authorization_header_error",
            message: "Missing Authorization header",
          },
        });
      }

      if (
        !hasValidSendgridAuthorization(authHeader) &&
        !hasValidRelayAuthorization(req)
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_basic_authorization_error",
            message: "Invalid Authorization header",
          },
        });
      }

      const emailRes = await parseSendgridWebhookContent(req);
      if (emailRes.isErr()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: emailRes.error.message,
          },
        });
      }

      const email = emailRes.value;

      // At this stage we have a valid email in we can respond 200 to the webhook, no more apiError
      // possible below this point, errors should be reported to the sender.
      res.status(200).json({ success: true });

      const authDecision = evaluateInboundAuth(email);

      if (!authDecision.authenticated) {
        // Do not reply to unauthenticated mail — the sender may be spoofed,
        // and replying would cause backscatter.
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
        if (shouldRelayToOtherRegion({ req, error: userRes.error })) {
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

      // Find target emails in [...to, ...cc, ...bcc] whose domain is
      // ASSISTANT_EMAIL_SUBDOMAIN.
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

      const agentConfigurations = removeNulls(
        await Promise.all(
          targetEmails.map(async (targetEmail) => {
            const matchRes = await emailAssistantMatcher({
              auth,
              targetEmail,
            });
            if (matchRes.isErr()) {
              await replyToError(email, matchRes.error);
              return null;
            }

            return matchRes.value.agentConfiguration;
          })
        )
      );

      if (agentConfigurations.length === 0) {
        return;
      }

      // Trigger async processing - reply will be sent by finalization activity.
      const triggerRes = await triggerFromEmail({
        auth,
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
        context: getAuditLogContext(auth, req),
        metadata: {
          senderEmail: email.sender.email,
          agentId: agentConfigurations.map((a) => a.sId).join(","),
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
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
