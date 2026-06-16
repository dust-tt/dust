import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import type { CoreDataSourceSearchCriteria } from "@app/lib/api/assistant/process_data_sources";
import { writeToToolOutputsFolder } from "@app/lib/api/files/action_output_fs";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
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
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

// Type definition for process action outputs
export type ProcessActionOutputsType = {
  data: unknown[];
  total_documents?: number;
};

export async function getCoreDataSourceSearchCriterias(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType,
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
  const coreSearchArgsResults = await getCoreSearchArgs(auth, dataSources);

  if (coreSearchArgsResults.isErr()) {
    return new Err(
      new Error(
        `Failed to get core search args: ${coreSearchArgsResults.error.message}`
      )
    );
  }

  const coreSearchArgs = coreSearchArgsResults.value;

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
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      agentsList: null,
      conversation,
    })
  );
}

const EXTRACT_RESULT_FILE_STEM_MAX_LENGTH = 100;
const EXTRACT_RESULT_SNIPPET_MAX_LENGTH = 1000;

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
}): Promise<
  Result<
    { processToolOutput: ReturnType<typeof buildProcessToolOutput> },
    Error
  >
> {
  const schemaNames = Object.keys(jsonSchema?.properties ?? {}).join("_");
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const stem = (
    jsonSchema?.title ||
    schemaNames ||
    "extract_results"
  ).substring(0, EXTRACT_RESULT_FILE_STEM_MAX_LENGTH);
  const fileName = makeFileName({ name: stem, ext: ".json" });
  const content = JSON.stringify(outputs?.data ?? [], null, 2);

  const writeResult = await writeToToolOutputsFolder(auth, conversation, {
    fileName,
    content,
    contentType: "application/json",
  });
  if (writeResult.isErr()) {
    return writeResult;
  }

  return new Ok({
    processToolOutput: buildProcessToolOutput({
      outputs,
      timeFrame,
      objective,
      fileName,
      content,
      scopedPath: writeResult.value,
    }),
  });
}

function buildProcessToolOutput({
  outputs,
  timeFrame,
  objective,
  fileName,
  content,
  scopedPath,
}: {
  outputs: ProcessActionOutputsType | null;
  timeFrame: TimeFrame | null;
  objective: string;
  fileName: string;
  content: string;
  scopedPath: string;
}) {
  const snippet =
    content.length > EXTRACT_RESULT_SNIPPET_MAX_LENGTH
      ? content.substring(0, EXTRACT_RESULT_SNIPPET_MAX_LENGTH) +
        "... (truncated)"
      : content;

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

  return [
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
        uri: "",
        path: scopedPath,
        title: fileName,
        contentType: "application/json" as const,
        snippet,
      },
    },
  ];
}
