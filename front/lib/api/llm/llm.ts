import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffortIdType,
} from "@app/types";

export abstract class LLM {
  protected modelId: ModelIdType;
  protected temperature: number;
  protected reasoningEffortId: ReasoningEffortIdType;
  protected bypassFeatureFlag: boolean;

  constructor({
    modelId,
    temperature,
    reasoningEffortId,
    bypassFeatureFlag = false,
  }: LLMParameters) {
    this.modelId = modelId;
    this.temperature =
      temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced;
    this.reasoningEffortId = reasoningEffortId ?? "none";
    this.bypassFeatureFlag = bypassFeatureFlag;
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
