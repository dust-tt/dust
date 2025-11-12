import * as t from "io-ts";

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import type { APIError, ModelIdType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Part of the new doc tracker pipeline, suggest changes  based on a "source_document" (new incoming doc)
// and a "target_document" (the tracked doc)
// it takes {source_document, target_document} a
// it returns {match: false} or {match: true, suggested_changes: string}
export async function callDocTrackerSuggestChangesAction(
  auth: Authenticator,
  {
    watchedDocDiff,
    maintainedDocContent,
    prompt,
    providerId,
    modelId,
  }: {
    watchedDocDiff: string;
    maintainedDocContent: string;
    prompt: string | null;
    providerId: ModelProviderIdType;
    modelId: ModelIdType;
  }
): Promise<
  Result<
    { result: DocTrackerSuggestChangesActionResult; runId: string | null },
    APIError
  >
> {
  // Build the system instructions.
  let instructions = `The role of the assistant is to assess whether a tracked document needs to be updated based on a recent change made to another document. If the tracked document needs to be updated, the assistant provides a change suggestion.

The assistant is provided with the text of the tracked document, and with the diff of the modified document.
The diff will contain "insertions" and potentially "deletions".

The assistant should follow these guidelines:
- The tracked document should be updated if the insertions are relevant but absent from the tracked document.
- The tracked document should be updated if the insertions are relevant and contradict the tracked document.
- The tracked document should be updated if the insertions are relevant and more precise than the information in the tracked document.
- The tracked document should not be updated if diff is not relevant with the information already present in the tracked document.
- The change suggestion, if any, should be as clear and precise as possible.
- The should not be any change suggestion if the tracked document should not be updated (\`suggestion\` should be an empty string)
- The suggesion (if any) should always be written in the tone of the tracked document rather than in the tone of the diff (in case there are any noticeable differences).
- New lines in the suggestion should always be properly escaped.
- A change should be suggested only if the confidence score is at least 75`;

  if (prompt?.trim().length) {
    instructions += `\n\nThe user who created this tracker also provided the following guidelines:\n${prompt.trim()}`;
  }

  // Format the user message.
  const userMessage =
    `This is the tracked document text:\n${maintainedDocContent}\n\n` +
    `This is the new information diff:\n${watchedDocDiff}`;

  // Define the function specification.
  const specifications = [
    {
      name: "suggest_changes",
      description:
        "Returns suggested changes to the tracked document based on the new information.",
      inputSchema: {
        type: "object",
        properties: {
          thinking: {
            type: "string",
            description:
              "A short, high level explanation for why it is relevant or not relevant to update the tracked document based on the diff.",
          },
          confidence_score: {
            type: "number",
            description:
              "A score between 0 and 100 indicating how confident the assistant is that the tracked document needs an update. A score of 100 means the assistant is absolutely convinced an update is needed. A score of 0 means no update is needed. Only suggest changes if the score is above 75.",
          },
          suggestion: {
            type: "string",
            description:
              "The changes suggested to the tracked document, left empty if there is no relevant change to suggest, which is possible.",
          },
        },
        required: ["thinking", "confidence_score", "suggestion"],
      },
    },
  ];

  // Call the multi-actions agent.
  const res = await runMultiActionsAgent(
    auth,
    {
      providerId,
      modelId,
      functionCall: "suggest_changes",
      temperature: 0.3,
      useCache: true,
    },
    {
      conversation: { messages: [{ role: "user", content: userMessage }] },
      prompt: instructions,
      specifications,
    }
  );

  if (res.isErr()) {
    return new Err({
      type: "internal_server_error",
      message: res.error.message,
    });
  }

  // Extract the function call arguments.
  const functionArgs = res.value.actions?.[0]?.arguments;

  if (!functionArgs) {
    return new Err({
      type: "internal_server_error",
      message: "No function call arguments found in LLM response",
    });
  }

  const result: DocTrackerSuggestChangesActionResult = {
    thinking: functionArgs.thinking ?? null,
    confidence_score: functionArgs.confidence_score ?? null,
    suggestion: functionArgs.suggestion ?? null,
  };

  return new Ok({ result, runId: null });
}

const DocTrackerSuggestChangesActionResultSchema = t.partial({
  thinking: t.union([t.string, t.null, t.undefined]),
  confidence_score: t.union([t.number, t.null, t.undefined]),
  suggestion: t.union([t.string, t.null, t.undefined]),
});

type DocTrackerSuggestChangesActionResult = t.TypeOf<
  typeof DocTrackerSuggestChangesActionResultSchema
>;
