import type { LLMEvent } from "@app/lib/llm/types";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

export abstract class LLM {
  protected model: ModelConfigurationType;

  constructor(model: ModelConfigurationType) {
    this.model = model;
  }

  abstract stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent>;
}
