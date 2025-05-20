import { INTERNAL_MIME_TYPES, removeNulls } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import _ from "lodash";

import {
  generateJSONFileAndSnippet,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { PROCESS_ACTION_TOP_K } from "@app/lib/actions/constants";
import {
  ConfigurableToolInputSchemas,
  DataSourcesToolConfigurationType,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { ProcessActionOutputsType } from "@app/lib/actions/process";
import { getExtractFileTitle } from "@app/lib/actions/process/utils";
import { applyDataSourceFilters } from "@app/lib/actions/retrieval";
import { runActionStreamed } from "@app/lib/actions/server";
import type {
  ActionGeneratedFileType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgentModelConfigurationType,
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
    "Process documents according to timeframe and data sources to extract structured data.",
    {
      timeFrame:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
        ],
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      jsonSchema:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
        ],
    },
    async ({ timeFrame, dataSources, jsonSchema }) => {
      assert(
        agentLoopRunContext,
        "agentLoopContext is required where the tool is called."
      );

      const { agentConfiguration, conversation, actionConfiguration } =
        agentLoopRunContext;

      assert(
        isServerSideMCPToolConfiguration(actionConfiguration),
        "actionConfiguration must be a server side MCP tool configuration"
      );

      // grab user message
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

      const { model } = agentConfiguration;
      const supportedModel = getSupportedModelConfig(model);
      const contextSize = supportedModel.contextSize;

      const prompt = await constructPromptMultiActions(auth, {
        userMessage,
        agentConfiguration,
        fallbackPrompt:
          "Process the retrieved data to extract structured information based on the provided schema.",
        model: supportedModel,
        hasAvailableActions: false,
        agentsList: null,
      });

      const config = await getConfigForProcessDustApp({
        auth,
        model,
        dataSources,
        timeFrame,
      });

      const res = await runActionStreamed(
        auth,
        "assistant-v2-process",
        config,
        [
          {
            context_size: contextSize,
            prompt,
            schema: jsonSchema,
            objective: "n/a",
          },
        ],
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          userMessageId: userMessage.sId,
        }
      );

      if (res.isErr()) {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            error: res.error,
          },
          "Error running extract data action"
        );
        return {
          isError: true,
          content: [
            {
              type: "text",
              created: Date.now(),
              workspaceId: conversation.owner.sId,
              conversationId: conversation.sId,
              text: `Error running extract data action: ${res.error.message}`,
            },
          ],
        };
      }

      const { eventStream } = res.value;
      let outputs: ProcessActionOutputsType | null = null;

      for await (const event of eventStream) {
        if (event.type === "error") {
          logger.error(
            {
              workspaceId: conversation.owner.sId,
              conversationId: conversation.sId,
              error: event.content.message,
            },
            "Error running extract data action"
          );
          return {
            isError: true,
            content: [
              {
                type: "text",
                created: Date.now(),
                workspaceId: conversation.owner.sId,
                conversationId: conversation.sId,
                text: `Error running extract data action: ${event.content.message}`,
              },
            ],
          };
        }

        if (event.type === "block_execution") {
          const e = event.content.execution[0][0];
          if (e.error) {
            logger.error(
              {
                workspaceId: conversation.owner.sId,
                conversationId: conversation.sId,
                error: e.error,
              },
              "Error running process"
            );
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  created: Date.now(),
                  workspaceId: conversation.owner.sId,
                  conversationId: conversation.sId,
                  text: `Error running extract data action: ${e.error}`,
                },
              ],
            };
          }

          if (event.content.block_name === "OUTPUT" && e.value) {
            outputs = e.value as ProcessActionOutputsType;
          }
        }
      }

      // Generate the JSON file with extraction results
      const fileTitle = getExtractFileTitle({
        schema: actionConfiguration.jsonSchema,
      });
      const { jsonFile, jsonSnippet } = await generateJSONFileAndSnippet(auth, {
        title: fileTitle,
        conversationId: conversation.sId,
        data: outputs?.data,
      });

      // Upload the file to the conversation data source.
      // This step is critical for file persistence across sessions.
      await uploadFileToConversationDataSource({
        auth,
        file: jsonFile,
      });

      const generatedFile: ActionGeneratedFileType = {
        fileId: jsonFile.sId,
        title: fileTitle,
        contentType: jsonFile.contentType,
        snippet: jsonSnippet,
      };

      return {
        isError: false,
        content: [
          {
            type: "resource" as const,
            resource: {
              // "text" here is what will be presented to the model,
              // not necessarily the raw text of the file.
              text: "Generated JSON file with extraction results",
              uri: jsonFile.getPublicUrl(auth),
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              ...generatedFile,
            },
          },
        ],
      };
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
    await getDataSourcesConfigurationsAndViewsMap(auth, dataSources);

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

async function getDataSourcesConfigurationsAndViewsMap(
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
