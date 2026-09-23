import { DustError } from "@app/lib/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentSuggestionType,
  CreateSuggestionType,
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

type AgentChange =
  | { type: "create"; create: CreateSuggestionType }
  | { type: "archive" }
  | { type: "fields"; fields: AgentFieldEdits };

type AgentSuggestionChangeInput = Pick<
  AgentSuggestionType,
  "kind" | "suggestion"
>;

function changeForSuggestion(
  suggestion: AgentSuggestionChangeInput
): Result<AgentChange, DustError<"invalid_request_error">> {
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
    case "create":
      return new Ok({ type: "create", create: data.suggestion });

    case "delete":
      return new Ok({ type: "archive" });

    case "model":
      return new Ok({ type: "fields", fields: { model: data.suggestion } });

    case "name":
      return new Ok({ type: "fields", fields: { name: data.suggestion.name } });

    case "description":
      return new Ok({
        type: "fields",
        fields: { description: data.suggestion.description },
      });

    case "scope":
      return new Ok({
        type: "fields",
        fields: { scope: data.suggestion.scope },
      });

    case "instructions":
      return new Ok({
        type: "fields",
        fields: { instructions: [data.suggestion] },
      });

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

export interface AgentBatchChanges {
  create?: CreateSuggestionType;
  archive?: true;
  fields: AgentFieldEdits;
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

function mergeAgentChanges(changes: AgentChange[]): AgentBatchChanges {
  return changes.reduce<AgentBatchChanges>(
    (merged, next) => ({
      create: next.type === "create" ? next.create : merged.create,
      archive: next.type === "archive" ? true : merged.archive,
      fields:
        next.type === "fields"
          ? mergeFieldEdits(merged.fields, next.fields)
          : merged.fields,
    }),
    { fields: {} }
  );
}

export function mergeAgentSuggestionChanges(
  suggestions: AgentSuggestionChangeInput[]
): Result<AgentBatchChanges, DustError<"invalid_request_error">> {
  const changes: AgentChange[] = [];

  for (const suggestion of suggestions) {
    const change = changeForSuggestion(suggestion);
    if (change.isErr()) {
      return change;
    }

    changes.push(change.value);
  }

  return new Ok(mergeAgentChanges(changes));
}
