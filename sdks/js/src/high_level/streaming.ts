import type {
  AgentActionPublicType,
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageDoneEvent,
  AgentMessagePublicType,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  ToolErrorEvent,
  UserMessageErrorEvent,
} from "../types";
import {
  DustAgentError,
  DustAPIError,
  DustConnectionError,
  DustStreamConsumedError,
  DustValidationError,
  toDustAPIError,
} from "./errors";
import type {AgentResponse, AgentStreamEvent} from "./types";

export type AgentEvent =
    | AgentActionSpecificEvent
    | AgentActionSuccessEvent
    | AgentErrorEvent
    | AgentGenerationCancelledEvent
    | AgentMessageSuccessEvent
    | AgentMessageDoneEvent
    | GenerationTokensEvent
    | UserMessageErrorEvent
    | ToolErrorEvent;

type StreamFactoryResult = {
    eventStream: AsyncIterable<AgentEvent>;
    conversationId: string;
    userMessageId: string;
};

type TextHandler = (delta: string) => void;
type ActionHandler = (action: AgentActionPublicType) => void;
type ChainHandler = (delta: string) => void;
type ErrorHandler = (error: DustAPIError) => void;

type HandlerMap = {
    text: TextHandler;
    action: ActionHandler;
    chainOfThought: ChainHandler;
    error: ErrorHandler;
};

function streamEventToError(event: AgentEvent): DustAPIError | null {
    switch (event.type) {
        case "agent_error":
            return new DustAgentError({
                code: event.error.code,
                message: event.error.message,
                agentId: event.configurationId,
            });
        case "user_message_error":
            return new DustValidationError({
                code: event.error.code,
                message: event.error.message,
            });
        case "tool_error":
            return new DustAPIError({
                code: event.error.code,
                message: event.error.message,
            });
        case "agent_generation_cancelled":
            return new DustAPIError({
                code: "agent_generation_cancelled",
                message: "Agent generation was cancelled.",
            });
        default:
            return null;
    }
}

export class MessageStream implements AsyncIterable<AgentStreamEvent> {
    private readonly streamFactory: () => Promise<StreamFactoryResult>;
    private readonly abortController?: AbortController;
    private streamSetup: Promise<StreamFactoryResult> | null = null;

    private consumed = false;
    private finalResponse: AgentResponse | null = null;
    private streamError: DustAPIError | null = null;

    private textParts: string[] = [];
    private chainOfThoughtParts: string[] = [];
    private actions: AgentActionPublicType[] = [];
    private agentMessage: AgentMessagePublicType | null = null;
    private agentMessageId?: string;
    private conversationId?: string;
    private userMessageId?: string;

    private handlers: { [K in keyof HandlerMap]: HandlerMap[K][] } = {
        text: [],
        action: [],
        chainOfThought: [],
        error: [],
    };

    constructor(
        streamFactory: () => Promise<StreamFactoryResult>,
        abortController?: AbortController
    ) {
        this.streamFactory = streamFactory;
        this.abortController = abortController;
    }

    on<K extends keyof HandlerMap>(event: K, handler: HandlerMap[K]): this {
        this.handlers[event].push(handler);
        return this;
    }

    async finalMessage(): Promise<AgentResponse> {
        if (this.finalResponse) {
            return this.finalResponse;
        }

        if (this.consumed) {
            throw new DustStreamConsumedError({
                code: "stream_consumed",
                message:
                    "Stream already consumed. Use either for-await iteration or finalMessage().",
            });
        }

        this.consumed = true;

        let streamSetup: StreamFactoryResult;
        try {
            streamSetup = await this.getStreamSetup();
        } catch (error) {
            const dustError = toDustAPIError(error);
            this.emitError(dustError);
            throw dustError;
        }

        try {
            for await (const event of streamSetup.eventStream) {
                this.handleEvent(event);
            }
        } catch (error) {
            const dustError = toDustAPIError(error);
            this.emitError(dustError);
            throw dustError;
        }

        if (this.streamError) {
            throw this.streamError;
        }

        const response = this.buildResponse();
        this.finalResponse = response;
        return response;
    }

    abort(): void {
        this.abortController?.abort();
    }

    async* [Symbol.asyncIterator](): AsyncIterator<AgentStreamEvent> {
        if (this.consumed) {
            if (this.finalResponse) {
                yield {type: "complete", message: this.finalResponse};
                return;
            }
            throw new DustStreamConsumedError({
                code: "stream_consumed",
                message:
                    "Stream already consumed. Use either for-await iteration or finalMessage().",
            });
        }

        this.consumed = true;

        let streamSetup: StreamFactoryResult;
        try {
            streamSetup = await this.getStreamSetup();
        } catch (error) {
            const dustError = toDustAPIError(error);
            this.emitError(dustError);
            throw dustError;
        }

        try {
            for await (const event of streamSetup.eventStream) {
                const mapped = this.handleEvent(event);
                if (mapped) {
                    yield mapped;
                }
            }
        } catch (error) {
            const dustError = toDustAPIError(error);
            this.emitError(dustError);
            throw dustError;
        }

        if (this.streamError) {
            return;
        }

        const response = this.buildResponse();
        this.finalResponse = response;
        yield {type: "complete", message: response};
    }

    private async getStreamSetup(): Promise<StreamFactoryResult> {
        if (!this.streamSetup) {
            this.streamSetup = this.streamFactory();
        }

        const setup = await this.streamSetup;
        this.conversationId = setup.conversationId;
        this.userMessageId = setup.userMessageId;
        return setup;
    }

    private handleEvent(event: AgentEvent): AgentStreamEvent | null {
        if ("messageId" in event) {
            this.agentMessageId = event.messageId;
        }

        const streamError = streamEventToError(event);
        if (streamError) {
            this.setStreamError(streamError);
            this.emitError(streamError);
            return {type: "error", error: streamError};
        }

        if (event.type === "generation_tokens") {
            if (event.classification === "tokens") {
                this.textParts.push(event.text);
                this.emitText(event.text);
                return {type: "text", delta: event.text};
            }
            if (event.classification === "chain_of_thought") {
                this.chainOfThoughtParts.push(event.text);
                this.emitChainOfThought(event.text);
                return {type: "chainOfThought", delta: event.text};
            }
            return null;
        }

        if (event.type === "agent_action_success") {
            this.actions.push(event.action);
            this.emitAction(event.action);
            return {type: "action", action: event.action};
        }

        if (event.type === "agent_message_success") {
            this.agentMessage = event.message;
            this.agentMessageId = event.message.sId;
            if (event.message.content !== null) {
                this.textParts = [event.message.content];
            }
            if (event.message.chainOfThought) {
                this.chainOfThoughtParts = [event.message.chainOfThought];
            }
            if (event.message.actions) {
                this.actions = event.message.actions.slice();
            }
            return null;
        }

        return null;
    }

    private buildResponse(): AgentResponse {
        if (!this.conversationId || !this.userMessageId) {
            throw new DustConnectionError({
                code: "missing_conversation_context",
                message: "Missing conversation context while building response.",
            });
        }

        const text = this.agentMessage?.content ?? this.textParts.join("");
        const chainOfThought =
            this.agentMessage?.chainOfThought ??
            (this.chainOfThoughtParts.length > 0
                ? this.chainOfThoughtParts.join("")
                : undefined);
        const actions = this.agentMessage?.actions ?? this.actions;

        return {
            text,
            chainOfThought,
            actions: [...actions],
            conversationId: this.conversationId,
            userMessageId: this.userMessageId,
            messageId: this.agentMessage?.sId ?? this.agentMessageId,
            message: this.agentMessage ?? undefined,
        };
    }

    private setStreamError(error: DustAPIError): void {
        if (!this.streamError) {
            this.streamError = error;
        }
    }

    private emitText(delta: string): void {
        for (const handler of this.handlers.text) {
            handler(delta);
        }
    }

    private emitAction(action: AgentActionPublicType): void {
        for (const handler of this.handlers.action) {
            handler(action);
        }
    }

    private emitChainOfThought(delta: string): void {
        for (const handler of this.handlers.chainOfThought) {
            handler(delta);
        }
    }

    private emitError(error: DustAPIError): void {
        for (const handler of this.handlers.error) {
            handler(error);
        }
    }
}
