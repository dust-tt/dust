import { OpenAI } from "openai";

import { LLM } from "@app/lib/llm/llm";
import type { ProviderMetadata } from "@app/lib/llm/types";
import type { ModelConfigurationType, ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

export class OpenAILLM extends LLM {
    private client: OpenAI;
    private temperature: number;
    private metadata: ProviderMetadata;
    constructor({
        temperature,
        model,
    }: {
        temperature: number;
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
    }

    async *stream({
        conversation,
        prompt,
    }: {
        conversation: ModelMessageTypeMultiActionsWithoutContentFragment[];
        prompt: string;
    }): AsyncGenerator<LLMEvent> {
        const events = this.modelStream({
            conversation,
}