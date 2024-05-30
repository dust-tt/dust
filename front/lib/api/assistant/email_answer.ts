import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import {
  createConversation,
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { renderUserType } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { filterAndSortAgents } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export const ASSISTANT_EMAIL_SUBDOMAIN = "run.dust.help";

export type EmailAnswerError = {
  type:
    | "unexpected_error"
    | "user_not_found"
    | "workspace_not_found"
    | "agent_not_found"
    | "message_creation_error";
  message?: string;
};

export async function userAndWorkspaceFromEmail({
  email,
}: {
  email: string;
}): Promise<
  Result<
    {
      workspace: LightWorkspaceType;
      user: UserType;
    },
    EmailAnswerError
  >
> {
  const user = await User.findOne({
    where: { email: email },
  });

  if (!user) {
    logger.error({ email }, "[email] No user found with this email.");
    return new Err({ type: "user_not_found" });
  }

  const workspace = await Workspace.findOne({
    include: [
      {
        model: MembershipModel,
        where: { userId: user.id },
      },
    ],
  });

  if (!workspace) {
    logger.error({ email }, "[email] No workspace found for this user.");
    return new Err({ type: "workspace_not_found" });
  }

  return new Ok({
    workspace: renderLightWorkspaceType({ workspace }),
    user: renderUserType(user),
  });
}

export async function emailAssistantMatcher({
  auth,
  targetEmail,
}: {
  auth: Authenticator;
  targetEmail: string;
}): Promise<
  Result<
    {
      agentConfiguration: LightAgentConfigurationType;
    },
    EmailAnswerError
  >
> {
  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "list",
    variant: "light",
    limit: undefined,
    sort: undefined,
  });

  const agentPrefix = targetEmail.split("@")[0].split("+")[1];

  console.log("TARGET EMAIL", targetEmail);
  console.log("AGENT PREFIX", agentPrefix);

  const matchingAgents = filterAndSortAgents(agentConfigurations, agentPrefix);
  if (matchingAgents.length === 0) {
    logger.error(
      { agentPrefix },
      "[emailMatcher] No agent configuration found for this email."
    );
    return new Err({ type: "agent_not_found" });
  }
  const agentConfiguration = matchingAgents[0];

  return new Ok({
    agentConfiguration,
  });
}

export async function emailAnswer({
  auth,
  agentConfiguration,
  threadTitle,
  threadContent,
}: {
  auth: Authenticator;
  agentConfiguration: LightAgentConfigurationType;
  threadTitle: string;
  threadContent: string;
}): Promise<
  Result<
    { conversation: ConversationType; htmlAnswer: string },
    EmailAnswerError
  >
> {
  const localLogger = logger.child({});
  const user = auth.user();
  if (!user) {
    // unreachable
    return new Err({
      type: "unexpected_error",
      message: "No user on authenticator.",
    });
  }

  const initialConversation = await createConversation(auth, {
    title: `Email thread: ${threadTitle}`,
    visibility: "unlisted",
  });

  await postNewContentFragment(auth, {
    conversation: initialConversation,
    title: `Email thread: ${threadTitle}`,
    content: threadContent,
    url: null,
    contentType: "file_attachment",
    context: {
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      profilePictureUrl: user.image,
    },
  });

  const messageRes = await postUserMessageWithPubSub(
    auth,
    {
      conversation: initialConversation,
      content: `:mention[${agentConfiguration.name}]{sId=${agentConfiguration.sId}}`,
      mentions: [{ configurationId: agentConfiguration.sId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        profilePictureUrl: user.image,
      },
    },
    { resolveAfterFullGeneration: true }
  );

  if (messageRes.isErr()) {
    return new Err({ type: "message_creation_error" });
  }

  const conversation = await getConversation(auth, initialConversation.sId);

  if (!conversation) {
    localLogger.error("[emailAnswer] No conversation found. Stopping.");
    // TODO send email to notify of problem
    return new Err({
      type: "unexpected_error",
      message: "Conversation just created, not found",
    });
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
    },
    "[emailAnswer] Created conversation."
  );

  // Get first from array with type='agent_message' in conversation.content.
  const agentMessage = <AgentMessageType[]>conversation.content.find(
    (innerArray) => {
      return innerArray.find((item) => item.type === "agent_message");
    }
  );

  const markDownAnswer =
    agentMessage && agentMessage[0].content ? agentMessage[0].content : "";
  const htmlAnswer = sanitizeHtml(await marked.parse(markDownAnswer), {
    // Allow images on top of all defaults from https://www.npmjs.com/package/sanitize-html
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });

  return new Ok({ conversation, htmlAnswer });
}

export async function replyWithContent({
  user,
  agentConfiguration,
  htmlContent,
  threadTitle,
  threadContent,
}: {
  user: UserType;
  agentConfiguration: LightAgentConfigurationType;
  htmlContent: string;
  threadTitle: string;
  threadContent: string;
}) {
  // subject: if Re: is there, we don't add it.
  const subject = threadTitle.startsWith("Re:")
    ? threadTitle
    : `Re: ${threadTitle}`;

  const html =
    htmlContent + `<br /><br /> <blockquote>${threadContent}</blockquote>`;
  const msg = {
    from: {
      name: `Dust Assistant (${agentConfiguration.name})`,
      email: `a+${agentConfiguration.name}@${ASSISTANT_EMAIL_SUBDOMAIN}`,
      reply_to: `a+${agentConfiguration.name}@${ASSISTANT_EMAIL_SUBDOMAIN}`,
    },
    subject,
    html,
  };

  await sendEmail(user.email, msg);
}
