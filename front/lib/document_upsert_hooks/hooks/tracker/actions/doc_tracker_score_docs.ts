import * as t from "io-ts";

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import type { APIError, ModelIdType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

const IDENTIFIERS = "abcdefghijklmnopqrstuvwxyz".split("");

const PROMPT_INSTRUCTIONS = `The role of the assistant is to assess whether reference documents need to be updated based on a recent change made to another document (the "modified document").

The assistant will be provided with a list of reference documents, each assigned a one-letter identifier.
The assistant will also be provided with the diff of the modified document.

The assistant must identify which reference documents require updates and provide a relevance score (0-100) for each.

The assistant should follow these guidelines:
- A reference document should be updated if the insertions in the modified document are relevant but absent from the reference document.
- A reference document should be updated if the insertions in the modified document are relevant and contradict the reference document.
- A reference document should be updated if the insertions in the modified document are relevant and more precise than the information in the reference document.
- A reference document should not be updated if the diff is not relevant to the information already present in the reference document.
- Only include documents that clearly and unambiguously need to be updated.
- Provide a score from 0-100 indicating the relevance/necessity of the update (higher = more necessary).`;

const SCORE_DOCUMENTS_FUNCTION_SPECIFICATIONS = [
  {
    name: "score_documents",
    description:
      "Identify reference documents that need updating and provide relevance scores",
    inputSchema: {
      type: "object",
      properties: {
        documents_to_update: {
          type: "array",
          description:
            "Array of documents that need updating with their identifiers and relevance scores (0-100)",
          items: {
            type: "object",
            properties: {
              document_identifier: {
                type: "string",
                description: "Single letter identifier of the document (a-z)",
              },
              score: {
                type: "number",
                description:
                  "Relevance score from 0-100 indicating necessity of update",
              },
            },
            required: ["document_identifier", "score"],
          },
        },
      },
      required: ["documents_to_update"],
    },
  },
];

export async function callDocTrackerScoreDocsAction(
  auth: Authenticator,
  {
    watchedDocDiff,
    maintainedDocuments,
    prompt,
    providerId,
    modelId,
  }: {
    watchedDocDiff: string;
    maintainedDocuments: Array<{
      content: string;
      title: string | null;
      sourceUrl: string | null;
      dataSourceId: string;
      documentId: string;
    }>;
    prompt: string | null;
    providerId: ModelProviderIdType;
    modelId: ModelIdType;
  }
): Promise<Result<DocTrackerScoreDocsActionResult, APIError>> {
  const instructions = prompt
    ? PROMPT_INSTRUCTIONS +
      `\n\nSome additional guidelines were provided by the user:\n${prompt}`
    : PROMPT_INSTRUCTIONS;

  // Format the reference documents with their identifiers.
  const formattedDocs = maintainedDocuments
    .map((doc, i) => {
      return (
        `REFERENCE DOCUMENT:\n` +
        `document_identifier: "${IDENTIFIERS[i]}"\n` +
        `document_title: ${doc.title}\n` +
        `doc_source_url: ${doc.sourceUrl}\n\n` +
        doc.content +
        "\n\n----------\n"
      );
    })
    .join("\n");

  const userMessage =
    formattedDocs + `MODIFIED DOCUMENT DIFF:\n\n${watchedDocDiff}`;

  // Call the multi-actions agent.
  const res = await runMultiActionsAgent(
    auth,
    {
      providerId,
      modelId,
      functionCall: "score_documents",
      temperature: 0,
      useCache: true,
    },
    {
      conversation: { messages: [{ role: "user", content: userMessage }] },
      prompt: instructions,
      specifications: SCORE_DOCUMENTS_FUNCTION_SPECIFICATIONS,
    }
  );

  if (res.isErr()) {
    return new Err({
      type: "internal_server_error",
      message: res.error.message,
    });
  }

  // Extract the scored documents from the function call.
  const documentsToUpdate =
    res.value.actions?.[0]?.arguments?.documents_to_update;

  if (!documentsToUpdate || !Array.isArray(documentsToUpdate)) {
    return new Err({
      type: "internal_server_error",
      message: "No documents_to_update found in LLM response",
    });
  }

  // Map the identifiers back to the actual documents with their scores.
  const result = documentsToUpdate
    .map((item: { document_identifier: string; score: number }) => {
      const index = IDENTIFIERS.indexOf(item.document_identifier);
      if (index === -1 || index >= maintainedDocuments.length) {
        return null;
      }
      const doc = maintainedDocuments[index];
      return {
        documentId: doc.documentId,
        dataSourceId: doc.dataSourceId,
        score: item.score / 100, // Normalize to 0-1 range to match original output
        title: doc.title,
        sourceUrl: doc.sourceUrl,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return new Ok(result);
}

const DocTrackerScoreDocsActionResultSchema = t.array(
  t.type({
    documentId: t.string,
    dataSourceId: t.string,
    score: t.number,
    title: t.union([t.string, t.null, t.undefined]),
    sourceUrl: t.union([t.string, t.null, t.undefined]),
  })
);

type DocTrackerScoreDocsActionResult = t.TypeOf<
  typeof DocTrackerScoreDocsActionResultSchema
>;
