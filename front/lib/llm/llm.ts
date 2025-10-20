import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMEvent } from "@app/lib/llm/types/events";
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
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent>;
}
