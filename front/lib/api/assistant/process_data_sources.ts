import type { JSONSchema7 as JSONSchema } from "json-schema";
import z from "zod";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgentModelConfigurationType,
  CoreAPISearchFilter,
  ModelConversationTypeMultiActions,
  Result,
} from "@app/types";
import { CoreAPI, dustManagedCredentials, Err, Ok } from "@app/types";

const EXTRACT_DATA_FUNCTION_NAME = "extract_data";
const MAP_MAX_ITERATIONS = 32;

const ExtractDataResponseSchema = z.object({
  data_points: z.array(z.unknown()).optional(),
});

export type CoreDataSourceSearchCriteria = {
  projectId: string;
  dataSourceId: string;
  filter: CoreAPISearchFilter;
  view_filter: CoreAPISearchFilter;
};

type ProcessDataSourcesParams = {
  auth: Authenticator;
  coreDataSourceSearchCriterias: CoreDataSourceSearchCriteria[];
  model: AgentModelConfigurationType;
  prompt: string;
  objective: string;
  jsonSchema: JSONSchema;
  topK: number;
};

type ProcessDataSourcesResult = {
  data: unknown[];
  minTimestamp: number;
  totalDocuments: number;
  totalChunks: number;
  totalTokens: number;
};

export async function processDataSources({
  auth,
  coreDataSourceSearchCriterias,
  model,
  prompt,
  objective,
  jsonSchema,
  topK,
}: ProcessDataSourcesParams): Promise<Result<ProcessDataSourcesResult, Error>> {
  // Step 1: Retrieve documents from data sources
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = dustManagedCredentials();

  const searchResults = await coreAPI.searchDataSources(
    "",
    topK,
    credentials,
    true,
    coreDataSourceSearchCriterias
  );

  if (searchResults.isErr()) {
    return new Err(
      new Error(`Failed to retrieve documents: ${searchResults.error.message}`)
    );
  }

  const documents = searchResults.value.documents;

  // Step 2: Extract chunks and compute metadata
  let totalDocuments = 0;
  let totalTokens = 0;
  let totalChunks = 0;
  let minTimestamp = Date.now();
  const allChunks: Array<{ offset: number; text: string }> = [];

  for (const doc of documents) {
    if (minTimestamp > doc.timestamp) {
      minTimestamp = doc.timestamp;
    }
    totalDocuments += 1;
    totalTokens += doc.text_size;
    totalChunks += doc.chunk_count;

    for (const chunk of doc.chunks) {
      allChunks.push({ offset: chunk.offset, text: chunk.text });
    }
  }

  if (allChunks.length === 0) {
    return new Ok({
      data: [],
      minTimestamp,
      totalDocuments,
      totalChunks,
      totalTokens,
    });
  }

  // Step 3: Split chunks into batches
  const groupSize = Math.ceil(allChunks.length / MAP_MAX_ITERATIONS);
  const batches: string[] = [];

  for (let i = 0; i < MAP_MAX_ITERATIONS; i++) {
    const batchChunks = allChunks.slice(i * groupSize, (i + 1) * groupSize);
    if (batchChunks.length === 0) {
      break;
    }

    const batchContent = batchChunks
      .map((c) => `<chunk offset="${c.offset}">\n${c.text}</chunk>`)
      .join("\n\n");

    batches.push(batchContent);
  }

  // Step 4: Build function specification
  const specifications: AgentActionSpecification[] = [
    {
      name: EXTRACT_DATA_FUNCTION_NAME,
      description:
        "Call this function with an array of extracted data points from retrieved information chunks.",
      inputSchema: {
        type: "object",
        properties: {
          data_points: {
            type: "array",
            items: jsonSchema,
            description:
              "The data points extracted from provided documents, as many or as few as required to follow instructions.",
          },
        },
        required: ["data_points"],
      },
    },
  ];

  // Step 5: Process each batch in parallel
  const extractionResults = await concurrentExecutor(
    batches,
    async (batchContent) => {
      const conversation: ModelConversationTypeMultiActions = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `USER OBJECTIVE: ${objective}\nOnly call ${EXTRACT_DATA_FUNCTION_NAME} with data points relevant to the user objective.\n\n` +
                  `CHUNKS:\n${batchContent}`,
              },
            ],
            name: "",
          },
        ],
      };

      const res = await runMultiActionsAgent(
        auth,
        {
          functionCall: EXTRACT_DATA_FUNCTION_NAME,
          modelId: model.modelId,
          providerId: model.providerId,
          temperature: model.temperature,
          useCache: false,
        },
        {
          conversation,
          prompt,
          specifications,
          forceToolCall: EXTRACT_DATA_FUNCTION_NAME,
        },
        {
          context: {
            operationType: "process_data_sources",
            userId: auth.user()?.sId,
            workspaceId: auth.getNonNullableWorkspace().sId,
          },
        }
      );

      if (res.isErr()) {
        return new Err(res.error);
      }

      const actionArguments = res.value.actions?.[0]?.arguments;
      if (!actionArguments) {
        return new Ok([]);
      }

      const responseValidation =
        ExtractDataResponseSchema.safeParse(actionArguments);

      if (!responseValidation.success) {
        return new Err(
          new Error(
            `The model failed to generate valid JSON extracts: ${JSON.stringify(responseValidation.error.issues)}`
          )
        );
      }

      return new Ok(responseValidation.data.data_points ?? []);
    },
    { concurrency: MAP_MAX_ITERATIONS }
  );

  const errors = extractionResults.filter((r) => r.isErr());
  if (errors.length > 0) {
    const firstError = errors[0];
    if (firstError.isErr()) {
      return new Err(
        new Error(`Extraction failed: ${firstError.error.message}`)
      );
    }
  }

  // Step 6: Aggregate all extracted data points
  const allDataPoints = extractionResults.flatMap((r) =>
    r.isOk() ? r.value : []
  );

  return new Ok({
    data: allDataPoints,
    minTimestamp,
    totalDocuments,
    totalChunks,
    totalTokens,
  });
}
