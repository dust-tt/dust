import { OpenAI } from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";

import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/api/llm/types/events";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import { toInput, toOpenAIReasoningEffort } from "@app/lib/llm/providers/openai/utils/conversation_to_openai";
import { toEvents } from "@app/lib/llm/providers/openai/utils/openai_to_events";
import type { ModelConfigurationType, ModelConversationTypeMultiActions } from "@app/types";

export class OpenAILLM extends LLM {
    private client: OpenAI;
    protected metadata: ProviderMetadata;

    constructor({
        options,
        model,
    }: {
        options: LLMOptions;
        model: ModelConfigurationType;
    }) {
        super({ model, options });
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY ?? "",
        });
        this.metadata = {
            providerId: "openai",
            modelId: model.modelId,
        };
    }

    async *stream({
        conversation,
        prompt,
    }: {
        conversation: ModelConversationTypeMultiActions;
        prompt: string;
    }): AsyncGenerator<LLMEvent> {
        const events = this.modelStream({
            conversation,
            prompt,
        });
        for await (const event of events) {
            yield* toEvents({
                event,
                metadata: this.metadata,
            });
        }
    }

    async *modelStream({
        conversation,
        prompt,
    }: {
        conversation: ModelConversationTypeMultiActions;
        prompt: string;
    }): AsyncGenerator<ResponseStreamEvent> {
        const response = await this.client.responses.create({
            model: this.model.modelId,
            input: toInput(prompt, conversation),
            stream: true,
            temperature: this.options?.temperature,
            reasoning: {
                effort: toOpenAIReasoningEffort(this.options?.reasoningEffort ?? "none"),
            }
        });
        yield* response;
    }
}