import type { LLMStreamEvent } from "@app/lib/llm/types";
import type { ModelProviderIdType,RenderedModelConversationTypeMultiActions } from "@app/types";

export abstract class LLM {
    protected temperature: number;
    protected modelId: string;
    protected providerId: ModelProviderIdType;

    constructor({ temperature, modelId, providerId }: { temperature: number, modelId: string, providerId: ModelProviderIdType }) {
        this.temperature = temperature;
        this.modelId = modelId;
        this.providerId = providerId;
    }

    abstract stream({
        conversation,
        prompt
    }: {
        conversation: RenderedModelConversationTypeMultiActions;
        prompt: string;
    }): AsyncGenerator<LLMStreamEvent>;
}
