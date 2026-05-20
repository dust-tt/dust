// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  emailAssistantMatcher,
  triggerFromEmail,
  userAndWorkspaceFromEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import { evaluateInboundAuth } from "@app/lib/api/assistant/email/inbound_auth";
import { validateSendgridParseWebhookSignature } from "@app/lib/api/assistant/email/sendgrid_parse_webhook_signature";
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
import { apiError, withLogging } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isDevelopment } from "@app/types/shared/env";
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";

const SENDGRID_PARSE_WEBHOOK_MAX_SIZE = "30mb";

// Disabling Next.js's body parser as formidable has its own
export const config = {
  api: {
    bodyParser: false,
  },
};

// Re-export for existing test imports; new code should import from
// `@app/lib/api/assistant/email/webhook_helpers` directly.
export { shouldRelayToOtherRegion };

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
      const isSendgridRequest = hasValidSendgridAuthorization(authHeader);
      const isRelayRequest = hasValidRelayAuthorization(req.headers);

      if (!authHeader) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "missing_authorization_header_error",
            message: "Missing Authorization header",
          },
        });
      }

      if (!isSendgridRequest && !isRelayRequest) {
        return apiError(req, res, {
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
        rawBody = await getRawBody(req, {
          limit: SENDGRID_PARSE_WEBHOOK_MAX_SIZE,
        });
      } catch {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to read raw request body.",
          },
        });
      }

      // Only the original SendGrid ingress carries the signed raw multipart body.
      // Cross-region relays rebuild the form-data payload, so the forwarded hop must
      // trust our relay auth instead of re-running SendGrid signature verification.
      if (isSendgridRequest && !isDevelopment()) {
        const signatureValidationRes = validateSendgridParseWebhookSignature({
          publicKey: apiConfig.getSendgridParseWebhookPublicKey(),
          headers: req.headers,
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
          return apiError(req, res, {
            status_code: signatureValidationRes.error.statusCode,
            api_error: signatureValidationRes.error.apiError,
          });
        }
      }

      const emailRes = await parseSendgridWebhookContent(rawBody, req.headers);
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
        if (
          shouldRelayToOtherRegion({ headers: req.headers, error: userRes.error })
        ) {
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

      const allAgentConfigurations = await getAgentConfigurationsForView({
        auth,
        agentsGetView: "list",
        variant: "light",
        limit: undefined,
        sort: undefined,
      });

      let agentConfigurations: LightAgentConfigurationType[] = [];
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

      // Trigger async processing - reply will be sent by finalization activity.
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
        context: getAuditLogContext(auth, req),
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
