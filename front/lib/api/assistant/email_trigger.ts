import fs from "fs";
import sanitizeHtml from "sanitize-html";
import { Op } from "sequelize";
import { Readable } from "stream";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { sendEmail } from "@app/lib/api/email";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import { filterAndSortAgents } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  ConversationType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  Result,
  SupportedFileContentType,
} from "@app/types";
import { Err, isDevelopment, Ok } from "@app/types";

import { toFileContentFragment } from "./conversation/content_fragment";

const { PRODUCTION_DUST_WORKSPACE_ID } = process.env;

// Redis configuration for email reply context storage.
const REDIS_ORIGIN: RedisUsageTagsType = "email_context";
const EMAIL_REPLY_CONTEXT_PREFIX = "email-reply-context";
const EMAIL_REPLY_CONTEXT_TTL_SECONDS = 3 * 60 * 60; // 3 hours

/**
 * Data needed to reply to an email after agent message completion.
 */
export type EmailReplyContext = {
  subject: string;
  originalText: string;
  fromEmail: string;
  fromFull: string;
  agentConfigurationId: string;
  workspaceId: string;
  conversationId: string;
};

function isEmailReplyContext(value: unknown): value is EmailReplyContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "subject" in value &&
    typeof value.subject === "string" &&
    "originalText" in value &&
    typeof value.originalText === "string" &&
    "fromEmail" in value &&
    typeof value.fromEmail === "string" &&
    "fromFull" in value &&
    typeof value.fromFull === "string" &&
    "agentConfigurationId" in value &&
    typeof value.agentConfigurationId === "string" &&
    "workspaceId" in value &&
    typeof value.workspaceId === "string" &&
    "conversationId" in value &&
    typeof value.conversationId === "string"
  );
}

function makeEmailReplyContextKey(
  workspaceId: string,
  agentMessageId: string
): string {
  return `${EMAIL_REPLY_CONTEXT_PREFIX}:${workspaceId}:${agentMessageId}`;
}

/**
 * Store email reply context in Redis for later use when agent message completes.
 */
export async function storeEmailReplyContext(
  agentMessageId: string,
  context: EmailReplyContext
): Promise<void> {
  const redis = await getRedisClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(context.workspaceId, agentMessageId);

  await redis.set(key, JSON.stringify(context), {
    EX: EMAIL_REPLY_CONTEXT_TTL_SECONDS,
  });

  logger.info(
    { agentMessageId, key },
    "[email] Stored email reply context in Redis"
  );
}

/**
 * Retrieve and delete email reply context from Redis.
 * Returns null if not found (expired or never stored).
 */
export async function getAndDeleteEmailReplyContext(
  workspaceId: string,
  agentMessageId: string
): Promise<EmailReplyContext | null> {
  const redis = await getRedisClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(workspaceId, agentMessageId);

  const value = await redis.get(key);
  if (!value) {
    return null;
  }

  // Delete after retrieval to ensure we only reply once.
  await redis.del(key);

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    logger.warn(
      { agentMessageId, key },
      "[email] Failed to parse email reply context JSON from Redis"
    );
    return null;
  }

  if (!isEmailReplyContext(parsed)) {
    logger.warn(
      { agentMessageId, key },
      "[email] Invalid email reply context structure from Redis"
    );
    return null;
  }

  return parsed;
}

export const ASSISTANT_EMAIL_SUBDOMAIN = isDevelopment()
  ? "dev.dust.help"
  : "run.dust.help";

export type EmailAttachment = {
  filepath: string; // Temp file path from formidable
  filename: string; // Original filename
  contentType: string; // MIME type
  size: number; // File size in bytes
};

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
  attachments: EmailAttachment[];
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
      user: UserResource;
      defaultWorkspace: LightWorkspaceType;
    },
    EmailTriggerError
  >
> {
  const user = await UserResource.fetchByEmail(email);

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
  const workspace = isDevelopment()
    ? workspaces[0] // In dev, use the first available workspace.
    : workspaces.find(
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
    user,
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

/**
 * Trigger an email-based conversation without waiting for agent completion.
 * Stores email context in Redis and the reply is sent by the agent loop
 * finalization activity when the message completes.
 */
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
    },
    EmailTriggerError
  >
> {
  const localLogger = logger.child({});
  const user = auth.user();
  const workspace = auth.workspace();
  if (!user || !workspace) {
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
      spaceId: null,
    });
  }

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

  // Process email attachments as content fragments.
  for (const attachment of email.attachments) {
    try {
      const file = await FileResource.makeNew({
        contentType: attachment.contentType as SupportedFileContentType,
        fileName: attachment.filename,
        fileSize: attachment.size,
        userId: user.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        useCase: "conversation",
        useCaseMetadata: null,
      });

      const fileStream = fs.createReadStream(attachment.filepath);
      const processRes = await processAndStoreFile(auth, {
        file,
        content: {
          type: "readable",
          value: Readable.from(fileStream),
        },
      });

      if (processRes.isErr()) {
        localLogger.warn(
          {
            filename: attachment.filename,
            contentType: attachment.contentType,
            error: processRes.error.message,
          },
          "[email] Failed to process attachment, skipping."
        );
        continue;
      }

      const contentFragmentRes = await postNewContentFragment(
        auth,
        conversation,
        {
          title: attachment.filename,
          fileId: file.sId,
        },
        {
          username: user.username,
          fullName: user.fullName(),
          email: user.email,
          profilePictureUrl: user.imageUrl,
        }
      );

      if (contentFragmentRes.isErr()) {
        localLogger.warn(
          {
            filename: attachment.filename,
            error: contentFragmentRes.error.message,
          },
          "[email] Failed to create content fragment for attachment, skipping."
        );
        continue;
      }

      localLogger.info(
        { filename: attachment.filename },
        "[email] Added attachment as content fragment."
      );
    } catch (err) {
      localLogger.warn(
        {
          filename: attachment.filename,
          error: err instanceof Error ? err.message : "Unknown error",
        },
        "[email] Error processing attachment, skipping."
      );
    }
  }

  // Refresh conversation after adding attachments.
  if (email.attachments.length > 0) {
    const updatedConversationRes = await getConversation(
      auth,
      conversation.sId
    );
    if (updatedConversationRes.isOk()) {
      conversation = updatedConversationRes.value;
    }
  }

  const content =
    agentConfigurations
      .map((agent) => {
        return serializeMention(agent);
      })
      .join(" ") +
    " " +
    userMessage;

  const mentions = agentConfigurations.map((agent) => {
    return { configurationId: agent.sId };
  });

  // Post message WITHOUT waiting for completion - the reply will be sent
  // by the agent loop finalization activity.
  const messageRes = await postUserMessage(auth, {
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

  const { agentMessages } = messageRes.value;

  // Store email reply context in Redis for each agent message.
  // The finalization activity will use this to send the reply.
  // O(n²) acceptable: both arrays are small (typically 1-3 agents matching an email prefix).
  for (const agentMessage of agentMessages) {
    const agentConfig = agentConfigurations.find(
      (ac) => ac.sId === agentMessage.configuration.sId
    );
    if (agentConfig) {
      await storeEmailReplyContext(agentMessage.sId, {
        subject: email.subject,
        originalText: email.text,
        fromEmail: email.envelope.from,
        fromFull: email.envelope.full,
        agentConfigurationId: agentConfig.sId,
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      });
    }
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
      agentMessageCount: agentMessages.length,
    },
    "[email] Created conversation and posted message (async mode)."
  );

  return new Ok({ conversation });
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
    `On ${new Date().toUTCString()} ${sanitizeHtml(email.envelope.full, { allowedTags: [], allowedAttributes: {} })} wrote:<br/>\n` +
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
