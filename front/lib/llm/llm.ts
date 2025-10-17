import type { LLMStreamEvent } from "@app/lib/llm/types";
import type {
  AgentReasoningEffort,
  ModelConversationTypeMultiActions,
  ModelProviderIdType,
} from "@app/types";

export abstract class LLM {
  protected temperature: number;
  protected modelId: string;
  protected providerId: ModelProviderIdType;
  protected reasoningEffort: AgentReasoningEffort;

  constructor({
    temperature,
    modelId,
    providerId,
    reasoningEffort,
  }: {
    temperature: number;
    modelId: string;
    providerId: ModelProviderIdType;
    reasoningEffort: AgentReasoningEffort;
  }) {
    this.temperature = temperature;
    this.modelId = modelId;
    this.providerId = providerId;
    this.reasoningEffort = reasoningEffort;
  }

  abstract stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMStreamEvent>;
}
