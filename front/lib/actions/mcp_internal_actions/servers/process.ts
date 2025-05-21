import { INTERNAL_MIME_TYPES, removeNulls } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import _ from "lodash";

import {
  generateJSONFileAndSnippet,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { PROCESS_ACTION_TOP_K } from "@app/lib/actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { ProcessActionOutputsType } from "@app/lib/actions/process";
import { getExtractFileTitle } from "@app/lib/actions/process/utils";
import { applyDataSourceFilters } from "@app/lib/actions/retrieval";
import { runActionStreamed } from "@app/lib/actions/server";
import type {
  ActionGeneratedFileType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
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
  description: "Structured extraction (mcp)",
  icon: "ActionTimeIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopRunContext?: AgentLoopRunContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "process_documents",
    "Process available documents according to timeframe to extract structured data.",
    {
      timeFrame:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
        ],
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      jsonSchemaContainer:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
        ],
    },
    async ({ timeFrame, dataSources, jsonSchemaContainer }) => {
      // Unwrap variables
      assert(
        agentLoopRunContext,
        "agentLoopContext is required where the tool is called."
      );
      const { agentConfiguration, conversation } = agentLoopRunContext;
      const { jsonSchema } = jsonSchemaContainer;
      const { model } = agentConfiguration;

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
            objective: "n/a",
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
}: {
  auth: Authenticator;
  model: AgentModelConfigurationType;
  dataSources: DataSourcesToolConfigurationType[number][];
  timeFrame: TimeFrame | null;
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
    null, // TODO(pr,mcp-extract): add globalTagsIn
    null // TODO(pr,mcp-extract): add globalTagsNot
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
}: {
  auth: Authenticator;
  conversation: ConversationType;
  outputs: ProcessActionOutputsType | null;
  jsonSchema: JSONSchema;
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

  return {
    jsonFile,
    processToolOutput: {
      isError: false,
      content: [
        {
          type: "resource" as const,
          resource: {
            // Field "text" here is what will be presented to the model,
            // not necessarily the raw text of the file.
            text: "Generated JSON file with extraction results",
            uri: jsonFile.getPublicUrl(auth),
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
            ...generatedFile,
          },
        },
      ],
    },
  };
}
