// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { generateJSONFileAndSnippet } from "@app/lib/actions/action_file_helpers";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import type { CoreDataSourceSearchCriteria } from "@app/lib/api/assistant/process_data_sources";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
import { timeFrameFromNow } from "@app/types/shared/utils/time_frame";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES, removeNulls } from "@dust-tt/client";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

// Type definition for process action outputs
export type ProcessActionOutputsType = {
  data: unknown[];
  total_documents?: number;
};

/**
 * Generates a title for an extract results JSON file based on the schema
 */
export function getExtractFileTitle({
  schema,
}: {
  schema: JSONSchema | null;
}): string {
  const schemaNames = Object.keys(schema?.properties ?? {}).join("_");
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const title = schema?.title || schemaNames || "extract_results";
  // Make sure title is truncated to 100 characters
  return `${title.substring(0, 100)}.json`;
}

export async function getCoreDataSourceSearchCriterias(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType[number][],
  {
    timeFrame,
    tagsIn,
    tagsNot,
  }: {
    timeFrame?: TimeFrame;
    tagsIn?: string[];
    tagsNot?: string[];
  }
): Promise<Result<CoreDataSourceSearchCriteria[], Error>> {
  const coreSearchArgsResults = await concurrentExecutor(
    dataSources,
    async (dataSourceToolConfiguration) =>
      getCoreSearchArgs(auth, dataSourceToolConfiguration),
    { concurrency: 10 }
  );

  const coreSearchArgsErrors = coreSearchArgsResults.filter((r) => r.isErr());
  if (coreSearchArgsErrors.length > 0) {
    return new Err(
      new Error(
        `Failed to get core search args: ${coreSearchArgsErrors.map((e) => e.isErr() && e.error.message).join(", ")}`
      )
    );
  }

  const coreSearchArgs = removeNulls(
    coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
  );

  // Apply tag filters and timestamp
  const coreDataSourceSearchCriterias = coreSearchArgs.map((args) => {
    const finalTagsIn = [...(args.filter.tags?.in ?? []), ...(tagsIn ?? [])];
    const finalTagsNot = [...(args.filter.tags?.not ?? []), ...(tagsNot ?? [])];

    return {
      projectId: args.projectId,
      dataSourceId: args.dataSourceId,
      filter: {
        ...args.filter,
        tags:
          finalTagsIn.length > 0 || finalTagsNot.length > 0
            ? {
                in: finalTagsIn.length > 0 ? finalTagsIn : null,
                not: finalTagsNot.length > 0 ? finalTagsNot : null,
              }
            : null,
        timestamp: timeFrame
          ? {
              gt: timeFrameFromNow(timeFrame),
              lt: null,
            }
          : null,
      },
      view_filter: args.view_filter,
    };
  });

  return new Ok(coreDataSourceSearchCriterias);
}

export async function getPromptForProcessDustApp({
  auth,
  agentConfiguration,
  conversation,
}: {
  auth: Authenticator;
  agentConfiguration: AgentConfigurationType;
  conversation: ConversationType;
}) {
  // Grab user message.
  const userMessagesFiltered = conversation.content.filter((m) =>
    isUserMessageType(m[0])
  );
  const lastUserMessageTuple = userMessagesFiltered.at(-1);
  assert(
    lastUserMessageTuple,
    "No user message found in conversation content."
  );
  const userMessage: UserMessageType =
    lastUserMessageTuple[0] as UserMessageType;

  const model = getSupportedModelConfig(agentConfiguration.model);
  if (!model) {
    throw new Error(
      `Model config not found for ${agentConfiguration.model.modelId}`
    );
  }

  return systemPromptToText(
    constructPromptMultiActions(auth, {
      userMessage,
      agentConfiguration,
      fallbackPrompt:
        "Process the retrieved data to extract structured information based on the provided schema.",
      model,
      hasAvailableActions: false,
      enabledSkills: [],
      equippedSkills: [],
      agentsList: null,
      conversation,
    })
  );
}

export async function generateProcessToolOutput({
  auth,
  conversation,
  outputs,
  jsonSchema,
  timeFrame,
  objective,
}: {
  auth: Authenticator;
  conversation: ConversationType;
  outputs: ProcessActionOutputsType | null;
  jsonSchema: JSONSchema;
  timeFrame: TimeFrame | null;
  objective: string;
}) {
  const fileTitle = getExtractFileTitle({
    schema: jsonSchema,
  });
  const { jsonFile, jsonSnippet } = await generateJSONFileAndSnippet(auth, {
    title: fileTitle,
    conversationId: conversation.sId,
    data: outputs?.data,
  });
  const generatedFile: ActionGeneratedFileType = {
    fileId: jsonFile.sId,
    title: fileTitle,
    contentType: jsonFile.contentType,
    snippet: jsonSnippet,
  };
  const timeFrameAsString = timeFrame
    ? "the last " +
      (timeFrame.duration > 1
        ? `${timeFrame.duration} ${timeFrame.unit}s`
        : `${timeFrame.unit}`)
    : "all time";

  const extractResult =
    "PROCESSED OUTPUTS:\n" +
    (outputs?.data && outputs.data.length > 0
      ? outputs.data.map((d) => JSON.stringify(d)).join("\n")
      : "(none)");

  return {
    jsonFile,
    processToolOutput: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXTRACT_QUERY,
          text: `Extracted from ${outputs?.total_documents} documents over ${timeFrameAsString}.\nObjective: ${objective}`,
          uri: "",
        },
      },
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXTRACT_RESULT,
          text: extractResult,
          uri: jsonFile.getPrivateUrl(auth),
          fileId: generatedFile.fileId,
          title: generatedFile.title,
          contentType: generatedFile.contentType,
          snippet: generatedFile.snippet,
        },
      },
    ],
  };
}
