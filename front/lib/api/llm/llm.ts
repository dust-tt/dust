import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffort,
  Result,
} from "@app/types";
import { normalizeError } from "@app/types";
import { Err, Ok } from "@app/types";

type streamProps = {
  conversation: ModelConversationTypeMultiActions;
  prompt: string;
  specifications: AgentActionSpecification[];
};

export abstract class LLM {
  protected modelId: ModelIdType;
  protected temperature: number;
  protected reasoningEffort: ReasoningEffort;
  protected bypassFeatureFlag: boolean;

  protected constructor({
    modelId,
    temperature = AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced,
    reasoningEffort = "none",
    bypassFeatureFlag = false,
  }: LLMParameters) {
    this.modelId = modelId;
    this.temperature = temperature;
    this.reasoningEffort = reasoningEffort;
    this.bypassFeatureFlag = bypassFeatureFlag;
  }

  stream({
    conversation,
    prompt,
    specifications,
  }: streamProps): Result<AsyncGenerator<LLMEvent>, Error> {
    try {
      return new Ok(
        this.internalStream({ conversation, prompt, specifications })
      );
    } catch (error) {
      return new Err(normalizeError(Error));
    }
  }

  protected abstract internalStream({
    conversation,
    prompt,
    specifications,
  }: streamProps): AsyncGenerator<LLMEvent>;
}
