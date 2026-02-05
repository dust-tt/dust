import type { DustAPI } from "../index";
import type { APIError } from "../types";
import {
  DustAgentError,
  DustCancelledError,
  DustError,
  DustUnknownError,
  DustValidationError,
  apiErrorToDustError,
} from "../errors";
import { buildContext } from "./context";
import type {
  AgentAction,
  AgentResponse,
  MessageStream,
  StreamEvent,
  StreamEventHandler,
  StreamMessageParams,
  ToolApproval,
  UploadProgress,
  AttachmentInput,
} from "./types";
import { isFileIdAttachment } from "./types";

export class MessageStreamImpl implements MessageStream {
  private _client: DustAPI;
  private _params: StreamMessageParams;
  private _autoApproveTools: boolean;
  private _abortController: AbortController;
  private _externalSignal?: AbortSignal;
  private _handlers: Map<string, Array<(...args: unknown[]) => unknown>> =
    new Map();
  private _text = "";
  private _chainOfThought = "";
  private _actions: AgentAction[] = [];
  private _conversationId: string | null = null;
  private _messageId: string | null = null;
  private _agentMessageId: string | null = null;
  private _started = false;
  private _finished = false;
  private _response: AgentResponse | null = null;
  private _error: DustError | null = null;

  constructor(
    client: DustAPI,
    params: StreamMessageParams,
    autoApproveTools = false
  ) {
    this._client = client;
    this._params = params;
    this._autoApproveTools = autoApproveTools;
    this._abortController = new AbortController();
    this._externalSignal = params.signal;

    if (this._externalSignal) {
      if (this._externalSignal.aborted) {
        this._abortController.abort();
      } else {
        this._externalSignal.addEventListener(
          "abort",
          () => this._abortController.abort(),
          { once: true }
        );
      }
    }
  }

  get text(): string {
    return this._text;
  }

  get chainOfThought(): string {
    return this._chainOfThought;
  }

  get actions(): AgentAction[] {
    return [...this._actions];
  }

  get conversationId(): string | null {
    return this._conversationId;
  }

  get messageId(): string | null {
    return this._messageId;
  }

  on<E extends StreamEvent["type"]>(
    event: E,
    handler: StreamEventHandler<E>
  ): this {
    const handlers = this._handlers.get(event) ?? [];
    handlers.push(handler as (...args: unknown[]) => unknown);
    this._handlers.set(event, handlers);
    return this;
  }

  abort(): void {
    this._abortController.abort();
  }

  async finalMessage(): Promise<AgentResponse> {
    if (this._finished && this._response) {
      return this._response;
    }
    if (this._finished && this._error) {
      throw this._error;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of this) {
      // Events are processed by handlers
    }

    if (this._error) {
      throw this._error;
    }
    if (!this._response) {
      throw new DustAgentError("Stream ended without a response");
    }

    return this._response;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    if (this._started) {
      throw new Error("Stream can only be iterated once");
    }
    this._started = true;

    try {
      if (this._params.attachments?.length) {
        yield* this._uploadAttachments(this._params.attachments);
      }

      this._checkCancelled();

      const { conversationId, userMessageId, agentMessageId, conversation } =
        await this._createConversationAndPostMessage();

      this._conversationId = conversationId;
      this._messageId = userMessageId;
      this._agentMessageId = agentMessageId;

      this._checkCancelled();

      yield* this._streamResponse(conversation, userMessageId);
    } catch (error) {
      const dustError = this._abortController.signal.aborted
        ? new DustCancelledError("Stream cancelled")
        : this._toDustError(error);

      this._error = dustError;
      this._finished = true;
      yield { type: "error", error: dustError };
      this._emitToHandlers("error", dustError);
      throw dustError;
    }
  }

  private get _signal(): AbortSignal {
    return this._abortController.signal;
  }

  private _checkCancelled(): void {
    if (this._signal.aborted) {
      throw new DustCancelledError("Operation cancelled");
    }
  }

  private _toDustError(error: unknown): DustError {
    if (error instanceof DustError) {
      return error;
    }
    if (error instanceof Error) {
      return new DustUnknownError(error.message, { cause: error });
    }
    return new DustUnknownError(String(error));
  }

  private _emitToHandlers<T extends StreamEvent["type"]>(
    type: T,
    ...args: unknown[]
  ): void {
    const handlers = this._handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  private async *_uploadAttachments(
    attachments: AttachmentInput[]
  ): AsyncGenerator<StreamEvent> {
    const totalFiles = attachments.length;
    const uploadedFileIds: string[] = [];

    for (let i = 0; i < attachments.length; i++) {
      this._checkCancelled();

      const attachment = attachments[i];
      const fileName = this._getFileName(attachment, i);

      const startProgress: UploadProgress = {
        fileName,
        uploaded: 0,
        total: this._getFileSize(attachment),
        fileIndex: i,
        totalFiles,
      };
      yield { type: "uploadProgress", progress: startProgress };
      this._emitToHandlers("uploadProgress", startProgress);

      let fileId: string;

      if (isFileIdAttachment(attachment)) {
        fileId = attachment.fileId;
      } else {
        const file = attachment as File | Blob;
        const uploadResult = await this._client.uploadFile({
          contentType: (file.type || "application/octet-stream") as Parameters<
            typeof this._client.uploadFile
          >[0]["contentType"],
          fileName,
          fileSize: file.size,
          useCase: "conversation",
          fileObject: file as File,
        });

        if (uploadResult.isErr()) {
          if (uploadResult.error instanceof Error) {
            throw uploadResult.error;
          }
          throw apiErrorToDustError(uploadResult.error);
        }

        fileId = uploadResult.value.sId;
      }

      uploadedFileIds.push(fileId);

      const completeProgress: UploadProgress = {
        fileName,
        uploaded: this._getFileSize(attachment),
        total: this._getFileSize(attachment),
        fileIndex: i,
        totalFiles,
      };
      yield { type: "uploadProgress", progress: completeProgress };
      this._emitToHandlers("uploadProgress", completeProgress);
    }

    (this._params as { _uploadedFileIds?: string[] })._uploadedFileIds =
      uploadedFileIds;
  }

  private async _createConversationAndPostMessage(): Promise<{
    conversationId: string;
    userMessageId: string;
    agentMessageId: string;
    conversation: { sId: string; content: unknown[] };
  }> {
    const context = buildContext(this._params.context);

    const contentFragments =
      (this._params as { _uploadedFileIds?: string[] })._uploadedFileIds?.map(
        (fileId) => ({ fileId, title: "Attachment", context })
      ) ?? [];

    if (this._params.conversationId) {
      for (const fragment of contentFragments) {
        const fragmentResult = await this._client.postContentFragment({
          conversationId: this._params.conversationId,
          contentFragment: fragment,
        });
        if (fragmentResult.isErr()) {
          throw apiErrorToDustError(fragmentResult.error);
        }
      }

      const messageResult = await this._client.postUserMessage({
        conversationId: this._params.conversationId,
        message: {
          content: this._params.message,
          mentions: [{ configurationId: this._params.agentId }],
          context,
        },
      });

      if (messageResult.isErr()) {
        throw apiErrorToDustError(messageResult.error);
      }

      const convResult = await this._client.getConversation({
        conversationId: this._params.conversationId,
      });

      if (convResult.isErr()) {
        throw apiErrorToDustError(convResult.error);
      }

      const userMessage = messageResult.value;
      const agentMessages = convResult.value.content
        .flat()
        .filter(
          (m) =>
            m.type === "agent_message" &&
            "parentMessageId" in m &&
            m.parentMessageId === userMessage.sId
        );

      if (agentMessages.length === 0) {
        throw new DustAgentError("No agent message found in response");
      }

      return {
        conversationId: this._params.conversationId,
        userMessageId: userMessage.sId,
        agentMessageId: (agentMessages[0] as { sId: string }).sId,
        conversation: convResult.value as { sId: string; content: unknown[] },
      };
    } else {
      const result = await this._client.createConversation({
        title: null,
        visibility: "unlisted",
        message: {
          content: this._params.message,
          mentions: [{ configurationId: this._params.agentId }],
          context,
        },
        contentFragments:
          contentFragments.length > 0 ? contentFragments : undefined,
        skipToolsValidation: this._params.skipToolsValidation,
      });

      if (result.isErr()) {
        throw apiErrorToDustError(result.error);
      }

      const { conversation, message: userMessage } = result.value;

      if (!userMessage) {
        throw new DustAgentError("No user message returned in response");
      }

      const agentMessages = conversation.content
        .flat()
        .filter(
          (m) =>
            m.type === "agent_message" &&
            "parentMessageId" in m &&
            m.parentMessageId === userMessage.sId
        );

      if (agentMessages.length === 0) {
        throw new DustAgentError("No agent message found in response");
      }

      return {
        conversationId: conversation.sId,
        userMessageId: userMessage.sId,
        agentMessageId: (agentMessages[0] as { sId: string }).sId,
        conversation: conversation as { sId: string; content: unknown[] },
      };
    }
  }

  private async *_streamResponse(
    conversation: { sId: string; content: unknown[] },
    userMessageId: string
  ): AsyncGenerator<StreamEvent> {
    const streamResult = await this._client.streamAgentAnswerEvents({
      conversation: conversation as Parameters<
        typeof this._client.streamAgentAnswerEvents
      >[0]["conversation"],
      userMessageId,
      signal: this._signal,
    });

    if (streamResult.isErr()) {
      throw streamResult.error instanceof Error
        ? new DustUnknownError(streamResult.error.message, {
            cause: streamResult.error,
          })
        : apiErrorToDustError(streamResult.error as APIError);
    }

    for await (const event of streamResult.value.eventStream) {
      this._checkCancelled();

      const mapped = this._mapEvent(event);
      if (mapped) {
        if (mapped.type === "toolApprovalRequired") {
          yield* this._handleToolApproval(mapped.approval);
          continue;
        }

        yield mapped;
        this._emitMappedEvent(mapped);
      }
    }
  }

  private _mapEvent(event: {
    type: string;
    [key: string]: unknown;
  }): StreamEvent | null {
    switch (event.type) {
      case "generation_tokens": {
        const classification = event.classification as string;
        const text = event.text as string;

        if (classification === "tokens") {
          this._text += text;
          return { type: "text", delta: text };
        } else if (classification === "chain_of_thought") {
          this._chainOfThought += text;
          return { type: "chainOfThought", delta: text };
        }
        return null;
      }

      case "agent_action_success": {
        const action: AgentAction = {
          id: (event.action as { id: string }).id,
          type: (event.action as { type: string }).type,
          toolName:
            (event.action as { toolName?: string }).toolName ??
            (event.action as { type: string }).type,
          input: (event.action as { input?: unknown }).input,
          output: (event.action as { output?: unknown }).output,
          status: "success",
        };
        this._actions.push(action);
        return { type: "action", action };
      }

      case "mcp_approve_execution": {
        const approval: ToolApproval = {
          messageId: event.messageId as string,
          actionId: event.actionId as string,
          toolName: event.toolName as string,
          serverName: event.serverName as string,
          input: event.input,
          description: (event.description as string) ?? "",
          approve: async () => {
            await this._client.validateAction({
              conversationId: this._conversationId!,
              messageId: event.messageId as string,
              actionId: event.actionId as string,
              approved: "approved",
            });
          },
          reject: async () => {
            await this._client.validateAction({
              conversationId: this._conversationId!,
              messageId: event.messageId as string,
              actionId: event.actionId as string,
              approved: "rejected",
            });
          },
        };
        return { type: "toolApprovalRequired", approval };
      }

      case "agent_message_success": {
        this._response = {
          text: this._text,
          conversationId: this._conversationId!,
          messageId: this._messageId!,
          agentMessageId: this._agentMessageId!,
          actions: this._actions,
          chainOfThought: this._chainOfThought || undefined,
        };
        this._finished = true;
        return { type: "done", response: this._response };
      }

      case "agent_error": {
        const error = new DustAgentError(
          (event.error as { message: string })?.message ?? "Agent error"
        );
        this._error = error;
        this._finished = true;
        return { type: "error", error };
      }

      case "user_message_error": {
        const error = new DustValidationError(
          (event.error as { message: string })?.message ?? "Message error"
        );
        this._error = error;
        this._finished = true;
        return { type: "error", error };
      }

      case "agent_generation_cancelled": {
        const error = new DustCancelledError("Generation cancelled");
        this._error = error;
        this._finished = true;
        return { type: "error", error };
      }

      case "tool_error": {
        const action: AgentAction = {
          id: event.actionId as string,
          type: "tool_error",
          toolName: event.toolName as string,
          input: event.input,
          output: null,
          status: "error",
          error: (event.error as { message: string })?.message,
        };
        this._actions.push(action);
        return { type: "action", action };
      }

      default:
        return null;
    }
  }

  private _emitMappedEvent(event: StreamEvent): void {
    switch (event.type) {
      case "text":
        this._emitToHandlers("text", event.delta);
        return;
      case "chainOfThought":
        this._emitToHandlers("chainOfThought", event.delta);
        return;
      case "action":
        this._emitToHandlers("action", event.action);
        return;
      case "error":
        this._emitToHandlers("error", event.error);
        return;
      case "done":
        this._emitToHandlers("done", event.response);
        return;
    }
  }

  private _createBlockedAction(
    approval: ToolApproval,
    errorMessage: string
  ): AgentAction {
    return {
      id: approval.actionId,
      type: "mcp_action",
      toolName: approval.toolName,
      input: approval.input,
      output: null,
      status: "blocked",
      error: errorMessage,
    };
  }

  private *_yieldBlockedAction(
    approval: ToolApproval,
    errorMessage: string
  ): Generator<StreamEvent> {
    const action = this._createBlockedAction(approval, errorMessage);
    this._actions.push(action);
    yield { type: "action", action };
    this._emitToHandlers("action", action);
  }

  private async *_handleToolApproval(
    approval: ToolApproval
  ): AsyncGenerator<StreamEvent> {
    if (this._autoApproveTools) {
      await approval.approve();
      return;
    }

    const handlers = this._handlers.get("toolApprovalRequired");
    if (!handlers || handlers.length === 0) {
      await approval.reject();
      yield* this._yieldBlockedAction(
        approval,
        "Tool execution rejected - no approval handler registered"
      );
      return;
    }

    yield { type: "toolApprovalRequired", approval };

    const handler = handlers[0] as (
      approval: ToolApproval
    ) => Promise<boolean> | boolean;
    try {
      const approved = await handler(approval);
      if (approved) {
        await approval.approve();
      } else {
        await approval.reject();
        yield* this._yieldBlockedAction(
          approval,
          "Tool execution rejected by user"
        );
      }
    } catch (error) {
      await approval.reject();
      yield* this._yieldBlockedAction(
        approval,
        `Tool execution rejected - handler error: ${error}`
      );
    }
  }

  private _getFileName(attachment: AttachmentInput, index: number): string {
    const defaultName = `attachment-${index}`;

    if (attachment instanceof File) {
      return attachment.name;
    }
    if ("path" in attachment && attachment.name) {
      return attachment.name;
    }
    if ("path" in attachment) {
      return attachment.path.split("/").pop() || defaultName;
    }
    return defaultName;
  }

  private _getFileSize(attachment: AttachmentInput): number {
    if (isFileIdAttachment(attachment)) {
      return 0;
    }
    if (attachment instanceof File || attachment instanceof Blob) {
      return attachment.size;
    }
    return 0;
  }
}
