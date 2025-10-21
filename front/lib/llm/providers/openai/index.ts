import { OpenAI } from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";

import { LLM } from "@app/lib/llm/llm";
import { toOpenAIReasoningEffort } from "@app/lib/llm/providers/openai/utils/conversation_to_openai";
import type { LLMEvent, ProviderMetadata } from "@app/lib/llm/types";
import type { AgentReasoningEffort, ModelConfigurationType, ModelConversationTypeMultiActions } from "@app/types";

export class OpenAILLM extends LLM {
    private client: OpenAI;
    private textAccumulator: string = "";
    private reasoningAccumulator: string = "";
    protected reasoningEffort: AgentReasoningEffort;
    protected temperature: number;
    protected metadata: ProviderMetadata;

    constructor({
        temperature,
        reasoningEffort,
        model,
    }: {
        temperature: number;
        reasoningEffort: AgentReasoningEffort;
        model: ModelConfigurationType;
    }) {
        super(model);
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY ?? "",
        });
        this.temperature = temperature;
        this.metadata = {
            providerId: "openai",
            modelId: model.modelId,
        };
        this.reasoningEffort = reasoningEffort;
    }

    private resetAccumulators = () => {
        this.textAccumulator = "";
        this.reasoningAccumulator = "";
    }
    private appendTextAccumulator = (text: string) => this.textAccumulator += text;
    private appendReasoningAccumulator = (text: string) => this.reasoningAccumulator += text;
    private getTextAccumulator = () => this.textAccumulator;
    private getReasoningAccumulator = () => this.reasoningAccumulator;

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
        this.resetAccumulators();
        for await (const event of events) {
            yield* toEvents({
                event,
                metadata: this.metadata,
                accumulatorUtils: {
                    resetAccumulators: this.resetAccumulators,
                    appendTextAccumulator: this.appendTextAccumulator,
                    appendReasoningAccumulator: this.appendReasoningAccumulator,
                },
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
            reasoning: {
                effort: toOpenAIReasoningEffort(this.reasoningEffort),
            }
        });
        yield* response;
    }
}