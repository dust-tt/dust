import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  emailAssistantMatcher,
  triggerFromEmail,
  userAndWorkspaceFromEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import { evaluateInboundAuth } from "@app/lib/api/assistant/email/inbound_auth";
import { validateSendgridParseWebhookSignature } from "@app/lib/api/assistant/email/sendgrid_parse_webhook_signature";
import type { EmailWebhookHeaders } from "@app/lib/api/assistant/email/webhook_helpers";
import {
  hasValidRelayAuthorization,
  hasValidSendgridAuthorization,
  parseSendgridWebhookContent,
  relayEmailToOtherRegion,
  replyToError,
  shouldRelayToOtherRegion,
} from "@app/lib/api/assistant/email/webhook_helpers";
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
import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { Hono } from "hono";

export type PostResponseBody = {
  success: boolean;
};

// SendGrid Parse limits inbound mail to ~30MB; matches the original
// `SENDGRID_PARSE_WEBHOOK_MAX_SIZE = "30mb"` enforced by `raw-body`.
const SENDGRID_PARSE_WEBHOOK_MAX_SIZE_BYTES = 30 * 1024 * 1024;

function headersToNodeHeaders(webHeaders: Headers): EmailWebhookHeaders {
  const out: EmailWebhookHeaders = {};
  webHeaders.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

// Mounted at /api/email/webhook.
const app = new Hono();

app.post("/", async (ctx): HandlerResult<PostResponseBody> => {
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
