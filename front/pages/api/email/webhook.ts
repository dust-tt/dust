import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import type {
  EmailTriggerError,
  InboundEmail,
} from "@app/lib/api/assistant/email_trigger";
import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  emailAssistantMatcher,
  getTargetEmailsForWorkspace,
  replyToEmail,
  triggerFromEmail,
  userAndWorkspacesFromEmail,
} from "@app/lib/api/assistant/email_trigger";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { Result, WithAPIErrorResponse } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import { getAgentRoute } from "@app/lib/utils/router";

const { DUST_CLIENT_FACING_URL = "", EMAIL_WEBHOOK_SECRET = "" } = process.env;

// Disabling Next.js's body parser as formidable has its own
export const config = {
  api: {
    bodyParser: false,
  },
};

// Parses the Sendgid webhook form data and validates it returning a fully formed InboundEmail.
const parseSendgridWebhookContent = async (
  req: NextApiRequest
): Promise<Result<InboundEmail, Error>> => {
  const form = new IncomingForm();
  const [fields] = await form.parse(req);

  try {
    const subject = fields["subject"] ? fields["subject"][0] : null;
    const text = fields["text"] ? fields["text"][0] : null;
    const full = fields["from"] ? fields["from"][0] : null;
    const SPF = fields["SPF"] ? fields["SPF"][0] : null;
    const dkim = fields["dkim"] ? fields["dkim"][0] : null;
    const envelope = fields["envelope"]
      ? JSON.parse(fields["envelope"][0])
      : null;

    if (!envelope) {
      return new Err(new Error("Failed to parse envelope"));
    }

    const from = envelope.from;

    if (!from || typeof from !== "string") {
      return new Err(new Error("Failed to parse envelope.from"));
    }
    if (!full || typeof full !== "string") {
      return new Err(new Error("Failed to parse from"));
    }

    return new Ok({
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      subject: subject || "(no subject)",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      text: text || "",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      auth: { SPF: SPF || "", dkim: dkim || "" },
      envelope: {
        to: envelope.to || [],
        cc: envelope.cc || [],
        bcc: envelope.bcc || [],
        from,
        full,
      },
    });
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
  await replyToEmail({ email, htmlContent });
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

      if (username !== "sendgrid" || password !== EMAIL_WEBHOOK_SECRET) {
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

      // Gating: only dust.tt emails are allowed to trigger the agent
      // WARNING: DO NOT UNGATE. Todo before ungating:
      // - ! check security, including but not limited to SPF dkim approach thorough review
      // - review from https://github.com/dust-tt/dust/pull/5365 for code refactoring and cleanup
      // - also, need to ungate the workspace check in email_trigger/userAndWorkspacesFromEmail
      if (!email.envelope.from.endsWith("@dust.tt")) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Only dust.tt emails are allowed to trigger the agent",
          },
        });
      }

      // At this stage we have a valid email in we can respond 200 to the webhook, no more apiError
      // possible below this point, errors should be reported to the sender.
      res.status(200).json({ success: true });

      // Check SPF is pass.
      if (
        email.auth.SPF !== "pass" ||
        email.auth.dkim !== `{@${email.envelope.from.split("@")[1]} : pass}`
      ) {
        await replyToError(email, {
          type: "unauthenticated_error",
          message:
            "Failed to authenticate your email (SPF/dkim validation failed).",
        });
        return;
      }

      const userRes = await userAndWorkspacesFromEmail({
        email: email.envelope.from,
      });
      if (userRes.isErr()) {
        await replyToError(email, userRes.error);
        return;
      }

      const { user, workspaces, defaultWorkspace } = userRes.value;

      // find target email in [...to, ...cc, ...bcc], that is email whose domain is
      // ASSISTANT_EMAIL_SUBDOMAIN.
      const allTargetEmails = [
        ...(email.envelope.to ?? []),
        ...(email.envelope.cc ?? []),
        ...(email.envelope.bcc ?? []),
      ].filter((email) => email.endsWith(`@${ASSISTANT_EMAIL_SUBDOMAIN}`));

      const workspacesAndEmails = workspaces
        .map((workspace) => {
          return {
            workspace,
            targetEmails: getTargetEmailsForWorkspace({
              allTargetEmails,
              workspace,
              isDefault: workspace.sId === defaultWorkspace.sId,
            }),
          };
        })
        .filter(({ targetEmails }) => (targetEmails as string[]).length > 0);

      if (workspacesAndEmails.length === 0) {
        await replyToError(email, {
          type: "invalid_email_error",
          message:
            `Failed to match any valid agent email. ` +
            `Expected agent email format: {ASSISTANT_NAME}@${ASSISTANT_EMAIL_SUBDOMAIN}.`,
        });
      }

      for (const { workspace, targetEmails } of workspacesAndEmails) {
        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          workspace.sId
        );

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

        const answerRes = await triggerFromEmail({
          auth,
          agentConfigurations,
          email,
        });

        if (answerRes.isErr()) {
          await replyToError(email, answerRes.error);
          return;
        }

        const { conversation, answers } = answerRes.value;

        answers.forEach(async (answer) => {
          void replyToEmail({
            email,
            agentConfiguration: answer.agentConfiguration,
            htmlContent: `<div><div>${
              answer.html
            }</div><br/><a href="${getAgentRoute(auth.workspace()?.sId ?? "", conversation.sId, DUST_CLIENT_FACING_URL)}">Open in Dust</a></div>`,
          });
        });
      }
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
