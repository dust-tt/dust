import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { ASSISTANT_EMAIL_SUBDOMAIN } from "@app/lib/api/assistant/email/constants";
import config from "@app/lib/api/config";
import { sendEmail, sendEmailToRecipients } from "@app/lib/api/email";
import { generateValidationToken } from "@app/lib/api/email/validation_token";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { isFreePlan, isUpgraded } from "@app/lib/plans/plan_codes";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { filterAndSortAgents } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { SupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString, isStringArray } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import fs from "fs";
import sanitizeHtml from "sanitize-html";
import { Op } from "sequelize";
import { Readable } from "stream";

import { toFileContentFragment } from "../conversation/content_fragment";
import type { InboundEmailDkimResult } from "./inbound_auth";

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
  replyTo: string[];
  replyCc: string[];
  threadingMessageId: string | null;
  threadingInReplyTo: string | null;
  threadingReferences: string | null;
  agentConfigurationId: string;
  workspaceId: string;
  conversationId: string;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isEmailReplyContext(value: unknown): value is EmailReplyContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "subject" in value &&
    isString(value.subject) &&
    "originalText" in value &&
    isString(value.originalText) &&
    "fromEmail" in value &&
    isString(value.fromEmail) &&
    "fromFull" in value &&
    isString(value.fromFull) &&
    "replyTo" in value &&
    isStringArray(value.replyTo) &&
    "replyCc" in value &&
    isStringArray(value.replyCc) &&
    "threadingMessageId" in value &&
    isNullableString(value.threadingMessageId) &&
    "threadingInReplyTo" in value &&
    isNullableString(value.threadingInReplyTo) &&
    "threadingReferences" in value &&
    isNullableString(value.threadingReferences) &&
    "agentConfigurationId" in value &&
    isString(value.agentConfigurationId) &&
    "workspaceId" in value &&
    isString(value.workspaceId) &&
    "conversationId" in value &&
    isString(value.conversationId)
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
  const redis = await getRedisStreamClient({ origin: REDIS_ORIGIN });
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
 * Parse and validate a raw Redis value into an EmailReplyContext.
 */
function parseEmailReplyContext(
  value: string,
  agentMessageId: string,
  key: string
): EmailReplyContext | null {
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

/**
 * Retrieve email reply context from Redis without deleting it.
 * Returns null if not found (expired or never stored).
 */
export async function getEmailReplyContext(
  workspaceId: string,
  agentMessageId: string
): Promise<EmailReplyContext | null> {
  const redis = await getRedisStreamClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(workspaceId, agentMessageId);

  const value = await redis.get(key);
  if (!value) {
    return null;
  }

  return parseEmailReplyContext(value, agentMessageId, key);
}

/**
 * Delete email reply context from Redis.
 */
export async function deleteEmailReplyContext(
  workspaceId: string,
  agentMessageId: string
): Promise<void> {
  const redis = await getRedisStreamClient({ origin: REDIS_ORIGIN });
  const key = makeEmailReplyContextKey(workspaceId, agentMessageId);
  await redis.del(key);
}

export { ASSISTANT_EMAIL_SUBDOMAIN } from "@app/lib/api/assistant/email/constants";

export type EmailAttachment = {
  filepath: string; // Temp file path from formidable
  filename: string; // Original filename
  contentType: string; // MIME type
  size: number; // File size in bytes
};

export type EmailThreadingHeaders = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
};

export type InboundEmail = {
  subject: string;
  text: string;
  auth: { SPF: string; dkim: InboundEmailDkimResult[]; dkimRaw: string };
  threadingHeaders: EmailThreadingHeaders;
  // Human-visible RFC 5322 From header.
  sender: {
    email: string;
    full: string;
  };
  // SMTP envelope sender (MAIL FROM / return-path).
  envelope: {
    to: string[];
    cc: string[];
    bcc: string[];
    from: string;
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

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function deduplicateEmailAddresses(emails: string[]): string[] {
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const email of emails) {
    const normalizedEmail = normalizeEmailAddress(email);
    if (normalizedEmail.length === 0) {
      continue;
    }
    if (seen.has(normalizedEmail)) {
      continue;
    }
    seen.add(normalizedEmail);
    deduplicated.push(email.trim());
  }

  return deduplicated;
}

function isAssistantRecipient(email: string): boolean {
  return normalizeEmailAddress(email).endsWith(`@${ASSISTANT_EMAIL_SUBDOMAIN}`);
}

// Cap on total reply recipients (to + cc combined). To/Cc are sourced from raw email headers,
// which a sender can freely forge to list arbitrary addresses. The cap prevents using the agent
// as a bulk relay while leaving no impact on legitimate threads (nobody CCs 15+ people normally).
export const MAX_REPLY_RECIPIENTS = 15;

function formatEmailRecipients(recipients: string[]): string {
  return recipients.length > 0 ? recipients.join(", ") : "(none)";
}

function formatEmailHeaderValue(value: string): string {
  return value.replace(/\s*\n+\s*/g, " ").trim();
}

function escapeTagContent(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildEmailAdditionalContext({
  hasThreadHistory,
  attachmentCount,
}: {
  hasThreadHistory: boolean;
  attachmentCount: number;
}): string[] {
  const additionalContext: string[] = [];

  if (!hasThreadHistory && attachmentCount === 0) {
    return additionalContext;
  }

  if (hasThreadHistory) {
    additionalContext.push(
      "<email_thread_history_may_be_available_in_conversation>true</email_thread_history_may_be_available_in_conversation>"
    );
  }

  if (attachmentCount > 0) {
    additionalContext.push(
      `<email_attachment_count_may_be_available_in_conversation>${attachmentCount}</email_attachment_count_may_be_available_in_conversation>`
    );
  }

  return additionalContext;
}

function buildReferencesHeaderValue({
  inReplyTo,
  references,
}: {
  inReplyTo: string | null;
  references: string | null;
}): string | null {
  if (!inReplyTo) {
    return references;
  }
  if (!references) {
    return inReplyTo;
  }

  const referenceTokens = references.split(/\s+/).filter((token) => token);
  if (referenceTokens.includes(inReplyTo)) {
    return references;
  }

  return [...referenceTokens, inReplyTo].join(" ");
}

export function buildReplyThreadingHeaders(email: InboundEmail): {
  inReplyTo: string | null;
  references: string | null;
} {
  const inReplyTo =
    email.threadingHeaders.messageId ?? email.threadingHeaders.inReplyTo;
  const references = buildReferencesHeaderValue({
    inReplyTo,
    references: email.threadingHeaders.references,
  });

  return { inReplyTo, references };
}

function buildSendgridThreadingHeaders(
  email: InboundEmail
): Record<string, string> {
  const threadingHeaders = buildReplyThreadingHeaders(email);
  return {
    ...(threadingHeaders.inReplyTo
      ? { "In-Reply-To": threadingHeaders.inReplyTo }
      : {}),
    ...(threadingHeaders.references
      ? { References: threadingHeaders.references }
      : {}),
  };
}

export function buildSuccessReplyRecipients(email: InboundEmail): {
  to: string[];
  cc: string[];
} {
  const to = deduplicateEmailAddresses(
    [email.sender.email, ...email.envelope.to].filter(
      (recipient) => !isAssistantRecipient(recipient)
    )
  );

  const toSet = new Set(to.map(normalizeEmailAddress));
  const cc = deduplicateEmailAddresses(
    email.envelope.cc.filter((recipient) => {
      const normalizedRecipient = normalizeEmailAddress(recipient);
      return (
        !isAssistantRecipient(recipient) && !toSet.has(normalizedRecipient)
      );
    })
  );

  // Enforce recipient cap: the authenticated sender is always kept, extras are dropped from cc
  // first.
  const total = to.length + cc.length;
  if (total <= MAX_REPLY_RECIPIENTS) {
    return { to, cc };
  }
  const cappedCc = cc.slice(0, Math.max(0, MAX_REPLY_RECIPIENTS - to.length));
  logger.warn(
    { totalRecipients: total, cappedTo: to.length, cappedCc: cappedCc.length },
    "[email] Reply recipient list truncated to MAX_REPLY_RECIPIENTS."
  );
  return { to, cc: cappedCc };
}

export function buildEmailUserMessage({
  email,
  userMessage,
  replyRecipients,
  hasThreadHistory,
  attachmentCount,
}: {
  email: InboundEmail;
  userMessage: string;
  replyRecipients: {
    to: string[];
    cc: string[];
  };
  hasThreadHistory: boolean;
  attachmentCount: number;
}): string {
  const assistantRecipients = deduplicateEmailAddresses(
    [...email.envelope.to, ...email.envelope.cc, ...email.envelope.bcc].filter(
      isAssistantRecipient
    )
  );
  const toRecipients = deduplicateEmailAddresses(email.envelope.to);
  const ccRecipients = deduplicateEmailAddresses(email.envelope.cc);
  const additionalContext = buildEmailAdditionalContext({
    hasThreadHistory,
    attachmentCount,
  });

  return [
    "I sent the following email:",
    "",
    "<email_message>",
    `  <email_from>${escapeTagContent(
      formatEmailHeaderValue(email.sender.full)
    )}</email_from>`,
    `  <email_subject>${escapeTagContent(
      formatEmailHeaderValue(email.subject)
    )}</email_subject>`,
    `  <email_to>${escapeTagContent(
      formatEmailRecipients(toRecipients)
    )}</email_to>`,
    ...(ccRecipients.length > 0
      ? [
          `  <email_cc>${escapeTagContent(
            formatEmailRecipients(ccRecipients)
          )}</email_cc>`,
        ]
      : []),
    `  <dust_agent_recipients>${escapeTagContent(
      formatEmailRecipients(assistantRecipients)
    )}</dust_agent_recipients>`,
    "  <email_body>",
    escapeTagContent(userMessage),
    "  </email_body>",
    ...additionalContext.map((line) => `  ${line}`),
    `  <email_response_to>${escapeTagContent(
      formatEmailRecipients(replyRecipients.to)
    )}</email_response_to>`,
    ...(replyRecipients.cc.length > 0
      ? [
          `  <email_response_cc>${escapeTagContent(
            formatEmailRecipients(replyRecipients.cc)
          )}</email_response_cc>`,
        ]
      : []),
    "</email_message>",
    "",
    "You are in the recipients. Answer appropriately. Your full response will be emailed automatically as-is to the recipients listed above (and me).",
  ].join("\n");
}
export async function userAndWorkspaceFromEmail({
  email,
}: {
  email: string;
}): Promise<
  Result<
    {
      workspace: LightWorkspaceType;
      user: UserResource;
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
        `Please sign up for Dust at https://dust.tt to interact with assistants over email.`,
    });
  }
  const workspaceModels = await WorkspaceModel.findAll({
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
    order: [["id", "DESC"]],
  });

  if (workspaceModels.length === 0) {
    return new Err({
      type: "workspace_not_found",
      message:
        `Failed to match a valid Dust workspace associated with email: ${email}. ` +
        `Please sign up for Dust at https://dust.tt to interact with agents over email.`,
    });
  }

  // Filter to workspaces with the email_agents feature flag enabled.
  const eligibleWorkspaceModels: typeof workspaceModels = [];
  for (const w of workspaceModels) {
    const lightWorkspace = renderLightWorkspaceType({ workspace: w });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      lightWorkspace.sId
    );
    const flags = await getFeatureFlags(auth);
    if (
      flags.includes("email_agents") &&
      lightWorkspace.metadata?.allowEmailAgents === true
    ) {
      eligibleWorkspaceModels.push(w);
    }
  }

  if (eligibleWorkspaceModels.length === 0) {
    return new Err({
      type: "workspace_not_found",
      message:
        "Email interactions with agents are not enabled for any of your workspaces.",
    });
  }

  // Pick the best workspace: prefer paying plans, then upgraded free plans,
  // then fall back to the most recently created workspace.
  const subscriptionsByWorkspaceId =
    await SubscriptionResource.fetchActiveByWorkspacesModelId(
      eligibleWorkspaceModels.map((w) => w.id)
    );

  const payingWorkspace = eligibleWorkspaceModels.find((w) => {
    const sub = subscriptionsByWorkspaceId[w.id];
    return sub && !isFreePlan(sub.getPlan().code);
  });

  const upgradedWorkspace = eligibleWorkspaceModels.find((w) => {
    const sub = subscriptionsByWorkspaceId[w.id];
    return sub && isUpgraded(sub.getPlan());
  });

  // Ordered by id DESC, so first = most recently created.
  const mostRecentWorkspace = eligibleWorkspaceModels[0];

  const selectedWorkspace =
    payingWorkspace ?? upgradedWorkspace ?? mostRecentWorkspace;

  return new Ok({
    workspace: renderLightWorkspaceType({ workspace: selectedWorkspace }),
    user,
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
  let attachedContentCount = 0;
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

      attachedContentCount += 1;
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

  const successReplyRecipients = buildSuccessReplyRecipients(email);
  const content =
    agentConfigurations
      .map((agent) => {
        return serializeMention(agent);
      })
      .join(" ") +
    " " +
    buildEmailUserMessage({
      email,
      userMessage,
      replyRecipients: successReplyRecipients,
      hasThreadHistory: restOfThread.length > 0,
      attachmentCount: attachedContentCount,
    });

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
    // Tool validation is now handled via email with signed approval links.
    skipToolsValidation: false,
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
        fromEmail: email.sender.email,
        fromFull: email.sender.full,
        replyTo: successReplyRecipients.to,
        replyCc: successReplyRecipients.cc,
        threadingMessageId: email.threadingHeaders.messageId,
        threadingInReplyTo: email.threadingHeaders.inReplyTo,
        threadingReferences: email.threadingHeaders.references,
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

/**
 * Sends an email with tool approval links for blocked actions.
 */
export async function sendToolValidationEmail({
  email,
  agentConfiguration,
  blockedActions,
  conversation,
  workspace,
}: {
  email: InboundEmail;
  agentConfiguration: LightAgentConfigurationType;
  blockedActions: BlockedToolExecution[];
  conversation: { sId: string };
  workspace: LightWorkspaceType;
}): Promise<void> {
  const localLogger = logger.child({
    conversationId: conversation.sId,
    agentName: agentConfiguration.name,
  });

  const name = `Dust Agent (${agentConfiguration.name})`;
  const sender = `${agentConfiguration.name}@${ASSISTANT_EMAIL_SUBDOMAIN}`;

  const subject = email.subject
    .toLowerCase()
    .replaceAll(" ", "")
    .startsWith("re:")
    ? email.subject
    : `Re: ${email.subject}`;

  const baseUrl = config.getClientFacingUrl();
  const conversationUrl = getConversationRoute(
    workspace.sId,
    conversation.sId,
    undefined,
    config.getAppUrl()
  );

  // Build HTML for each blocked action.
  const actionBlocks = blockedActions.map((action) => {
    const approveToken = generateValidationToken(action.actionId, "approved");
    const rejectToken = generateValidationToken(action.actionId, "rejected");

    const approveUrl = `${baseUrl}/email/validation?token=${encodeURIComponent(approveToken)}`;
    const rejectUrl = `${baseUrl}/email/validation?token=${encodeURIComponent(rejectToken)}`;

    const inputsJson = JSON.stringify(action.inputs, null, 2)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const toolName = sanitizeHtml(action.metadata.toolName, {
      allowedTags: [],
      allowedAttributes: {},
    });
    const serverName = sanitizeHtml(action.metadata.mcpServerName, {
      allowedTags: [],
      allowedAttributes: {},
    });

    return `
      <div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 12px 0; background-color: #f9f9f9;">
        <h3 style="margin: 0 0 8px 0; color: #333;">${toolName}</h3>
        <p style="margin: 0 0 8px 0; color: #666;">Server: ${serverName}</p>
        <pre style="background-color: #fff; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #eee;">${inputsJson}</pre>
        <div style="margin-top: 12px;">
          <a href="${approveUrl}" style="display: inline-block; padding: 10px 20px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px; font-weight: 500;">Approve</a>
          <a href="${rejectUrl}" style="display: inline-block; padding: 10px 20px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">Reject</a>
        </div>
      </div>
    `;
  });

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <h2 style="color: #333;">Tool Approval Required</h2>
      <p>The agent <strong>@${sanitizeHtml(agentConfiguration.name, { allowedTags: [], allowedAttributes: {} })}</strong> needs your approval to execute the following tool(s):</p>
      ${actionBlocks.join("")}
      <p style="color: #666; margin-top: 16px;">Links expire in 24 hours.</p>
      <p><a href="${conversationUrl}" style="color: #2563eb;">View conversation in Dust</a></p>
    </div>
  `;

  const quote = email.text
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .split("\n")
    .join("<br/>\n");

  const html =
    "<div>\n" +
    htmlContent +
    `<br/><br/>` +
    `On ${new Date().toUTCString()} ${sanitizeHtml(email.sender.full, { allowedTags: [], allowedAttributes: {} })} wrote:<br/>\n` +
    `<blockquote class="quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">\n` +
    `${quote}` +
    `</blockquote>\n` +
    "<div>\n";

  const headers = buildSendgridThreadingHeaders(email);

  const msg = {
    from: {
      name,
      email: sender,
    },
    reply_to: sender,
    subject,
    html,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  try {
    await sendEmail(email.sender.email, msg);
    localLogger.info(
      { actionsCount: blockedActions.length },
      "[email] Sent tool validation email."
    );
  } catch (error) {
    localLogger.error(
      { error },
      "[email] Failed to send tool validation email."
    );
  }
}

export async function replyToEmail({
  email,
  agentConfiguration,
  htmlContent,
  recipients,
}: {
  email: InboundEmail;
  agentConfiguration?: LightAgentConfigurationType;
  htmlContent: string;
  recipients: {
    to: string[];
    cc: string[];
  };
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
    `On ${new Date().toUTCString()} ${sanitizeHtml(email.sender.full, { allowedTags: [], allowedAttributes: {} })} wrote:<br/>\n` +
    `<blockquote class="quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">\n` +
    `${quote}` +
    `</blockquote>\n` +
    "<div>\n";

  const headers = buildSendgridThreadingHeaders(email);

  const msg = {
    from: {
      name,
      email: sender,
    },
    reply_to: sender,
    subject,
    html,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  await sendEmailToRecipients({
    to: recipients.to,
    cc: recipients.cc,
    message: msg,
  });
}
