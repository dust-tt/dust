import { DustError } from "@app/lib/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentSuggestionType,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  SkillsSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { AgentSuggestionDataSchema } from "@app/types/suggestions/agent_suggestion";

export interface AgentEdits {
  name?: string;
  model?: ModelSuggestionType;
  description?: string;
  scope?: "hidden" | "visible";
  instructions?: InstructionsSuggestionSchemaType[];
  skills?: SkillsSuggestionType[];
  tools?: ToolsSuggestionType[];
  subAgents?: SubAgentSuggestionType[];
}

type AgentSuggestionChangeInput = Pick<
  AgentSuggestionType,
  "kind" | "suggestion"
>;

function fieldEditsForSuggestion(
  suggestion: AgentSuggestionChangeInput
): Result<AgentEdits, DustError<"invalid_request_error">> {
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

    case "tools":
      return new Ok({ tools: [data.suggestion] });

    case "skills":
      return new Ok({ skills: [data.suggestion] });

    case "sub_agent":
      return new Ok({ subAgents: [data.suggestion] });

    case "knowledge":
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

function mergeFieldEdits(merged: AgentEdits, next: AgentEdits): AgentEdits {
  const instructions = [
    ...(merged.instructions ?? []),
    ...(next.instructions ?? []),
  ];
  const skills = [...(merged.skills ?? []), ...(next.skills ?? [])];
  const tools = [...(merged.tools ?? []), ...(next.tools ?? [])];
  const subAgents = [...(merged.subAgents ?? []), ...(next.subAgents ?? [])];

  return {
    ...merged,
    ...next,
    ...(instructions.length > 0 ? { instructions } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(subAgents.length > 0 ? { subAgents } : {}),
  };
}

export function mergeAgentEdits(
  suggestions: AgentSuggestionChangeInput[]
): Result<AgentEdits, DustError<"invalid_request_error">> {
  let merged: AgentEdits = {};

  for (const suggestion of suggestions) {
    const edits = fieldEditsForSuggestion(suggestion);
    if (edits.isErr()) {
      return edits;
    }

    merged = mergeFieldEdits(merged, edits.value);
  }

  return new Ok(merged);
}
