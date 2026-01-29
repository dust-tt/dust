import { TIMEZONE_NAMES } from "../timezone_names";
import { isRecord } from "../type_utils";
import type {
  AgentMentionType,
  AgentMessagePublicType,
  APIError,
  ContentFragmentType,
  ConversationPublicType,
  CreateConversationResponseType,
  FileType,
  FileUploadUrlRequestType,
  MentionType,
  PublicPostContentFragmentRequestBody,
  PublicPostConversationsRequestBody,
  PublicPostMessagesRequestBody,
  Result,
  UploadedContentFragmentType,
  UserMessageType,
} from "../types";
import { isAgentMessage, isSupportedFileContentType } from "../types";
import {
  DustAPIError,
  DustAuthenticationError,
  DustValidationError,
  isRetryableError,
  toDustAPIError,
} from "./errors";
import type { ResolvedRetryOptions } from "./retry";
import { resolveRetryOptions } from "./retry";
import type { AgentEvent } from "./streaming";
import { MessageStream } from "./streaming";
import type {
  AttachmentInput,
  MessageContext,
  SendMessageOptions,
  SendMessageParams,
  StreamMessageOptions,
} from "./types";

type StreamStartResult = {
  eventStream: AsyncIterable<AgentEvent>;
  conversationId: string;
  userMessageId: string;
};

interface DustAPIClient {
  createConversation(
    args: PublicPostConversationsRequestBody & {
      params?: Record<string, string>;
    }
  ): Promise<Result<CreateConversationResponseType, APIError>>;
  postUserMessage(args: {
    conversationId: string;
    message: PublicPostMessagesRequestBody;
  }): Promise<Result<UserMessageType, APIError>>;
  postContentFragment(args: {
    conversationId: string;
    contentFragment: PublicPostContentFragmentRequestBody;
  }): Promise<Result<ContentFragmentType, APIError>>;
  uploadFile(
    args: FileUploadUrlRequestType & { fileObject: File }
  ): Promise<Result<FileType, Error | APIError>>;
  streamAgentAnswerEvents(args: {
    conversation: ConversationPublicType;
    userMessageId: string;
    signal?: AbortSignal;
    options?: {
      maxReconnectAttempts?: number;
      reconnectDelay?: number;
      autoReconnect?: boolean;
    };
  }): Promise<
    Result<
      {
        eventStream: AsyncGenerator<AgentEvent, void, unknown>;
      },
      { type: string; message: string } | Error
    >
  >;
  getConversation(args: {
    conversationId: string;
  }): Promise<Result<ConversationPublicType, APIError>>;
  getApiKey(): Promise<string | null>;
  getRetryOptions(): ResolvedRetryOptions;
}

type ContentFragmentContext = {
  username?: string | null;
  fullName?: string | null;
  email?: string | null;
  profilePictureUrl?: string | null;
};

const DEFAULT_USER_NAME = "User";
const DEFAULT_ORIGIN = "api";
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_AGENT_MESSAGE_TIMEOUT_MS = 10000;

function isFileLike(value: unknown): value is File {
  if (!isRecord(value)) {
    return false;
  }
  const name = value["name"];
  const size = value["size"];
  const type = value["type"];
  const arrayBuffer = value["arrayBuffer"];

  return (
    typeof name === "string" &&
    typeof size === "number" &&
    typeof type === "string" &&
    typeof arrayBuffer === "function"
  );
}

function isUploadedContentFragment(
  value: unknown
): value is UploadedContentFragmentType {
  if (!isRecord(value)) {
    return false;
  }
  const fileId = value["fileId"];
  const title = value["title"];
  return typeof fileId === "string" && typeof title === "string";
}

function isAgentMention(mention: MentionType): mention is AgentMentionType {
  return "configurationId" in mention;
}

function resolveMentions(
  mentions: MentionType[] | undefined,
  agentId: string
): MentionType[] {
  const baseMentions = mentions ?? [];
  for (const mention of baseMentions) {
    if (isAgentMention(mention) && mention.configurationId === agentId) {
      return baseMentions;
    }
  }

  return [...baseMentions, { configurationId: agentId }];
}

function resolveTimezone(timezone?: string | null): string {
  if (timezone && TIMEZONE_NAMES.includes(timezone)) {
    return timezone;
  }

  if (
    typeof Intl !== "undefined" &&
    typeof Intl.DateTimeFormat === "function"
  ) {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && TIMEZONE_NAMES.includes(resolved)) {
      return resolved;
    }
  }

  return "UTC";
}

function buildMessageContext(
  partial: Partial<MessageContext> | undefined,
  mcpServerIds: string[] | undefined
): MessageContext {
  const username =
    partial?.username && partial.username.trim().length > 0
      ? partial.username
      : DEFAULT_USER_NAME;

  return {
    username,
    timezone: resolveTimezone(partial?.timezone),
    origin: partial?.origin ?? DEFAULT_ORIGIN,
    fullName: partial?.fullName ?? username,
    email: partial?.email,
    profilePictureUrl: partial?.profilePictureUrl,
    clientSideMCPServerIds: mcpServerIds ?? partial?.clientSideMCPServerIds,
    selectedMCPServerViewIds: partial?.selectedMCPServerViewIds,
    lastTriggerRunAt: partial?.lastTriggerRunAt,
  };
}

function buildContentFragmentContext(
  context: MessageContext
): ContentFragmentContext {
  return {
    username: context.username,
    fullName: context.fullName,
    email: context.email,
    profilePictureUrl: context.profilePictureUrl,
  };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function withRetry<T>(
  operation: () => Promise<Result<T, unknown>>,
  options: ResolvedRetryOptions
): Promise<T> {
  let attempt = 0;
  let delayMs = options.retryDelay.initialMs;

  for (;;) {
    const result = await operation();
    if (result.isOk()) {
      return result.value;
    }

    const error = toDustAPIError(result.error);
    if (!isRetryableError(error) || attempt >= options.maxRetries) {
      throw error;
    }

    attempt += 1;
    await sleep(delayMs);
    delayMs = Math.min(
      delayMs * options.retryDelay.multiplier,
      options.retryDelay.maxMs
    );
  }
}

function findAgentMessage(
  conversation: ConversationPublicType,
  userMessageId: string
): AgentMessagePublicType | null {
  for (const versions of conversation.content) {
    const latest = versions[versions.length - 1];
    if (
      latest &&
      isAgentMessage(latest) &&
      latest.parentMessageId === userMessageId
    ) {
      return latest;
    }
  }
  return null;
}

export class AgentsAPI {
  private readonly client: DustAPIClient;

  constructor(client: DustAPIClient) {
    this.client = client;
  }

  sendMessage(params: SendMessageParams, options?: SendMessageOptions) {
    const stream = this.streamMessage(params, options);
    return stream.finalMessage();
  }

  streamMessage(
    params: SendMessageParams,
    options?: StreamMessageOptions
  ): MessageStream {
    const retryOptions = resolveRetryOptions(
      this.client.getRetryOptions(),
      options
    );
    const abortController = new AbortController();
    if (options?.signal) {
      const externalSignal = options.signal;
      if (externalSignal.aborted) {
        abortController.abort();
      } else {
        externalSignal.addEventListener("abort", () => {
          abortController.abort();
        });
      }
    }

    const streamFactory = async (): Promise<StreamStartResult> => {
      const apiKey = await this.client.getApiKey();
      if (!apiKey) {
        throw new DustAuthenticationError({
          code: "missing_api_key",
          message: "Missing Dust API key.",
        });
      }

      const context = buildMessageContext(params.context, params.mcpServerIds);
      const mentions = resolveMentions(params.mentions, params.agentId);
      const contentFragments = await this.buildContentFragments(
        params.attachments ?? [],
        context,
        params.conversationId,
        retryOptions
      );

      const conversationId = params.conversationId;
      if (!conversationId) {
        const visibility = params.visibility ?? "unlisted";
        const conversationResponse = await withRetry(
          () =>
            this.client.createConversation({
              title: params.title ?? null,
              visibility,
              message: {
                content: params.message,
                mentions,
                context,
              },
              contentFragments:
                contentFragments.length > 0 ? contentFragments : undefined,
              blocking: false,
              skipToolsValidation: params.skipToolsValidation,
            }),
          retryOptions
        );

        const { conversation, message } = conversationResponse;
        if (!message) {
          throw new DustAPIError({
            code: "message_not_created",
            message: "Conversation created without a user message.",
          });
        }

        return this.startStream({
          conversation,
          userMessageId: message.sId,
          signal: abortController.signal,
          streamOptions: options?.streamOptions,
          retryOptions,
        });
      }

      if (contentFragments.length > 0) {
        await this.postContentFragments(
          conversationId,
          contentFragments,
          retryOptions
        );
      }

      const messageResponse = await withRetry(
        () =>
          this.client.postUserMessage({
            conversationId,
            message: {
              content: params.message,
              mentions,
              context,
              blocking: false,
              skipToolsValidation: params.skipToolsValidation,
            },
          }),
        retryOptions
      );

      const conversation = await this.waitForAgentMessage(
        conversationId,
        messageResponse.sId,
        options,
        retryOptions
      );

      return this.startStream({
        conversation,
        userMessageId: messageResponse.sId,
        signal: abortController.signal,
        streamOptions: options?.streamOptions,
        retryOptions,
      });
    };

    return new MessageStream(streamFactory, abortController);
  }

  private async buildContentFragments(
    attachments: AttachmentInput[],
    context: MessageContext,
    conversationId: string | undefined,
    retryOptions: ResolvedRetryOptions
  ): Promise<PublicPostContentFragmentRequestBody[]> {
    const fragments: PublicPostContentFragmentRequestBody[] = [];
    const fragmentContext = buildContentFragmentContext(context);

    for (const attachment of attachments) {
      if (isUploadedContentFragment(attachment)) {
        fragments.push({
          title: attachment.title,
          fileId: attachment.fileId,
          url: attachment.url ?? null,
          context: fragmentContext,
        });
        continue;
      }

      if (!isFileLike(attachment)) {
        throw new DustValidationError({
          code: "invalid_attachment",
          message: "Unsupported attachment type.",
        });
      }

      const rawContentType =
        attachment.type.trim().length > 0
          ? attachment.type
          : "application/octet-stream";

      if (!isSupportedFileContentType(rawContentType)) {
        throw new DustValidationError({
          code: "file_type_not_supported",
          message: `Unsupported content type: ${rawContentType}`,
        });
      }

      const file = await withRetry(
        () =>
          this.client.uploadFile({
            contentType: rawContentType,
            fileName: attachment.name,
            fileSize: attachment.size,
            useCase: "conversation",
            useCaseMetadata: conversationId ? { conversationId } : undefined,
            fileObject: attachment,
          }),
        retryOptions
      );

      fragments.push({
        title: attachment.name,
        fileId: file.sId,
        url: file.publicUrl ?? null,
        context: fragmentContext,
      });
    }

    return fragments;
  }

  private async postContentFragments(
    conversationId: string,
    fragments: PublicPostContentFragmentRequestBody[],
    retryOptions: ResolvedRetryOptions
  ): Promise<void> {
    for (const fragment of fragments) {
      await withRetry(
        () =>
          this.client.postContentFragment({
            conversationId,
            contentFragment: fragment,
          }),
        retryOptions
      );
    }
  }

  private async waitForAgentMessage(
    conversationId: string,
    userMessageId: string,
    options: SendMessageOptions | undefined,
    retryOptions: ResolvedRetryOptions
  ): Promise<ConversationPublicType> {
    const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxWaitMs =
      options?.maxWaitForAgentMessageMs ?? DEFAULT_AGENT_MESSAGE_TIMEOUT_MS;
    const startMs = Date.now();

    for (;;) {
      const conversation = await withRetry(
        () => this.client.getConversation({ conversationId }),
        retryOptions
      );
      const agentMessage = findAgentMessage(conversation, userMessageId);
      if (agentMessage) {
        return conversation;
      }

      const elapsedMs = Date.now() - startMs;
      if (elapsedMs >= maxWaitMs) {
        throw new DustAPIError({
          code: "agent_message_not_found",
          message: "Timed out waiting for the agent response.",
        });
      }

      await sleep(pollIntervalMs);
    }
  }

  private async startStream({
    conversation,
    userMessageId,
    signal,
    streamOptions,
    retryOptions,
  }: {
    conversation: ConversationPublicType;
    userMessageId: string;
    signal: AbortSignal;
    streamOptions: StreamMessageOptions["streamOptions"] | undefined;
    retryOptions: ResolvedRetryOptions;
  }): Promise<StreamStartResult> {
    const streamResult = await withRetry(
      () =>
        this.client.streamAgentAnswerEvents({
          conversation,
          userMessageId,
          signal,
          options: {
            maxReconnectAttempts: streamOptions?.maxReconnectAttempts,
            reconnectDelay: streamOptions?.reconnectDelayMs,
            autoReconnect: streamOptions?.autoReconnect,
          },
        }),
      retryOptions
    );

    return {
      eventStream: streamResult.eventStream,
      conversationId: conversation.sId,
      userMessageId,
    };
  }
}
