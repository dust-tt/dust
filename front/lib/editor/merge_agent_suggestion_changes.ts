import { DustError } from "@app/lib/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentSuggestionType,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { AgentSuggestionDataSchema } from "@app/types/suggestions/agent_suggestion";

export interface AgentFieldEdits {
  name?: string;
  model?: ModelSuggestionType;
  description?: string;
  scope?: "hidden" | "visible";
  instructions?: InstructionsSuggestionSchemaType[];
}

type AgentSuggestionChangeInput = Pick<
  AgentSuggestionType,
  "kind" | "suggestion"
>;

function fieldEditsForSuggestion(
  suggestion: AgentSuggestionChangeInput
): Result<AgentFieldEdits, DustError<"invalid_request_error">> {
  const parsed = AgentSuggestionDataSchema.safeParse({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });
  if (!parsed.success) {
    return new Err(
      new DustError("invalid_request_error", "Unsupported agent suggestion.")
    );
  }

  const data = parsed.data;
  switch (data.kind) {
    // Creating and deleting an agent edit none of its fields.
    case "create":
    case "delete":
      return new Ok({});

    case "model":
      return new Ok({ model: data.suggestion });

    case "name":
      return new Ok({ name: data.suggestion.name });

    case "description":
      return new Ok({ description: data.suggestion.description });

    case "scope":
      return new Ok({ scope: data.suggestion.scope });

    case "instructions":
      return new Ok({ instructions: [data.suggestion] });

    case "knowledge":
    case "skills":
    case "sub_agent":
    case "tools":
      return new Err(
        new DustError(
          "invalid_request_error",
          `Suggestions of kind "${data.kind}" cannot be applied server-side yet.`
        )
      );

    default:
      assertNeverAndIgnore(data);
      return new Err(
        new DustError("invalid_request_error", "Unsupported agent suggestion.")
      );
  }
}

function mergeFieldEdits(
  merged: AgentFieldEdits,
  next: AgentFieldEdits
): AgentFieldEdits {
  const instructions = [
    ...(merged.instructions ?? []),
    ...(next.instructions ?? []),
  ];

  return {
    ...merged,
    ...next,
    ...(instructions.length > 0 ? { instructions } : {}),
  };
}

export function mergeAgentFieldEdits(
  suggestions: AgentSuggestionChangeInput[]
): Result<AgentFieldEdits, DustError<"invalid_request_error">> {
  let merged: AgentFieldEdits = {};

  for (const suggestion of suggestions) {
    const edits = fieldEditsForSuggestion(suggestion);
    if (edits.isErr()) {
      return edits;
    }

    merged = mergeFieldEdits(merged, edits.value);
  }

  return new Ok(merged);
}
