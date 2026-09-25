import { mergeAgentFieldEdits } from "@app/lib/editor/merge_agent_suggestion_changes";
import type { MarkdownPipeline } from "@app/lib/editor/skill_instructions_html";
import { applyInstructionEditsToHtml } from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  AgentSuggestionType,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

type PreviewedAgentFields = Pick<
  AgentConfigurationType,
  | "name"
  | "description"
  | "scope"
  | "instructions"
  | "instructionsHtml"
  | "model"
>;

interface PreviewAgentSuggestionsInput {
  agent: PreviewedAgentFields;
  suggestions: AgentSuggestionType[];
  pipeline: MarkdownPipeline;
}

function previewInstructions(
  agent: PreviewedAgentFields,
  edits: InstructionsSuggestionSchemaType[],
  pipeline: MarkdownPipeline
): Result<
  Pick<PreviewedAgentFields, "instructions" | "instructionsHtml">,
  DustError<"invalid_request_error">
> {
  if (edits.length === 0) {
    return new Ok({
      instructions: agent.instructions,
      instructionsHtml: agent.instructionsHtml,
    });
  }

  if (!agent.instructionsHtml) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets has no block-structured instructions."
      )
    );
  }

  return applyInstructionEditsToHtml(
    agent.instructionsHtml,
    edits.map(({ targetBlockId, content }) => ({ targetBlockId, content })),
    pipeline
  );
}

function previewModel(
  currentModel: PreviewedAgentFields["model"],
  model: ModelSuggestionType | undefined
): Result<PreviewedAgentFields["model"], DustError<"invalid_request_error">> {
  if (!model) {
    return new Ok(currentModel);
  }

  const config = SUPPORTED_MODEL_CONFIGS.find(
    (m) => m.modelId === model.modelId
  );
  if (!config) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Model "${model.modelId}" is not supported.`
      )
    );
  }

  return new Ok({
    ...currentModel,
    providerId: config.providerId,
    modelId: config.modelId,
    reasoningEffort: model.reasoningEffort ?? config.defaultReasoningEffort,
  });
}

export function previewAgentSuggestions({
  agent,
  suggestions,
  pipeline,
}: PreviewAgentSuggestionsInput): Result<
  PreviewedAgentFields,
  DustError<"invalid_request_error">
> {
  const edits = mergeAgentFieldEdits(suggestions);
  if (edits.isErr()) {
    return edits;
  }

  const { name, description, scope, instructions, model } = edits.value;

  const instructionsRes = previewInstructions(
    agent,
    instructions ?? [],
    pipeline
  );
  if (instructionsRes.isErr()) {
    return instructionsRes;
  }

  const modelRes = previewModel(agent.model, model);
  if (modelRes.isErr()) {
    return modelRes;
  }

  return new Ok({
    name: name ?? agent.name,
    description: description ?? agent.description,
    scope: scope ?? agent.scope,
    model: modelRes.value,
    ...instructionsRes.value,
  });
}
