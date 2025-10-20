import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMEvent } from "@app/lib/llm/types/events";
import type { LLMOptions } from "@app/lib/llm/types/options";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

export abstract class LLM {
  protected model: ModelConfigurationType;
  protected options: LLMOptions | undefined;

  constructor({
    model,
    options,
  }: {
    model: ModelConfigurationType;
    options?: LLMOptions;
  }) {
    this.model = model;
    this.options = options;
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
