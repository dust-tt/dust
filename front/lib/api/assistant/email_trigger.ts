import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { Op } from "sequelize";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  createConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import { sendEmail } from "@app/lib/api/email";
import type { Authenticator } from "@app/lib/auth";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { filterAndSortAgents } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  Result,
  UserType,
} from "@app/types";
import { Err, isAgentMessageType, isDevelopment, Ok } from "@app/types";

import { toFileContentFragment } from "./conversation/content_fragment";

const { PRODUCTION_DUST_WORKSPACE_ID } = process.env;

function renderUserType(user: UserModel): UserType {
  return {
    sId: user.sId,
    id: user.id,
    createdAt: user.createdAt.getTime(),
    provider: user.provider,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.firstName + (user.lastName ? ` ${user.lastName}` : ""),
    image: user.imageUrl,
    lastLoginAt: user.lastLoginAt?.getTime() ?? null,
  };
}

export const ASSISTANT_EMAIL_SUBDOMAIN = isDevelopment()
  ? "run.dust.help"
  : "run.dust.help";

export type InboundEmail = {
  subject: string;
  text: string;
  auth: { SPF: string; dkim: string };
  envelope: {
    to: string[];
    cc: string[];
    bcc: string[];
    from: string;
    full: string;
  };
};

export type EmailTriggerError = {
  type:
    | "unexpected_error"
    | "unauthenticated_error"
    | "user_not_found"
    | "workspace_not_found"
    | "invalid_email_error"
    | "assistant_not_found"
    | "message_creation_error";
  message: string;
};

export function getTargetEmailsForWorkspace({
  allTargetEmails,
  workspace,
  isDefault,
}: {
  allTargetEmails: string[];
  workspace: LightWorkspaceType;
  isDefault: boolean;
}): string[] {
  return allTargetEmails.filter(
    (email) =>
      email.split("@")[0].endsWith(`[${workspace.sId}]`) ||
      // calls with no brackets go to default workspace
      (!email.split("@")[0].endsWith("]") && isDefault)
  );
}

export async function userAndWorkspacesFromEmail({
  email,
}: {
  email: string;
}): Promise<
  Result<
    {
      workspaces: LightWorkspaceType[];
      user: UserType;
      defaultWorkspace: LightWorkspaceType;
    },
    EmailTriggerError
  >
> {
  const user = await UserModel.findOne({
    where: { email },
  });

  if (!user) {
    return new Err({
      type: "user_not_found",
      message:
        `Failed to match a valid Dust user for email: ${email}. ` +
        `Please sign up for Dust at https://dust.tt to interact with assitsants over email.`,
    });
  }
  const workspaces = await WorkspaceModel.findAll({
    include: [
      {
        model: MembershipModel,
        where: {
          userId: user.id,
          endAt: {
            [Op.or]: [{ [Op.is]: null }, { [Op.gte]: new Date() }],
          },
        },
      },
    ],
  });

  if (!workspaces) {
    return new Err({
      type: "workspace_not_found",
      message:
        `Failed to match a valid Dust workspace associated with email: ${email}. ` +
        `Please sign up for Dust at https://dust.tt to interact with agents over email.`,
    });
  }

  /* get latest conversation participation from user
    uncomment when ungating
  const latestParticipation = await ConversationParticipant.findOne({
    where: {
      userId: user.id,
    },
    include: [
      {
        model: Conversation,
      },
    ],
    order: [["createdAt", "DESC"]],
  });*/

  // TODO: when ungating, implement good default logic to pick workspace
  // a. most members?
  // b. latest participation as above using the above (latestParticipation?.conversation?.workspaceId)
  // c. most frequent-recent activity? (return 10 results with participants and pick the workspace with most convos)
  // (will work fine since most users likely use only one workspace with a given email)
  const workspace = workspaces.find(
    (w) => w.sId === PRODUCTION_DUST_WORKSPACE_ID // Gating to dust workspace
  );
  if (!workspace) {
    return new Err({
      type: "unexpected_error",
      message: "Failed to find a valid default workspace for user.",
    });
  }

  const defaultWorkspace = renderLightWorkspaceType({
    workspace,
  });

  // TODO: when ungating, replace [workspace] with workspaces here
  return new Ok({
    workspaces: [workspace].map((workspace) =>
      renderLightWorkspaceType({ workspace })
    ),
    user: renderUserType(user),
    defaultWorkspace,
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
    EmailTriggerError
  >
> {
  const agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
    limit: undefined,
    sort: undefined,
  });

  const agentPrefix = targetEmail.split("@")[0];

  const matchingAgents = filterAndSortAgents(agentConfigurations, agentPrefix);
  if (matchingAgents.length === 0) {
    return new Err({
      type: "assistant_not_found",
      message: `Failed to match a valid agent with name prefix: '${agentPrefix}'.`,
    });
  }
  const agentConfiguration = matchingAgents[0];

  return new Ok({
    agentConfiguration,
  });
}

export async function splitThreadContent(content: string) {
  const separators = [
    /\n\s*On\s+[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M/,
    /\n\s*[-]+\s*Forwarded message\s*[-]+/,
  ];

  let firstSeparatorIndex = -1;

  for (const separator of separators) {
    const match = content.match(separator);
    if (
      match &&
      match.index &&
      (firstSeparatorIndex === -1 || match.index < firstSeparatorIndex)
    ) {
      firstSeparatorIndex = match.index;
    }
  }
  const conversationIdRegex =
    /Open in Dust <https?:\/\/[^/]+\/w\/[^/]+\/assistant\/([^>]+)>/;
  const conversationIdMatch = content.match(conversationIdRegex);
  const conversationId = conversationIdMatch ? conversationIdMatch[1] : null;

  const newMessage =
    firstSeparatorIndex > -1
      ? content.slice(0, firstSeparatorIndex).trim()
      : content.trim();
  const thread =
    firstSeparatorIndex > -1 ? content.slice(firstSeparatorIndex).trim() : "";
  return { userMessage: newMessage, restOfThread: thread, conversationId };
}

export async function triggerFromEmail({
  auth,
  agentConfigurations,
  email,
}: {
  auth: Authenticator;
  agentConfigurations: LightAgentConfigurationType[];
  email: InboundEmail;
}): Promise<
  Result<
    {
      conversation: ConversationType;
      answers: {
        agentConfiguration: LightAgentConfigurationType;
        agentMessage: AgentMessageType;
        html: string;
      }[];
    },
    EmailTriggerError
  >
> {
  const localLogger = logger.child({});
  const user = auth.user();
  if (!user) {
    return new Err({
      type: "unexpected_error",
      message:
        "An unexpected error occurred. Please try again or contact us at support@dust.tt.",
    });
  }

  const { userMessage, restOfThread, conversationId } =
    await splitThreadContent(email.text);

  let conversation;
  if (conversationId) {
    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return new Err({
        type: "unexpected_error",
        message: "Failed to find conversation with given id.",
      });
    }
    conversation = conversationRes.value;
  } else {
    conversation = await createConversation(auth, {
      title: `Email: ${email.subject}`,
      visibility: "unlisted",
    });
  }

  // console.log("USER_MESSAGE", userMessage);
  // console.log("REST_OF_THREAD", restOfThread, restOfThread.length);

  if (restOfThread.length > 0) {
    const cfRes = await toFileContentFragment(auth, {
      contentFragment: {
        title: `Email thread: ${email.subject}`,
        content: restOfThread,
        contentType: "text/plain",
        url: null,
      },
      fileName: `email-thread.txt`,
    });
    if (cfRes.isErr()) {
      return new Err({
        type: "message_creation_error",
        message:
          `Error creating file for content fragment: ` + cfRes.error.message,
      });
    }

    const contentFragmentRes = await postNewContentFragment(
      auth,
      conversation,
      cfRes.value,
      {
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
        profilePictureUrl: user.imageUrl,
      }
    );
    if (contentFragmentRes.isErr()) {
      return new Err({
        type: "message_creation_error",
        message:
          `Error creating file for content fragment: ` +
          contentFragmentRes.error.message,
      });
    }

    const updatedConversationRes = await getConversation(
      auth,
      conversation.sId
    );
    if (updatedConversationRes.isErr()) {
      // if no conversation found, we just keep the conversation as is but do
      // not err
      if (updatedConversationRes.error.type !== "conversation_not_found") {
        return new Err({
          type: "unexpected_error",
          message: "Failed to update conversation with email thread.",
        });
      }
    } else {
      conversation = updatedConversationRes.value;
    }
  }

  const content =
    agentConfigurations
      .map((agent) => {
        return `:mention[${agent.name}]{sId=${agent.sId}}`;
      })
      .join(" ") +
    " " +
    userMessage;

  const mentions = agentConfigurations.map((agent) => {
    return { configurationId: agent.sId };
  });

  const messageRes = await postUserMessageAndWaitForCompletion(auth, {
    conversation,
    content,
    mentions,
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
      profilePictureUrl: user.imageUrl,
      origin: "email",
    },
    // When running an agent from an email we have no chance of validating tools so we skip all of
    // them and run the tools by default. This is in tension with the admin settings and could be
    // revisited if needed.
    skipToolsValidation: true,
  });

  if (messageRes.isErr()) {
    return new Err({
      type: "message_creation_error",
      message:
        `Error interacting with agent: ` + messageRes.error.api_error.message,
    });
  }

  const updatedConversationRes = await getConversation(auth, conversation.sId);

  if (updatedConversationRes.isErr()) {
    if (updatedConversationRes.error.type !== "conversation_not_found") {
      return new Err({
        type: "unexpected_error",
        message: "Failed to update conversation with user message.",
      });
    }
  } else {
    conversation = updatedConversationRes.value;
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
    },
    "[email] Created conversation."
  );

  // console.log(conversation.content);

  // Last versions of each agent messages.
  const agentMessages = agentConfigurations.map((ac) => {
    const agentMessages = conversation.content.find((versions) => {
      const item = versions[versions.length - 1];
      return (
        item && isAgentMessageType(item) && item.configuration.sId === ac.sId
      );
    }) as AgentMessageType[];
    const last = agentMessages[agentMessages.length - 1];
    return { agentConfiguration: ac, agentMessage: last };
  });

  const answers = await Promise.all(
    agentMessages.map(async ({ agentConfiguration, agentMessage }) => {
      return {
        agentConfiguration,
        agentMessage,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        html: sanitizeHtml(await marked.parse(agentMessage.content || ""), {
          // Allow images on top of all defaults from https://www.npmjs.com/package/sanitize-html
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
        }),
      };
    })
  );

  return new Ok({ conversation, answers });
}

export async function replyToEmail({
  email,
  agentConfiguration,
  htmlContent,
}: {
  email: InboundEmail;
  agentConfiguration?: LightAgentConfigurationType;
  htmlContent: string;
}) {
  const name = agentConfiguration
    ? `Dust Agent (${agentConfiguration.name})`
    : "Dust Agent";
  const sender = agentConfiguration
    ? `${agentConfiguration.name}@${ASSISTANT_EMAIL_SUBDOMAIN}`
    : `assistants@${ASSISTANT_EMAIL_SUBDOMAIN}`;

  // subject: if Re: is there, we don't add it.
  const subject = email.subject
    .toLowerCase()
    .replaceAll(" ", "")
    .startsWith("re:")
    ? email.subject
    : `Re: ${email.subject}`;

  const quote = email.text
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .split("\n")
    .join("<br/>\n");

  const html =
    "<div>\n" +
    htmlContent +
    `<br/><br/>` +
    `On ${new Date().toUTCString()} ${email.envelope.full} wrote:<br/>\n` +
    `<blockquote class="quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">\n` +
    `${quote}` +
    `</blockquote>\n` +
    "<div>\n";

  const msg = {
    from: {
      name,
      email: sender,
    },
    reply_to: sender,
    subject,
    html,
  };

  await sendEmail(email.envelope.from, msg);
}
