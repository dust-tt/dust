import {
  apiErrorToDustError,
  DustAgentError,
  DustCancelledError,
  DustError,
  DustUnknownError,
  DustValidationError,
} from "../errors/errors";
import type { DustAPI } from "../index";
import { buildContext } from "./context";
import type { AgentMessage } from "./guards";
import {
  hasStringProperty,
  isActionEventData,
  isAgentMessage,
  isAPIError,
} from "./guards";
import type {
  AgentAction,
  AgentResponse,
  AttachmentInput,
  MessageStream,
  StreamEvent,
  StreamEventHandler,
  StreamMessageParams,
  ToolApproval,
  UploadProgress,
} from "./types";
import { isBlobAttachment, isFileIdAttachment } from "./types";

function findFirstAgentMessage(
  content: unknown[],
  parentMessageId: string
): AgentMessage {
  const agentMessage = content
    .flat()
    .find((m) => isAgentMessage(m) && m.parentMessageId === parentMessageId);

  if (!agentMessage || !isAgentMessage(agentMessage)) {
    throw new DustAgentError("No agent message found in response");
  }

  return agentMessage;
}

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
  private _uploadedFileIds: string[] = [];

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
  ): () => void {
    const typedHandler = handler as (...args: unknown[]) => unknown;

    if (event === "toolApprovalRequired") {
      const existingHandlers = this._handlers.get(event);
      if (existingHandlers && existingHandlers.length > 0) {
        this._client._logger.warn(
          {},
          "Overwriting existing toolApprovalRequired handler. Only one handler is allowed."
        );
      }
      this._handlers.set(event, [typedHandler]);
    } else {
      const handlers = this._handlers.get(event) ?? [];
      handlers.push(typedHandler);
      this._handlers.set(event, handlers);
    }

    return () => {
      const handlers = this._handlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(typedHandler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
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

  private _getString(obj: unknown, key: string, defaultValue = ""): string {
    return hasStringProperty(obj, key) ? obj[key] : defaultValue;
  }

  private _setErrorAndFinish(error: DustError): {
    type: "error";
    error: DustError;
  } {
    this._error = error;
    this._finished = true;
    return { type: "error", error };
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
      } else if (isBlobAttachment(attachment)) {
        const file =
          attachment instanceof File
            ? attachment
            : new File([attachment], fileName, {
                type: attachment.type || "application/octet-stream",
              });
        const uploadResult = await this._client.uploadFile({
          contentType: (file.type || "application/octet-stream") as Parameters<
            typeof this._client.uploadFile
          >[0]["contentType"],
          fileName,
          fileSize: file.size,
          useCase: "conversation",
          fileObject: file,
          signal: this._signal,
        });

        if (uploadResult.isErr()) {
          if (uploadResult.error instanceof Error) {
            throw uploadResult.error;
          }
          throw apiErrorToDustError(uploadResult.error);
        }

        fileId = uploadResult.value.sId;
      } else {
        throw new Error(
          "File path attachments are not yet supported. Please pass a File or Blob object."
        );
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

    this._uploadedFileIds = uploadedFileIds;
  }

  private async _createConversationAndPostMessage(): Promise<{
    conversationId: string;
    userMessageId: string;
    agentMessageId: string;
    conversation: { sId: string; content: unknown[] };
  }> {
    const context = buildContext(this._params.context);

    const contentFragments = this._uploadedFileIds.map((fileId) => ({
      fileId,
      title: "Attachment",
      context,
    }));

    if (this._params.conversationId) {
      for (const fragment of contentFragments) {
        const fragmentResult = await this._client.postContentFragment({
          conversationId: this._params.conversationId,
          contentFragment: fragment,
          signal: this._signal,
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
        signal: this._signal,
      });

      if (messageResult.isErr()) {
        throw apiErrorToDustError(messageResult.error);
      }

      const convResult = await this._client.getConversation({
        conversationId: this._params.conversationId,
        signal: this._signal,
      });

      if (convResult.isErr()) {
        throw apiErrorToDustError(convResult.error);
      }

      const userMessage = messageResult.value;
      const firstAgentMessage = findFirstAgentMessage(
        convResult.value.content,
        userMessage.sId
      );

      return {
        conversationId: this._params.conversationId,
        userMessageId: userMessage.sId,
        agentMessageId: firstAgentMessage.sId,
        conversation: convResult.value,
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
        signal: this._signal,
      });

      if (result.isErr()) {
        throw apiErrorToDustError(result.error);
      }

      const { conversation, message: userMessage } = result.value;

      if (!userMessage) {
        throw new DustAgentError("No user message returned in response");
      }

      const firstAgentMessage = findFirstAgentMessage(
        conversation.content,
        userMessage.sId
      );

      return {
        conversationId: conversation.sId,
        userMessageId: userMessage.sId,
        agentMessageId: firstAgentMessage.sId,
        conversation,
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
      if (streamResult.error instanceof Error) {
        throw new DustUnknownError(streamResult.error.message, {
          cause: streamResult.error,
        });
      }
      if (isAPIError(streamResult.error)) {
        throw apiErrorToDustError(streamResult.error);
      }
      throw new DustUnknownError("Unknown stream error");
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
        const classification = this._getString(event, "classification");
        const text = this._getString(event, "text");

        if (classification === "tokens") {
          this._text += text;
          return { type: "text", delta: text };
        }
        if (classification === "chain_of_thought") {
          this._chainOfThought += text;
          return { type: "chainOfThought", delta: text };
        }
        return null;
      }

      case "agent_action_success": {
        const actionData = event.action;
        if (!isActionEventData(actionData)) {
          return null;
        }
        const action: AgentAction = {
          id: actionData.id,
          type: actionData.type,
          toolName: actionData.toolName ?? actionData.type,
          input: actionData.input,
          output: actionData.output,
          status: "success",
        };
        this._actions.push(action);
        return { type: "action", action };
      }

      case "mcp_approve_execution": {
        const messageId = this._getString(event, "messageId");
        const actionId = this._getString(event, "actionId");
        const toolName = this._getString(event, "toolName");
        const serverName = this._getString(event, "serverName");
        const description = this._getString(event, "description");

        const approval: ToolApproval = {
          messageId,
          actionId,
          toolName,
          serverName,
          input: event.input,
          description,
          approve: async () => {
            if (!this._conversationId) {
              throw new DustAgentError("No conversation ID available");
            }
            await this._client.validateAction({
              conversationId: this._conversationId,
              messageId,
              actionId,
              approved: "approved",
              signal: this._signal,
            });
          },
          reject: async () => {
            if (!this._conversationId) {
              throw new DustAgentError("No conversation ID available");
            }
            await this._client.validateAction({
              conversationId: this._conversationId,
              messageId,
              actionId,
              approved: "rejected",
              signal: this._signal,
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
        const message = this._getString(event.error, "message", "Agent error");
        return this._setErrorAndFinish(new DustAgentError(message));
      }

      case "user_message_error": {
        const message = this._getString(
          event.error,
          "message",
          "Message error"
        );
        return this._setErrorAndFinish(new DustValidationError(message));
      }

      case "agent_generation_cancelled":
        return this._setErrorAndFinish(
          new DustCancelledError("Generation cancelled")
        );

      case "tool_error": {
        const actionId = this._getString(event, "actionId");
        const toolName = this._getString(event, "toolName");
        const errorMessage =
          this._getString(event.error, "message") || undefined;

        const action: AgentAction = {
          id: actionId,
          type: "tool_error",
          toolName,
          input: event.input,
          output: null,
          status: "error",
          error: errorMessage,
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

  private _getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      "application/pdf": ".pdf",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "text/plain": ".txt",
      "text/csv": ".csv",
      "text/html": ".html",
      "application/json": ".json",
      "application/xml": ".xml",
      "application/zip": ".zip",
      "application/msword": ".doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        ".docx",
      "application/vnd.ms-excel": ".xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        ".xlsx",
      "application/vnd.ms-powerpoint": ".ppt",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        ".pptx",
    };
    return mimeToExt[mimeType] ?? "";
  }

  private _getFileName(attachment: AttachmentInput, index: number): string {
    if (attachment instanceof File) {
      return attachment.name;
    }
    if ("path" in attachment && attachment.name) {
      return attachment.name;
    }
    if ("path" in attachment) {
      const pathName = attachment.path.split("/").pop();
      if (pathName) {
        return pathName;
      }
    }
    if (attachment instanceof Blob) {
      const ext = this._getExtensionFromMimeType(attachment.type);
      return `attachment-${index}${ext}`;
    }
    return `attachment-${index}`;
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
