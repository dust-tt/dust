import { INTERNAL_MIME_TYPES, removeNulls } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import _ from "lodash";
import { z } from "zod";

import {
  generateJSONFileAndSnippet,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { PROCESS_ACTION_TOP_K } from "@app/lib/actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  ConfigurableToolInputSchemas,
  JsonSchemaSchema,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  getDataSourceConfiguration,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { ProcessActionOutputsType } from "@app/lib/actions/process";
import { getExtractFileTitle } from "@app/lib/actions/process/utils";
import { applyDataSourceFilters } from "@app/lib/actions/retrieval";
import { runActionStreamed } from "@app/lib/actions/server";
import type {
  ActionGeneratedFileType,
  AgentLoopContextType,
} from "@app/lib/actions/types";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
  ConversationType,
  TimeFrame,
  UserMessageType,
} from "@app/types";
import { isUserMessageType, timeFrameFromNow } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "extract_data",
  version: "1.0.0",
  description: "Structured extraction",
  icon: "ActionScanIcon",
  authorization: null,
};

const EXTRACT_TOOL_JSON_SCHEMA_ARGUMENT_DESCRIPTION =
  "A JSON schema that will be embedded in the following JSON schema:" +
  "\n```\n" +
  "{\n" +
  '  "name": "extract_data",\n' +
  '  "description": "Call this function with an array of extracted data points",\n' +
  '  "parameters": {\n' +
  '    "type": "object",\n' +
  '    "properties": {\n' +
  '      "data_points": {\n' +
  '         "type": "array",\n' +
  '         "items": $SCHEMA,\n' +
  '          "description": "The data points extracted from provided documents, as many as required to follow instructions."\n' +
  "        }\n" +
  "      },\n" +
  '      "required": ["data_points"]\n' +
  "    }\n" +
  "  }\n" +
  "}\n" +
  "```\n\n" +
  "Must be a valid JSON schema. Use only standard JSON Schema 7 core fields (type, properties, required, description) and avoid custom keywords or extensions that are not part of the core specification.\n\n" +
  "This schema will be used as signature to extract the relevant information based on selected documents to properly follow instructions.";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  const isJsonSchemaConfigured =
    (agentLoopContext?.listToolsContext &&
      isServerSideMCPServerConfiguration(
        agentLoopContext.listToolsContext.agentActionConfiguration
      ) &&
      agentLoopContext.listToolsContext.agentActionConfiguration.jsonSchema !==
        null) ||
    (agentLoopContext?.runContext &&
      isServerSideMCPToolConfiguration(
        agentLoopContext.runContext.actionConfiguration
      ) &&
      agentLoopContext.runContext.actionConfiguration.jsonSchema !== null);

  const isTimeFrameConfigured =
    (agentLoopContext?.listToolsContext &&
      isServerSideMCPServerConfiguration(
        agentLoopContext.listToolsContext.agentActionConfiguration
      ) &&
      agentLoopContext.listToolsContext.agentActionConfiguration.timeFrame !==
        null) ||
    (agentLoopContext?.runContext &&
      isServerSideMCPToolConfiguration(
        agentLoopContext.runContext.actionConfiguration
      ) &&
      agentLoopContext.runContext.actionConfiguration.timeFrame !== null);

  const isTagsModeConfigured = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  // Create tag schemas if needed for tag auto-mode
  const tagsInputSchema = isTagsModeConfigured
    ? {
        tagsIn: z
          .array(z.string())
          .describe(
            "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
              "If multiple labels are provided, the search will return documents that have at least one of the labels." +
              "You can't check that all labels are present, only that at least one is present." +
              "If no labels are provided, the search will return all documents regardless of their labels."
          ),
        tagsNot: z
          .array(z.string())
          .describe(
            "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
              "Any document having one of these labels will be excluded from the search."
          ),
      }
    : {};

  server.tool(
    "extract_information_from_documents",
    "Extract structured information from documents in reverse chronological order, according to the needs described by the objective and specified by a" +
      (isJsonSchemaConfigured ? " user-configured" : "") +
      " JSON schema. This tool retrieves content" +
      " from data sources already pre-configured by the user, ensuring the latest information is included.",
    {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      objective: z
        .string()
        .describe(
          "The objective behind the use of the tool based on the conversation state." +
            " This is used to guide the tool to extract the right data based on the user request."
        ),

      jsonSchema: isJsonSchemaConfigured
        ? ConfigurableToolInputSchemas[
            INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
          ]
        : JsonSchemaSchema.describe(
            EXTRACT_TOOL_JSON_SCHEMA_ARGUMENT_DESCRIPTION
          ),
      timeFrame: isTimeFrameConfigured
        ? ConfigurableToolInputSchemas[
            INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
          ]
        : z
            .object({
              duration: z.number(),
              unit: z.enum(["hour", "day", "week", "month", "year"]),
            })
            .describe(
              "The time frame to use for documents retrieval (e.g. last 7 days, last 2 months). Leave null to search all documents regardless of time."
            )
            .nullable(),
      ...tagsInputSchema,
    },
    async ({
      dataSources,
      objective,
      jsonSchema,
      timeFrame,
      tagsIn,
      tagsNot,
    }) => {
      // Unwrap and prepare variables.
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called."
      );
      const { agentConfiguration, conversation } = agentLoopContext.runContext;
      const { model } = agentConfiguration;
      // If jsonSchema was pre-configured by the user, i.e. not generated by the
      // tool, then it has an additional mimeType property, as is convention.
      // We remove it here before passing the jsonSchema to the dust app.
      // Thus the any cast.
      if ("mimeType" in jsonSchema) {
        delete (jsonSchema as any).mimeType;
      }

      // Similarly, if timeFrame was pre-configured by the user, it has an additional mimeType property.
      // We remove it here before passing the timeFrame to the dust app.
      if (timeFrame && "mimeType" in timeFrame) {
        delete (timeFrame as any).mimeType;
      }

      // prepare dust app inputs
      const prompt = await getPromptForProcessDustApp({
        auth,
        agentConfiguration,
        conversation,
      });
      const config = await getConfigForProcessDustApp({
        auth,
        model,
        dataSources,
        timeFrame,
        tagsIn,
        tagsNot,
      });

      // Call the dust app
      const res = await runActionStreamed(
        auth,
        "assistant-v2-process",
        config,
        [
          {
            context_size: getSupportedModelConfig(model).contextSize,
            prompt,
            schema: jsonSchema,
            objective,
          },
        ],
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
        }
      );
      if (res.isErr()) {
        return processToolError({
          conversation,
          errorMessage: "Error running extract data action",
          errorDetails: res.error.message,
        });
      }

      // Event stream loop
      let outputs: ProcessActionOutputsType | null = null;
      for await (const event of res.value.eventStream) {
        if (event.type === "error") {
          return processToolError({
            conversation,
            errorMessage: "Error running extract data action",
            errorDetails:
              event.content.message ?? "Unknown error from event stream.",
          });
        }

        if (event.type === "block_execution") {
          const e = event.content.execution[0][0];
          if (e.error) {
            return processToolError({
              conversation,
              errorMessage: "Error running extract data action",
              errorDetails:
                e.error ?? "An unknown error occurred during block execution.",
            });
          }

          if (event.content.block_name === "OUTPUT" && e.value) {
            outputs = e.value as ProcessActionOutputsType;
          }
        }
      }

      // Generate file and process tool output
      const { jsonFile, processToolOutput } = await generateProcessToolOutput({
        auth,
        conversation,
        outputs,
        jsonSchema,
        timeFrame,
        objective,
      });
      // Upload the file to the conversation data source.
      // This step is critical for file persistence across sessions.
      await uploadFileToConversationDataSource({
        auth,
        file: jsonFile,
      });

      return processToolOutput;
    }
  );

  return server;
}

export default createServer;

async function getConfigForProcessDustApp({
  auth,
  model,
  dataSources,
  timeFrame,
  tagsIn,
  tagsNot,
}: {
  auth: Authenticator;
  model: AgentModelConfigurationType;
  dataSources: DataSourcesToolConfigurationType[number][];
  timeFrame: TimeFrame | null;
  tagsIn?: string[];
  tagsNot?: string[];
}) {
  const { dataSourceConfigurations, dataSourceViewsMap } =
    await getDataSourcesDetails(auth, dataSources);

  const config = cloneBaseConfig(
    getDustProdAction("assistant-v2-process").config
  );

  // Set the process action model configuration to the agent model configuration.
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;
  config.MODEL.temperature = model.temperature;

  // Handle data sources list and parents/tags filtering.
  config.DATASOURCE.data_sources = dataSourceConfigurations.map((d) => ({
    workspace_id: d.workspaceId,
    // Note: This value is passed to the registry for lookup. The registry will return the
    // associated data source's dustAPIDataSourceId.
    data_source_id: d.dataSourceViewId,
  }));

  applyDataSourceFilters(
    config,
    dataSourceConfigurations,
    dataSourceViewsMap,
    tagsIn || null,
    tagsNot || null
  );

  if (timeFrame) {
    config.DATASOURCE.filter.timestamp = {
      gt: timeFrameFromNow(timeFrame),
    };
  }

  config.DATASOURCE.top_k = PROCESS_ACTION_TOP_K;

  return config;
}

async function getDataSourcesDetails(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType[number][]
) {
  assert(
    dataSources && dataSources.length > 0,
    "Extract data action must have at least one data source."
  );

  const dataSourceConfigurationResults = await concurrentExecutor(
    dataSources,
    async (dataSourceToolConfiguration) =>
      getDataSourceConfiguration(dataSourceToolConfiguration),
    { concurrency: 10 }
  );

  // All data sources must be valid.
  assert(
    !dataSourceConfigurationResults.some((res) => res.isErr()),
    "Invalid data source(s): " +
      removeNulls(
        dataSourceConfigurationResults.map((res) =>
          res.isErr() ? res.error : null
        )
      )
        .map((error) => ({
          type: "text",
          text: error.message,
        }))
        .join("\n")
  );

  const dataSourceConfigurations = removeNulls(
    dataSourceConfigurationResults.map((res) => (res.isOk() ? res.value : null))
  );

  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    _.uniq(dataSourceConfigurations.map((ds) => ds.dataSourceViewId))
  );
  const dataSourceViewsMap = Object.fromEntries(
    dataSourceViews.map((dsv) => [dsv.sId, dsv])
  );

  return {
    dataSourceConfigurations,
    dataSourceViewsMap,
  };
}

async function getPromptForProcessDustApp({
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

  return constructPromptMultiActions(auth, {
    userMessage,
    agentConfiguration,
    fallbackPrompt:
      "Process the retrieved data to extract structured information based on the provided schema.",
    model: getSupportedModelConfig(agentConfiguration.model),
    hasAvailableActions: false,
    agentsList: null,
  });
}

function processToolError({
  conversation,
  errorMessage,
  errorDetails,
}: {
  conversation: ConversationType;
  errorMessage: string;
  errorDetails: string;
}) {
  logger.error(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      error: errorDetails,
    },
    "Error running process"
  );
  return {
    content: [
      {
        type: "text" as const,
        created: Date.now(),
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        text: `${errorMessage}: ${errorDetails}`,
      },
    ],
    isError: true,
  };
}

async function generateProcessToolOutput({
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
    processToolOutput: {
      isError: false,
      content: [
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
            uri: jsonFile.getPublicUrl(auth),
            fileId: generatedFile.fileId,
            title: generatedFile.title,
            contentType: generatedFile.contentType,
            snippet: generatedFile.snippet,
          },
        },
      ],
    },
  };
}
