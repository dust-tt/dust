import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ButlerSuggestionData,
  ButlerSuggestionMetadata,
  ButlerSuggestionType,
} from "@app/types/conversation_butler_suggestion";
import type { ModelId } from "@app/types/shared/model_id";

// What every evaluator receives.
export interface EvaluatorContext {
  conversation: ConversationType;
  currentTitle: string;
  availableAgents: LightAgentConfigurationType[];
  hasFrame: boolean;
  sourceMessageId: ModelId;
  sourceMessageRank: number;
  suggestionHistory: ButlerSuggestionData[];
}

// What an evaluator returns when it has a suggestion to propose.
export interface EvaluatorResult {
  suggestionType: ButlerSuggestionType;
  metadata: ButlerSuggestionMetadata;
}

// The evaluator contract.
export interface ButlerEvaluator {
  // Which suggestion type this evaluator produces.
  type: ButlerSuggestionType;

  // Whether this evaluator should run given the current conversation state.
  // Cheap check -- no LLM call. Used to skip evaluators that can't possibly
  // produce a result (e.g. frame evaluator when a frame already exists).
  shouldRun(context: EvaluatorContext): boolean;

  // Build the prompt and tool specification for the LLM call.
  getPromptAndSpec(context: EvaluatorContext): {
    prompt: string;
    specification: AgentActionSpecification;
  };

  // Parse the LLM tool call result and return a suggestion if confidence passes.
  // Returns null if nothing to suggest.
  parseResult(
    toolArguments: Record<string, unknown>,
    context: EvaluatorContext
  ): EvaluatorResult | null;
}
