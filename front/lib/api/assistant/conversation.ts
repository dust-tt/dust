import _, { isEqual, sortBy } from "lodash";
import type { Transaction } from "sequelize";

import { runActionStreamed } from "@app/lib/actions/server";
import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
import { runAgent } from "@app/lib/api/assistant/agent";
import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import {
  getAgentConfigurations,
  getLightAgentConfiguration,
} from "@app/lib/api/assistant/configuration";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import {
  batchRenderMessages,
  canReadMessage,
} from "@app/lib/api/assistant/messages";
import { getContentFragmentGroupIds } from "@app/lib/api/assistant/permissions";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import {
  makeAgentMentionsRateLimitKeyForWorkspace,
  makeMessageRateLimitKeyForWorkspace,
} from "@app/lib/api/assistant/rate_limits";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import {
  AgentMessage,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isEmailValid, normalizeArrays } from "@app/lib/utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  AgentActionSuccessEvent,
  AgentDisabledErrorEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageErrorEvent,
  AgentMessageNewEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  AgentMessageWithRankType,
  ContentFragmentContextType,
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
  ContentFragmentType,
  ConversationTitleEvent,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  MaxMessagesTimeframeType,
  MentionType,
  PlanType,
  Result,
  UserMessageContext,
  UserMessageErrorEvent,
  UserMessageNewEvent,
  UserMessageType,
  UserMessageWithRankType,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  ConversationError,
  Err,
  getSmallWhitelistedModel,
  isAgentMention,
  isAgentMessageType,
  isContentFragmentInputWithContentNode,
  isContentFragmentType,
  isProviderWhitelisted,
  isUserMessageType,
  md5,
  Ok,
  removeNulls,
} from "@app/types";

function getTimeframeSecondsFromLiteral(
  timeframeLiteral: MaxMessagesTimeframeType
): number {
  switch (timeframeLiteral) {
    case "day":
      return 60 * 60 * 24; // 1 day.

    // Lifetime is intentionally mapped to a 30-day period.
    case "lifetime":
      return 60 * 60 * 24 * 30; // 30 days.

    default:
      return 0;
  }
}

/**
 * Conversation Creation, update and deletion
 */

export async function createConversation(
  auth: Authenticator,
  {
    title,
    visibility,
    depth = 0,
  }: {
    title: string | null;
    visibility: ConversationVisibility;
    depth?: number;
  }
): Promise<ConversationType> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.makeNew(auth, {
    sId: generateRandomModelSId(),
    title,
    visibility,
    depth,
    requestedGroupIds: [],
  });

  return {
    id: conversation.id,
    owner,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    title: conversation.title,
    visibility: conversation.visibility,
    depth: conversation.depth,
    content: [],
    requestedGroupIds:
      conversation.getConversationRequestedGroupIdsFromModel(auth),
  };
}

export async function updateConversationTitle(
  auth: Authenticator,
  {
    conversationId,
    title,
  }: {
    conversationId: string;
    title: string;
  }
): Promise<Result<ConversationType, ConversationError>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  await conversation.updateTitle(title);

  return getConversation(auth, conversationId);
}

/**
 *  Mark the conversation as deleted, but does not remove it from database
 *  unless destroy is explicitly set to true
 */
export async function deleteConversation(
  auth: Authenticator,
  {
    conversationId,
    destroy,
  }: {
    conversationId: string;
    destroy?: boolean;
  }
): Promise<Result<{ success: true }, ConversationError>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  if (destroy) {
    await conversation.delete(auth);
  } else {
    await conversation.updateVisibilityToDeleted();
  }
  return new Ok({ success: true });
}

export async function getConversation(
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false
): Promise<Result<ConversationType, ConversationError>> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    { includeDeleted }
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    order: [
      ["rank", "ASC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessage,
        as: "agentMessage",
        required: false,
        include: [
          {
            model: AgentStepContentModel,
            as: "agentStepContents",
            required: false,
          },
        ],
      },
      // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
      // along with messages in one query). Only once we move to a MessageResource will we be able
      // to properly abstract this.
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: false,
      },
    ],
  });

  const renderRes = await batchRenderMessages(
    auth,
    conversation.sId,
    messages,
    "full"
  );

  if (renderRes.isErr()) {
    return new Err(renderRes.error);
  }

  const render = renderRes.value;

  // We need to escape the type system here to create content. We pre-create an array that will hold
  // the versions of each User/Assistant/ContentFragment message. The lenght of that array is by definition the
  // maximal rank of the conversation messages we just retrieved. In the case there is no message
  // the rank is -1 and the array length is 0 as expected.
  const content: any[] = Array.from(
    { length: messages.reduce((acc, m) => Math.max(acc, m.rank), -1) + 1 },
    () => []
  );

  for (const { rank, ...m } of render) {
    content[rank] = [...content[rank], m];
  }

  return new Ok({
    id: conversation.id,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    owner,
    title: conversation.title,
    visibility: conversation.visibility,
    depth: conversation.depth,
    content,
    requestedGroupIds:
      conversation.getConversationRequestedGroupIdsFromModel(auth),
  });
}

export async function getConversationMessageType(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType,
  messageId: string
): Promise<"user_message" | "agent_message" | "content_fragment" | null> {
  if (!auth.workspace()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (!message) {
    return null;
  }

  if (message.userMessageId) {
    return "user_message";
  }
  if (message.agentMessageId) {
    return "agent_message";
  }
  if (message.contentFragment) {
    return "content_fragment";
  }

  return null;
}

/**
 * Title generation
 */

export async function generateConversationTitle(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error(`Failed to find a whitelisted model to generate title`)
    );
  }

  const MIN_GENERATION_TOKENS = 1024;

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel(auth, {
    conversation,
    model,
    prompt: "", // There is no prompt for title generation.
    tools: "",
    allowedTokenCount: model.contextSize - MIN_GENERATION_TOKENS,
    excludeActions: true,
    excludeImages: true,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const c = modelConversationRes.value.modelConversation;
  if (c.messages.length === 0) {
    // It is possible that no message were selected if the context size of the small model was
    // overflown by the initial user message. In that case we just skip title generation for now (it
    // will get attempted again with follow-up messages being added to the conversation).
    return new Err(
      new Error(
        `Error generating conversation title: rendered conversation is empty`
      )
    );
  }

  // Note: the last message is generally not a user message (though it can happen if no agent were
  // mentioned) which, without stitching, will cause the title generation to fail since models
  // expect a user message to be the last message. The stitching is done in the
  // `assistant-v2-title-generator` app.

  const config = cloneBaseConfig(
    getDustProdAction("assistant-v2-title-generator").config
  );
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-title-generator",
    config,
    [
      {
        conversation: c,
      },
    ],
    {
      conversationId: conversation.sId,
      workspaceId: conversation.owner.sId,
    }
  );

  if (res.isErr()) {
    return new Err(
      new Error(`Error generating conversation title: ${res.error}`)
    );
  }

  const { eventStream } = res.value;

  let title: string | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(
          `Error generating conversation title: ${event.content.message}`
        )
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(
          new Error(`Error generating conversation title: ${e.error}`)
        );
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (v.conversation_title) {
          title = v.conversation_title;
        }
      }
    }
  }

  if (title === null) {
    return new Err(
      new Error(`Error generating conversation title: malformed output`)
    );
  }

  return new Ok(title);
}

export async function getLastUserMessage(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const message = await Message.findOne({
    where: {
      workspaceId: owner.id,
      conversationId: conversation.id,
    },
    order: [
      ["rank", "DESC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
      },
    ],
  });

  const content = message?.userMessage?.content;
  if (!content) {
    return new Err(
      new Error("Error suggesting agents: no content found in conversation.")
    );
  }
  return new Ok(content);
}

/**
 * Conversation API
 */

/**
 * To avoid deadlocks when using Postgresql advisory locks, please make sure to not issue any other
 * SQL query outside of the transaction `t` that is holding the lock.
 * Otherwise, the other query will be competing for a connection in the database connection pool,
 * resulting in a potential deadlock when the pool is fully occupied.
 */
async function getConversationRankVersionLock(
  conversation: ConversationType,
  t: Transaction
) {
  const now = new Date();
  // Get a lock using the unique lock key (number withing postgresql BigInt range).
  const hash = md5(`conversation_message_rank_version_${conversation.id}`);
  const lockKey = parseInt(hash, 16) % 9999999999;
  // OK because we need to setup a lock
  // eslint-disable-next-line dust/no-raw-sql
  await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    transaction: t,
    replacements: { key: lockKey },
  });

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      duration: new Date().getTime() - now.getTime(),
      lockKey,
    },
    "[ASSISTANT_TRACE] Advisory lock acquired"
  );
}

async function attributeUserFromWorkspaceAndEmail(
  workspace: WorkspaceType | null,
  email: string | null
): Promise<UserType | null> {
  if (!workspace || !email || !isEmailValid(email)) {
    return null;
  }

  const matchingUser = await UserResource.fetchByEmail(email);
  if (!matchingUser) {
    return null;
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: matchingUser,
      workspace,
    });

  return membership ? matchingUser.toJSON() : null;
}

// This method is in charge of creating a new user message in database, running the necessary agents
// in response and updating accordingly the conversation. AgentMentions must point to valid agent
// configurations from the same workspace or whose scope is global.
export async function* postUserMessage(
  auth: Authenticator,
  {
    conversation,
    content,
    mentions,
    context,
    skipToolsValidation,
  }: {
    conversation: ConversationType;
    content: string;
    mentions: MentionType[];
    context: UserMessageContext;
    skipToolsValidation: boolean;
  }
): AsyncGenerator<
  | UserMessageErrorEvent
  | UserMessageNewEvent
  | AgentMessageNewEvent
  | AgentDisabledErrorEvent
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | ConversationTitleEvent,
  void
> {
  const user = auth.user();
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const plan = subscription?.plan;

  if (!owner || owner.id !== conversation.owner.id || !subscription || !plan) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    };
    return;
  }

  const featureFlags = await getFeatureFlags(owner);

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_access_restricted",
        message: "Conversation cannot be accessed.",
      },
    };
    return;
  }

  // Check plan and rate limit
  const messageLimit = await isMessagesLimitReached({
    owner,
    plan,
    mentions,
  });
  if (messageLimit.isLimitReached && messageLimit.limitType) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: messageLimit.limitType,
        message:
          messageLimit.limitType === "plan_message_limit_exceeded"
            ? "The message limit for this plan has been exceeded."
            : "The rate limit for this workspace has been exceeded.",
      },
    };
    return;
  }

  const results = await Promise.all([
    getAgentConfigurations({
      auth,
      agentsGetView: {
        agentIds: mentions
          .filter(isAgentMention)
          .map((mention) => mention.configurationId),
      },
      variant: "light",
    }),
    (() => {
      // If the origin of the user message is "run_agent", we do not want to update the
      // participation of the user so that the conversation does not appear in the user's history.
      if (context.origin === "run_agent") {
        return;
      }

      return ConversationResource.upsertParticipation(auth, conversation);
    })(),
  ]);

  const agentConfigurations = removeNulls(results[0]);

  for (const agentConfig of agentConfigurations) {
    if (!canAccessAgent(agentConfig)) {
      yield {
        type: "agent_disabled_error",
        created: Date.now(),
        configurationId: agentConfig.sId,
        error: {
          code: "not_allowed",
          message:
            "This agent is either disabled or you don't have access to it.",
        },
      };
      return;
    }

    if (!isProviderWhitelisted(owner, agentConfig.model.providerId)) {
      yield {
        type: "agent_disabled_error",
        created: Date.now(),
        configurationId: agentConfig.sId,
        error: {
          code: "provider_disabled",
          message:
            `Assistant ${agentConfig.name} is based on a model that was disabled ` +
            `by your workspace admin. Please edit the agent to use another model ` +
            `(advanced settings in the Instructions panel).`,
        },
      };
      return; // Stop processing if any agent uses a disabled provider
    }
    const supportedModelConfig = getSupportedModelConfig(agentConfig.model);
    if (
      supportedModelConfig.featureFlag &&
      !featureFlags.includes(supportedModelConfig.featureFlag)
    ) {
      yield {
        type: "agent_disabled_error",
        created: Date.now(),
        configurationId: agentConfig.sId,
        error: {
          code: "model_not_supported",
          message: "The model is not supported.",
        },
      };
      return;
    }
  }

  // In one big transaction creante all Message, UserMessage, AgentMessage and Mention rows.
  const { userMessage, agentMessages, agentMessageRows } =
    await frontSequelize.transaction(async (t) => {
      // Since we are getting a transaction level lock, we can't execute any other SQL query outside of
      // this transaction, otherwise this other query will be competing for a connection in the database
      // connection pool, resulting in a deadlock.
      await getConversationRankVersionLock(conversation, t);

      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;

      async function createMessageAndUserMessage(workspace: WorkspaceType) {
        return Message.create(
          {
            sId: generateRandomModelSId(),
            rank: nextMessageRank++,
            conversationId: conversation.id,
            parentId: null,
            userMessageId: (
              await UserMessage.create(
                {
                  content,
                  // TODO(MCP Clean-up): Rename field in DB.
                  clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
                  userContextUsername: context.username,
                  userContextTimezone: context.timezone,
                  userContextFullName: context.fullName,
                  userContextEmail: context.email,
                  userContextProfilePictureUrl: context.profilePictureUrl,
                  userContextOrigin: context.origin,
                  userId: user
                    ? user.id
                    : (
                        await attributeUserFromWorkspaceAndEmail(
                          workspace,
                          context.email
                        )
                      )?.id,
                  workspaceId: workspace.id,
                },
                { transaction: t }
              )
            ).id,
            workspaceId: workspace.id,
          },
          {
            transaction: t,
          }
        );
      }

      const m = await createMessageAndUserMessage(owner);
      const userMessage: UserMessageWithRankType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "user_message",
        visibility: "visible",
        version: 0,
        user: user?.toJSON() ?? null,
        mentions,
        content,
        context,
        rank: m.rank,
      };

      const results: ({ row: AgentMessage; m: AgentMessageType } | null)[] =
        await Promise.all(
          mentions.filter(isAgentMention).map((mention) => {
            // For each assistant/agent mention, create an "empty" agent message.
            return (async () => {
              // `getAgentConfiguration` checks that we're only pulling a configuration from the
              // same workspace or a global one.
              const configuration = agentConfigurations.find(
                (ac) => ac.sId === mention.configurationId
              );
              if (!configuration) {
                return null;
              }

              await Mention.create(
                {
                  messageId: m.id,
                  agentConfigurationId: configuration.sId,
                  workspaceId: owner.id,
                },
                { transaction: t }
              );

              const agentMessageRow = await AgentMessage.create(
                {
                  status: "created",
                  agentConfigurationId: configuration.sId,
                  agentConfigurationVersion: configuration.version,
                  workspaceId: owner.id,
                  skipToolsValidation,
                },
                { transaction: t }
              );
              const messageRow = await Message.create(
                {
                  sId: generateRandomModelSId(),
                  rank: nextMessageRank++,
                  conversationId: conversation.id,
                  parentId: userMessage.id,
                  agentMessageId: agentMessageRow.id,
                  workspaceId: owner.id,
                },
                {
                  transaction: t,
                }
              );

              return {
                row: agentMessageRow,
                m: {
                  id: messageRow.id,
                  agentMessageId: agentMessageRow.id,
                  created: agentMessageRow.createdAt.getTime(),
                  sId: messageRow.sId,
                  type: "agent_message",
                  visibility: "visible",
                  version: 0,
                  parentMessageId: userMessage.sId,
                  status: "created",
                  actions: [],
                  content: null,
                  chainOfThought: null,
                  rawContents: [],
                  error: null,
                  configuration,
                  rank: messageRow.rank,
                  skipToolsValidation: agentMessageRow.skipToolsValidation,
                  contents: [],
                } satisfies AgentMessageWithRankType,
              };
            })();
          })
        );

      const nonNullResults = results.filter((r) => r !== null) as {
        row: AgentMessage;
        m: AgentMessageWithRankType;
      }[];

      await updateConversationRequestedGroupIds(auth, {
        agents: nonNullResults.map(({ m }) => m.configuration),
        conversation,
        t,
      });

      return {
        userMessage,
        agentMessages: nonNullResults.map(({ m }) => m),
        agentMessageRows: nonNullResults.map(({ row }) => row),
      };
    });

  if (agentMessageRows.length !== agentMessages.length) {
    throw new Error("Unreachable: agentMessageRows and agentMessages mismatch");
  }

  if (agentMessages.length > 0) {
    for (const agentMessage of agentMessages) {
      void signalAgentUsage({
        agentConfigurationId: agentMessage.configuration.sId,
        workspaceId: owner.sId,
      });
    }
  }
  void ServerSideTracking.trackUserMessage({
    userMessage,
    workspace: conversation.owner,
    userId: user ? `user-${user.id}` : `api-${context.username}`,
    conversationId: conversation.sId,
    agentMessages: agentMessages,
  });

  yield {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  for (let i = 0; i < agentMessages.length; i++) {
    const agentMessage = agentMessages[i];

    yield {
      type: "agent_message_new",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
    };
  }

  const eventStreamGenerators = agentMessages.map((agentMessage, i) => {
    // We stitch the conversation to add the user message and only that agent message
    // so that it can be used to prompt the agent.
    const eventStream = runAgent(
      auth,
      agentMessage.configuration,
      {
        ...conversation,
        content: [...conversation.content, [userMessage], [agentMessage]],
      },
      userMessage,
      agentMessage
    );

    return streamRunAgentEvents(
      auth,
      eventStream,
      agentMessages[i],
      agentMessageRows[i]
    );
  });

  const eventStreamsPromises = eventStreamGenerators.map((gen) => gen.next());
  while (eventStreamsPromises.length > 0) {
    const winner = await Promise.race(
      eventStreamsPromises.map(async (p, i) => {
        return { v: await p, offset: i };
      })
    );
    if (winner.v.done) {
      eventStreamGenerators.splice(winner.offset, 1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      eventStreamsPromises.splice(winner.offset, 1);
    } else {
      eventStreamsPromises[winner.offset] =
        eventStreamGenerators[winner.offset].next();
      yield winner.v.value;
    }
  }

  // Generate a new title if the conversation does not have one already.
  if (conversation.title === null) {
    const titleRes = await generateConversationTitle(auth, {
      ...conversation,
      content: [
        ...conversation.content,
        [userMessage],
        ...agentMessages.map((m) => [m]),
      ],
    });
    if (titleRes.isErr()) {
      logger.error(
        {
          error: titleRes.error,
        },
        "Conversation title generation error"
      );
    } else {
      const title = titleRes.value;
      await ConversationResource.updateTitle(auth, conversation.sId, title);
      yield {
        type: "conversation_title",
        created: Date.now(),
        title,
      };
    }
  }

  await launchUpdateUsageWorkflow({ workspaceId: owner.sId });

  // Temporary: we want to monitor if we need to prevent it or not
  async function logIfUserUnknown() {
    try {
      if (!user && context.email) {
        const macthingUser = await UserResource.fetchByEmail(context.email);

        if (!macthingUser) {
          logger.warn(
            {
              conversationId: conversation.sId,
              workspaceId: owner?.sId,
            },
            "[postUserMessage] Generated a message for a user with an unknown email address."
          );
        }
      }
    } catch (e) {
      logger.error(
        {
          error: e,
        },
        "[postUserMessage] Failed to check if user is known."
      );
    }
  }
  void logIfUserUnknown();
}

/**
 * Can a user mention a given configuration
 */
function canAccessAgent(
  agentConfiguration: LightAgentConfigurationType
): boolean {
  switch (agentConfiguration.status) {
    case "active":
    case "draft":
      return agentConfiguration.canRead;
    case "disabled_free_workspace":
    case "disabled_missing_datasource":
    case "disabled_by_admin":
    case "archived":
      return false;
    default:
      assertNever(agentConfiguration.status);
  }
}

/**
 * This method creates a new user message version, and if there are new agent mentions, run them.
 */
export async function* editUserMessage(
  auth: Authenticator,
  {
    conversation,
    message,
    content,
    mentions,
    skipToolsValidation,
  }: {
    conversation: ConversationType;
    message: UserMessageType;
    content: string;
    mentions: MentionType[];
    skipToolsValidation: boolean;
  }
): AsyncGenerator<
  | UserMessageNewEvent
  | UserMessageErrorEvent
  | AgentMessageNewEvent
  | AgentDisabledErrorEvent
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  const user = auth.user();
  const owner = auth.workspace();

  if (!owner || owner.id !== conversation.owner.id) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_not_found",
        message: "The conversation does not exist.",
      },
    };
    return;
  }

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "conversation_access_restricted",
        message: "Conversation cannot be accessed.",
      },
    };
    return;
  }

  if (auth.user()?.id !== message.user?.id) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "not_allowed",
        message: "Only the author of the message can edit it",
      },
    };
    return;
  }
  if (message.mentions.filter((m) => isAgentMention(m)).length > 0) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "not_allowed",
        message:
          "Editing a message that already has agent mentions is not yet supported",
      },
    };
    return;
  }

  if (
    !conversation.content[conversation.content.length - 1].some(
      (m) => m.sId === message.sId
    ) &&
    mentions.filter((m) => isAgentMention(m)).length > 0
  ) {
    yield {
      type: "user_message_error",
      created: Date.now(),
      error: {
        code: "edition_unsupported",
        message:
          "Adding agent mentions when editing is only supported for the last message of the conversation",
      },
    };
    return;
  }

  // local error class to differentiate from other errors
  class UserMessageError extends Error {}

  let userMessage: UserMessageWithRankType | null = null;
  let agentMessages: AgentMessageWithRankType[] = [];
  let agentMessageRows: AgentMessage[] = [];

  const results = await Promise.all([
    Promise.all(
      mentions.filter(isAgentMention).map((mention) => {
        return getLightAgentConfiguration(auth, mention.configurationId);
      })
    ),
    ConversationResource.upsertParticipation(auth, conversation),
  ]);

  const agentConfigurations = removeNulls(results[0]);

  for (const agentConfig of agentConfigurations) {
    if (!canAccessAgent(agentConfig)) {
      yield {
        type: "agent_disabled_error",
        created: Date.now(),
        configurationId: agentConfig.sId,
        error: {
          code: "not_allowed",
          message:
            "This agent is either disabled or you don't have access to it.",
        },
      };
      return;
    }

    if (!isProviderWhitelisted(owner, agentConfig.model.providerId)) {
      yield {
        type: "agent_disabled_error",
        created: Date.now(),
        configurationId: agentConfig.sId,
        error: {
          code: "provider_disabled",
          message:
            `Assistant ${agentConfig.name} is based on a model that was disabled ` +
            `by your workspace admin. Please edit the agent to use another model ` +
            `(advanced settings in the Instructions panel).`,
        },
      };
      return; // Stop processing if any agent uses a disabled provider
    }
  }

  try {
    // In one big transaction creante all Message, UserMessage, AgentMessage and Mention rows.
    const result = await frontSequelize.transaction(async (t) => {
      // Since we are getting a transaction level lock, we can't execute any other SQL query outside of
      // this transaction, otherwise this other query will be competing for a connection in the database
      // connection pool, resulting in a deadlock.
      await getConversationRankVersionLock(conversation, t);

      const messageRow = await Message.findOne({
        where: {
          sId: message.sId,
          conversationId: conversation.id,
          workspaceId: owner.id,
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: true,
          },
        ],
        transaction: t,
      });
      if (!messageRow || !messageRow.userMessage) {
        throw new Error(
          "Unexpected: Message or UserMessage to edit not found in DB"
        );
      }
      const newerMessage = await Message.findOne({
        where: {
          workspaceId: owner.id,
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
        transaction: t,
      });
      if (newerMessage) {
        throw new UserMessageError(
          "Invalid user message edit request, this message was already edited."
        );
      }
      const userMessageRow = messageRow.userMessage;
      // adding messageRow as param otherwise Ts doesn't get it can't be null
      async function createMessageAndUserMessage(
        workspace: WorkspaceType,
        messageRow: Message
      ) {
        return Message.create(
          {
            sId: generateRandomModelSId(),
            rank: messageRow.rank,
            conversationId: conversation.id,
            parentId: messageRow.parentId,
            version: messageRow.version + 1,
            userMessageId: (
              await UserMessage.create(
                {
                  content,
                  // No support for client-side MCP servers when editing/retrying a user message.
                  clientSideMCPServerIds: [],
                  userContextUsername: userMessageRow.userContextUsername,
                  userContextTimezone: userMessageRow.userContextTimezone,
                  userContextFullName: userMessageRow.userContextFullName,
                  userContextEmail: userMessageRow.userContextEmail,
                  userContextProfilePictureUrl:
                    userMessageRow.userContextProfilePictureUrl,
                  userContextOrigin: userMessageRow.userContextOrigin,
                  userId: userMessageRow.userId
                    ? userMessageRow.userId
                    : (
                        await attributeUserFromWorkspaceAndEmail(
                          workspace,
                          userMessageRow.userContextEmail
                        )
                      )?.id,
                  workspaceId: workspace.id,
                },
                { transaction: t }
              )
            ).id,
            workspaceId: workspace.id,
          },
          {
            transaction: t,
          }
        );
      }

      const m = await createMessageAndUserMessage(owner, messageRow);

      const userMessage: UserMessageWithRankType = {
        id: m.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "user_message",
        visibility: m.visibility,
        version: m.version,
        user: user?.toJSON() ?? null,
        mentions,
        content,
        context: message.context,
        rank: m.rank,
      };

      // For now agent messages are appended at the end of conversation
      // it is fine since for now editing with new mentions is only supported
      // for the last user message
      let nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;
      const results: ({
        row: AgentMessage;
        m: AgentMessageWithRankType;
      } | null)[] = await Promise.all(
        mentions.filter(isAgentMention).map((mention) => {
          // For each assistant/agent mention, create an "empty" agent message.
          return (async () => {
            // `getAgentConfiguration` checks that we're only pulling a configuration from the
            // same workspace or a global one.
            const configuration = agentConfigurations.find(
              (ac) => ac.sId === mention.configurationId
            );
            if (!configuration) {
              return null;
            }

            await Mention.create(
              {
                messageId: m.id,
                agentConfigurationId: configuration.sId,
                workspaceId: owner.id,
              },
              { transaction: t }
            );

            const agentMessageRow = await AgentMessage.create(
              {
                status: "created",
                agentConfigurationId: configuration.sId,
                agentConfigurationVersion: configuration.version,
                workspaceId: owner.id,
                skipToolsValidation,
              },
              { transaction: t }
            );
            const messageRow = await Message.create(
              {
                sId: generateRandomModelSId(),
                rank: nextMessageRank++,
                conversationId: conversation.id,
                parentId: userMessage.id,
                agentMessageId: agentMessageRow.id,
                workspaceId: owner.id,
              },
              {
                transaction: t,
              }
            );

            return {
              row: agentMessageRow,
              m: {
                id: messageRow.id,
                agentMessageId: agentMessageRow.id,
                created: agentMessageRow.createdAt.getTime(),
                sId: messageRow.sId,
                type: "agent_message",
                visibility: "visible",
                version: 0,
                parentMessageId: userMessage.sId,
                status: "created",
                actions: [],
                content: null,
                chainOfThought: null,
                rawContents: [],
                error: null,
                configuration,
                rank: messageRow.rank,
                skipToolsValidation: agentMessageRow.skipToolsValidation,
                contents: [],
              } satisfies AgentMessageWithRankType,
            };
          })();
        })
      );

      const nonNullResults = results.filter((r) => r !== null) as {
        row: AgentMessage;
        m: AgentMessageWithRankType;
      }[];

      await updateConversationRequestedGroupIds(auth, {
        agents: nonNullResults.map(({ m }) => m.configuration),
        conversation,
        t,
      });

      return {
        userMessage,
        agentMessages: nonNullResults.map(({ m }) => m),
        agentMessageRows: nonNullResults.map(({ row }) => row),
      };
    });
    userMessage = result.userMessage;
    agentMessages = result.agentMessages;
    agentMessageRows = result.agentMessageRows;
    if (!userMessage) {
      throw new UserMessageError("Unreachable: userMessage is null");
    }
  } catch (e) {
    if (e instanceof UserMessageError) {
      yield {
        type: "user_message_error",
        created: Date.now(),
        error: {
          code: "edit_invalid_error",
          message: e.message,
        },
      };
      return;
    } else {
      throw e;
    }
  }

  if (agentMessageRows.length !== agentMessages.length) {
    throw new Error("Unreachable: agentMessageRows and agentMessages mismatch");
  }

  yield {
    type: "user_message_new",
    created: Date.now(),
    messageId: userMessage.sId,
    message: userMessage,
  };

  if (agentMessages.length > 0) {
    for (const agentMessage of agentMessages) {
      void signalAgentUsage({
        agentConfigurationId: agentMessage.configuration.sId,
        workspaceId: owner.sId,
      });
    }
  }

  for (let i = 0; i < agentMessages.length; i++) {
    const agentMessage = agentMessages[i];

    yield {
      type: "agent_message_new",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
    };
  }

  const eventStreamGenerators = agentMessages.map((agentMessage, i) => {
    if (!userMessage) {
      throw new Error("Unreachable: userMessage is null");
    }
    // We stitch the conversation to add the user message and only that agent message
    // so that it can be used to prompt the agent.
    const eventStream = runAgent(
      auth,
      agentMessage.configuration,
      {
        ...conversation,
        content: [...conversation.content, [userMessage], [agentMessage]],
      },
      userMessage,
      agentMessage
    );

    return streamRunAgentEvents(
      auth,
      eventStream,
      agentMessages[i],
      agentMessageRows[i]
    );
  });

  const eventStreamsPromises = eventStreamGenerators.map((gen) => gen.next());
  while (eventStreamsPromises.length > 0) {
    const winner = await Promise.race(
      eventStreamsPromises.map(async (p, i) => {
        return { v: await p, offset: i };
      })
    );
    if (winner.v.done) {
      eventStreamGenerators.splice(winner.offset, 1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      eventStreamsPromises.splice(winner.offset, 1);
    } else {
      eventStreamsPromises[winner.offset] =
        eventStreamGenerators[winner.offset].next();
      yield winner.v.value;
    }
  }
}

// This method is in charge of re-running an agent interaction (generating a new
// AgentMessage as a result)
export async function* retryAgentMessage(
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }
): AsyncGenerator<
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentMessageErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  class AgentMessageError extends Error {}

  if (!canReadMessage(auth, message)) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: message.configuration.sId,
      messageId: message.sId,
      error: {
        code: "message_access_denied",
        message: "The message to retry is not accessible.",
        metadata: null,
      },
    };
    return;
  }

  let agentMessageResult: {
    agentMessage: AgentMessageWithRankType;
    agentMessageRow: AgentMessage;
  } | null = null;
  try {
    agentMessageResult = await frontSequelize.transaction(async (t) => {
      await getConversationRankVersionLock(conversation, t);

      const messageRow = await Message.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          id: message.id,
        },
        include: [
          {
            model: AgentMessage,
            as: "agentMessage",
            required: true,
          },
        ],
        transaction: t,
      });

      if (!messageRow || !messageRow.agentMessage) {
        return null;
      }
      const newerMessage = await Message.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
        transaction: t,
      });
      if (newerMessage) {
        throw new AgentMessageError(
          "Invalid agent message retry request, this message was already retried."
        );
      }
      const agentMessageRow = await AgentMessage.create(
        {
          status: "created",
          agentConfigurationId: messageRow.agentMessage.agentConfigurationId,
          agentConfigurationVersion:
            messageRow.agentMessage.agentConfigurationVersion,
          workspaceId: auth.getNonNullableWorkspace().id,
          skipToolsValidation: messageRow.agentMessage.skipToolsValidation,
        },
        { transaction: t }
      );
      const m = await Message.create(
        {
          sId: generateRandomModelSId(),
          rank: messageRow.rank,
          conversationId: conversation.id,
          parentId: messageRow.parentId,
          version: messageRow.version + 1,
          agentMessageId: agentMessageRow.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        {
          transaction: t,
        }
      );

      await updateConversationRequestedGroupIds(auth, {
        agents: [message.configuration],
        conversation,
        t,
      });

      const agentMessage: AgentMessageWithRankType = {
        id: m.id,
        agentMessageId: agentMessageRow.id,
        created: m.createdAt.getTime(),
        sId: m.sId,
        type: "agent_message",
        visibility: m.visibility,
        version: m.version,
        parentMessageId: message.parentMessageId,
        status: "created",
        actions: [],
        content: null,
        chainOfThought: null,
        rawContents: [],
        error: null,
        configuration: message.configuration,
        rank: m.rank,
        skipToolsValidation: agentMessageRow.skipToolsValidation,
        contents: [],
      };

      return {
        agentMessage,
        agentMessageRow,
      };
    });
  } catch (e) {
    if (e instanceof AgentMessageError) {
      yield {
        type: "agent_message_error",
        created: Date.now(),
        configurationId: message.configuration.sId,
        error: {
          code: "retry_failed",
          message: e.message,
        },
      };
      return;
    }
    throw e;
  }

  if (!agentMessageResult) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: message.configuration.sId,
      messageId: message.sId,
      error: {
        code: "message_not_found",
        message: "The message to retry was not found",
        metadata: null,
      },
    };
    return;
  }

  const { agentMessage, agentMessageRow } = agentMessageResult;

  yield {
    type: "agent_message_new",
    created: Date.now(),
    configurationId: agentMessage.configuration.sId,
    messageId: agentMessage.sId,
    message: agentMessage,
  };

  // We stitch the conversation to retry the agent message correctly: no other
  // messages than this agent's past its parent message.

  // First, find the array of the parent message in conversation.content.
  const parentMessageIndex = conversation.content.findIndex((messages) => {
    return messages.some((m) => m.sId === agentMessage.parentMessageId);
  });
  if (parentMessageIndex === -1) {
    throw new Error(
      `Parent message ${agentMessage.parentMessageId} not found in conversation`
    );
  }

  // Then, find this agentmessage's array in conversation.content and add the
  // new agent message to it.
  const agentMessageArray = conversation.content.find((messages) => {
    return messages.some((m) => m.sId === message.sId && isAgentMessageType(m));
  }) as AgentMessageType[];
  agentMessageArray.push(agentMessage);

  // Finally, stitch the conversation.
  const newContent = [
    ...conversation.content.slice(0, parentMessageIndex + 1),
    [...agentMessageArray, agentMessage],
  ];

  const userMessage =
    conversation.content[parentMessageIndex][
      conversation.content[parentMessageIndex].length - 1
    ];
  if (!isUserMessageType(userMessage)) {
    throw new Error("Unreachable: parent message must be a user message");
  }

  const eventStream = runAgent(
    auth,
    agentMessage.configuration,
    {
      ...conversation,
      content: newContent,
    },
    userMessage,
    agentMessage
  );

  yield* streamRunAgentEvents(auth, eventStream, agentMessage, agentMessageRow);
}

// Injects a new content fragment in the conversation.
export async function postNewContentFragment(
  auth: Authenticator,
  conversation: ConversationType,
  cf: ContentFragmentInputWithFileIdType | ContentFragmentInputWithContentNode,
  context: ContentFragmentContextType | null
): Promise<Result<ContentFragmentType, Error>> {
  const owner = auth.workspace();
  if (!owner || owner.id !== conversation.owner.id) {
    throw new Error("Invalid auth for conversation.");
  }

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const upsertAttachmentRes = await maybeUpsertFileAttachment(auth, {
    contentFragments: [cf],
    conversation,
  });

  if (upsertAttachmentRes.isErr()) {
    return upsertAttachmentRes;
  }

  const messageId = generateRandomModelSId();

  const cfBlobRes = await getContentFragmentBlob(auth, cf);
  if (cfBlobRes.isErr()) {
    return cfBlobRes;
  }

  const supersededContentFragmentId = cf.supersededContentFragmentId;
  // If the request is superseding an existing content fragment, we need to validate that it exists
  // and is part of the conversation.
  if (supersededContentFragmentId) {
    const found = conversation.content.some((versions) => {
      const latest = versions[versions.length - 1];
      return (
        isContentFragmentType(latest) &&
        latest.contentFragmentId === supersededContentFragmentId
      );
    });

    if (!found) {
      return new Err(new Error("Superseded content fragment not found."));
    }
  }

  const { contentFragment, messageRow } = await frontSequelize.transaction(
    async (t) => {
      await getConversationRankVersionLock(conversation, t);

      const fullBlob = {
        ...cfBlobRes.value,
        userId: auth.user()?.id,
        userContextProfilePictureUrl: context?.profilePictureUrl,
        userContextEmail: context?.email,
        userContextFullName: context?.fullName,
        userContextUsername: context?.username,
        workspaceId: owner.id,
      };

      const contentFragment = await (() => {
        if (supersededContentFragmentId) {
          return ContentFragmentResource.makeNewVersion(
            supersededContentFragmentId,
            fullBlob,
            t
          );
        } else {
          return ContentFragmentResource.makeNew(fullBlob, t);
        }
      })();

      const nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;
      const messageRow = await Message.create(
        {
          sId: messageId,
          rank: nextMessageRank,
          conversationId: conversation.id,
          contentFragmentId: contentFragment.id,
          workspaceId: owner.id,
        },
        {
          transaction: t,
        }
      );

      if (isContentFragmentInputWithContentNode(cf)) {
        await updateConversationRequestedGroupIds(auth, {
          contentFragment: cf,
          conversation,
          t,
        });
      }

      return { contentFragment, messageRow };
    }
  );
  const render = await contentFragment.renderFromMessage({
    auth,
    conversationId: conversation.sId,
    message: messageRow,
  });

  return new Ok(render);
}

async function* streamRunAgentEvents(
  auth: Authenticator,
  eventStream: AsyncGenerator<
    | AgentErrorEvent
    | AgentActionSpecificEvent
    | AgentActionSuccessEvent
    | GenerationTokensEvent
    | AgentGenerationCancelledEvent
    | AgentMessageSuccessEvent,
    void
  >,
  agentMessage: AgentMessageType,
  agentMessageRow: AgentMessage
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  if (!canReadMessage(auth, agentMessage)) {
    yield {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "agent_not_allowed",
        message: "Agent cannot be used by this user",
        metadata: null,
      },
    };
    return;
  }

  for await (const event of eventStream) {
    switch (event.type) {
      case "agent_error":
        // Store error in database.
        await agentMessageRow.update({
          status: "failed",
          errorCode: event.error.code,
          errorMessage: event.error.message,
          errorMetadata: event.error.metadata,
        });
        yield event;
        return;

      case "agent_action_success":
        yield event;
        break;
      case "agent_message_success":
        // Store message in database.
        await agentMessageRow.update({
          runIds: event.runIds,
        });
        // Update status in database.
        await agentMessageRow.update({
          status: "succeeded",
        });
        yield event;
        break;

      case "agent_generation_cancelled":
        if (agentMessageRow.status !== "cancelled") {
          await agentMessageRow.update({
            status: "cancelled",
          });
          yield event;
        }
        break;

      // All other events that won't impact the database and are related to actions or tokens
      // generation.
      case "conversation_include_file_params":
      case "dust_app_run_block":
      case "dust_app_run_params":
      case "generation_tokens":
      case "search_labels_params":
      case "tool_approve_execution":
      case "tool_notification":
      case "tool_params":
        yield event;
        break;

      default:
        assertNever(event);
    }
  }
}

export interface MessageLimit {
  isLimitReached: boolean;
  limitType: "rate_limit_error" | "plan_message_limit_exceeded" | null;
}

async function isMessagesLimitReached({
  owner,
  plan,
  mentions,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  mentions: MentionType[];
}): Promise<MessageLimit> {
  // Checking rate limit
  const activeSeats = await countActiveSeatsInWorkspaceCached(owner.sId);

  const userMessagesLimit = 10 * activeSeats;
  const remainingMessages = await rateLimiter({
    key: makeMessageRateLimitKeyForWorkspace(owner),
    maxPerTimeframe: userMessagesLimit,
    timeframeSeconds: 60,
    logger,
  });

  if (remainingMessages <= 0) {
    return {
      isLimitReached: true,
      limitType: "rate_limit_error",
    };
  }

  // Checking plan limit
  if (mentions.length === 0) {
    return {
      isLimitReached: false,
      limitType: null,
    };
  }
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  if (plan.limits.assistant.maxMessages === -1) {
    return {
      isLimitReached: false,
      limitType: null,
    };
  }

  // Accounting for each mention separately.
  // The return value won't account for the parallel calls depending on network timing
  // but we are fine with a little bit of overusage.
  const remainingMentions = await Promise.all(
    mentions.map(() =>
      rateLimiter({
        key: makeAgentMentionsRateLimitKeyForWorkspace(
          owner,
          maxMessagesTimeframe
        ),
        maxPerTimeframe: maxMessages * activeSeats,
        timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
        logger,
      })
    )
  );
  // We let the user talk to all agents if any of the rate limiter answered "ok".
  // Subsequent calls to this function would block the user anyway.
  const isLimitReached = remainingMentions.filter((r) => r > 0).length === 0;
  return {
    isLimitReached,
    limitType: isLimitReached ? "plan_message_limit_exceeded" : null,
  };
}

/**
 * Update the conversation requestedGroupIds based on the mentioned agents. This function is purely
 * additive - requirements are never removed.
 *
 * Each agent's requestedGroupIds represents a set of requirements that must be satisfied. When an
 * agent is mentioned in a conversation, its requirements are added to the conversation's
 * requirements.
 *
 * - Within each requirement (sub-array), groups are combined with OR logic.
 * - Different requirements (different sub-arrays) are combined with AND logic.
 */
export async function updateConversationRequestedGroupIds(
  auth: Authenticator,
  {
    agents,
    contentFragment,
    conversation,
    t,
  }: {
    agents?: LightAgentConfigurationType[];
    contentFragment?: ContentFragmentInputWithContentNode;
    conversation: ConversationType;
    t: Transaction;
  }
): Promise<void> {
  let newRequirements: string[][] = [];
  if (agents) {
    newRequirements = agents.flatMap((agent) => agent.requestedGroupIds);
  }
  if (contentFragment) {
    const rawRequestedGroupIds = await getContentFragmentGroupIds(
      auth,
      contentFragment
    );
    const requestedGroupIds = rawRequestedGroupIds.map((gs) =>
      gs.map((gId) =>
        GroupResource.modelIdToSId({
          id: gId,
          workspaceId: auth.getNonNullableWorkspace().id,
        })
      )
    );
    newRequirements.push(...requestedGroupIds);
  }
  // Remove duplicates and sort each requirement.
  newRequirements = _.uniqWith(
    newRequirements.map((r) => sortBy(r)),
    isEqual
  );
  const currentRequirements = conversation.requestedGroupIds;

  // Check if each new requirement already exists in current requirements.
  const areAllRequirementsPresent = newRequirements.every((newReq) =>
    currentRequirements.some(
      // newReq was sorted, so we need to sort currentReq as well.
      (currentReq) => isEqual(newReq, sortBy(currentReq))
    )
  );

  // Early return if all new requirements are already present.
  if (areAllRequirementsPresent) {
    return;
  }

  // Get missing requirements.
  const requirementsToAdd = newRequirements.filter(
    (newReq) =>
      !currentRequirements.some((currentReq) =>
        // newReq was sorted, so we need to sort currentReq as well.
        isEqual(newReq, sortBy(currentReq))
      )
  );

  // Convert all sIds to modelIds.
  const sIdToModelId = new Map<string, number>();
  const getModelId = (sId: string) => {
    if (!sIdToModelId.has(sId)) {
      const id = getResourceIdFromSId(sId);
      if (id === null) {
        throw new Error("Unexpected: invalid group id");
      }
      sIdToModelId.set(sId, id);
    }
    return sIdToModelId.get(sId)!;
  };

  const allRequirements = [
    ...currentRequirements.map((req) => sortBy(req.map(getModelId))),
    ...requirementsToAdd.map((req) => sortBy(req.map(getModelId))),
  ];

  await ConversationResource.updateRequestedGroupIds(
    auth,
    conversation.sId,
    normalizeArrays(allRequirements),
    t
  );
}
