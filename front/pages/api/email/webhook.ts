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
  buildWorkspaceTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import apiConfig from "@app/lib/api/config";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

// Disabling Next.js's body parser as formidable has its own
export const config = {
  api: {
    bodyParser: false,
  },
};

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

      if (!authHeader || !authHeader.startsWith("Basic ")) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "missing_authorization_header_error",
            message: "Missing Authorization header",
          },
        });
      }

      const base64Credentials = authHeader.split(" ")[1];
      const credentials = Buffer.from(base64Credentials, "base64").toString(
        "ascii"
      );
      const [username, password] = credentials.split(":");

      if (
        username !== "sendgrid" ||
        password !== apiConfig.getEmailWebhookSecret()
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

      const featureFlags = await getFeatureFlags(auth);
      if (!featureFlags.includes("email_agents")) {
        await replyToError(email, {
          type: "invalid_email_error",
          message:
            "Email interactions with agents are not enabled for your workspace.",
        });
        return;
      }

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
          buildWorkspaceTarget(auth.getNonNullableWorkspace()),
          { type: "trigger", id: triggerRes.value.conversation.sId },
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
