import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  generateJSONFileAndSnippet,
  getJSONFileAttachment,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { PROCESS_ACTION_TOP_K } from "@app/lib/actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { fetchAgentDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { getExtractFileTitle } from "@app/lib/actions/process/utils";
import type { DataSourceConfiguration } from "@app/lib/actions/retrieval";
import { applyDataSourceFilters } from "@app/lib/actions/retrieval";
import { runActionStreamed } from "@app/lib/actions/server";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { parseTimeFrame } from "@app/types";
import { timeFrameFromNow } from "@app/types";

// Define the expected output structure from the process action (match exactly with process.ts)
interface ProcessOutputs {
  data: any[];
  total_documents: number;
  total_chunks: number;
  total_tokens: number;
  min_timestamp: number;
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "extract",
  version: "1.0.0",
  description: "Structured extraction (mcp)",
  icon: "ActionScanIcon",
  authorization: null,
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "extract",
    "Extract structured data from text according to a schema.",
    {
      // TODO: Sort out a way to make the objective an input fillable by the user
      // instead of the model.
      // The goal is to be as close as what process did.
      objective: z
        .string()
        .describe(
          "The objective behind the extraction based on the conversation state."
        ),
      tagsIn: z
        .array(z.string())
        .optional()
        .describe("Tags to include in the data source filtering."),
      tagsNot: z
        .array(z.string())
        .optional()
        .describe("Tags to exclude from the data source filtering."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      relativeTimeFrame:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME],
      // TODO: Add a custom schema for the JSON schema input, so that it can be filled by the user
      // instead of the model.
      schema: z
        .string()
        .optional()
        .describe(
          "A JSON schema that defines the structure of data to extract."
        ),
    },
    async ({
      objective,
      schema,
      relativeTimeFrame,
      tagsIn,
      tagsNot,
      dataSources,
    }) => {
      const owner = auth.workspace();
      if (!owner) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Unauthenticated call to extract tool",
            },
          ],
          isError: true,
        };
      }

      if (!agentLoopContext) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No context found.",
            },
          ],
          isError: true,
        };
      }

      const messageObj = agentLoopContext.conversation.content.findLast(
        (msg) => msg[0].type === "user_message"
      );

      if (!messageObj) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No user message found in the conversation.",
            },
          ],
          isError: true,
        };
      }

      const message = messageObj[0];
      if (message.type !== "user_message") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Extract tool Error. The retrieved message is not a user message.",
            },
          ],
          isError: true,
        };
      }

      // COMPUTE ARGUMENTS
      let jsonSchema = null;
      if (schema) {
        try {
          jsonSchema = JSON.parse(schema);
        } catch (e) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error parsing schema: ${(e as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      }

      let timeFrame = null;
      if (relativeTimeFrame) {
        timeFrame = parseTimeFrame(
          relativeTimeFrame.duration + relativeTimeFrame.unit
        );
      } else {
        timeFrame = parseTimeFrame("all");
      }

      const objectiveText = typeof objective === "string" ? objective : "n/a";

      // CONSTRUCT PROMPT
      const prompt = await constructPromptMultiActions(auth, {
        userMessage: message,
        agentConfiguration: agentLoopContext.agentConfiguration,
        fallbackPrompt:
          "Process the retrieved data to extract structured information based on the provided schema.",
        model: getSupportedModelConfig(
          agentLoopContext.agentConfiguration.model
        ),
        hasAvailableActions: false,
      });

      // RETRIEVE DATA SOURCE
      try {
        const dataSourceConfigResults = await concurrentExecutor(
          dataSources,
          async (dataSource) => fetchAgentDataSourceConfiguration(dataSource),
          { concurrency: 10 }
        );

        const errors = dataSourceConfigResults
          .filter((result) => result.isErr())
          .map((result) =>
            result.isErr() ? result.error.message : "Unknown error"
          );

        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching data sources: ${errors.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const dataSourceConfigs = dataSourceConfigResults
          .filter((result) => result.isOk())
          .map((result) => (result.isOk() ? result.value : null))
          .filter(
            (config): config is NonNullable<typeof config> => config !== null
          );

        const dataSourceViewIds = dataSourceConfigs.map(
          (config) => config.dataSourceViewId
        );
        const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
          auth,
          dataSourceViewIds
        );
        const dataSourceViewsMap = Object.fromEntries(
          dataSourceViews.map((dsv) => [dsv.sId, dsv])
        );

        const processDataSourceConfigs: DataSourceConfiguration[] =
          dataSourceConfigs.map((config) => ({
            workspaceId: owner.sId,
            dataSourceViewId: DataSourceViewResource.modelIdToSId({
              id: config.dataSourceViewId,
              workspaceId: config.workspaceId,
            }),
            filter: {
              parents: null,
              tags:
                tagsIn || tagsNot
                  ? {
                      in: tagsIn || [],
                      not: tagsNot || [],
                      mode: "auto" as const,
                    }
                  : null,
            },
          }));

        // CONFIGURE ACTION
        const config = cloneBaseConfig(
          getDustProdAction("assistant-v2-process").config
        );

        config.MODEL.provider_id =
          agentLoopContext?.agentConfiguration.model.providerId;
        config.MODEL.model_id =
          agentLoopContext?.agentConfiguration.model.modelId;
        config.MODEL.temperature =
          agentLoopContext?.agentConfiguration.model.temperature;

        config.DATASOURCE.data_sources = processDataSourceConfigs.map(
          (dsConfig) => ({
            workspace_id: owner.sId,
            data_source_id: dsConfig.dataSourceViewId,
          })
        );

        applyDataSourceFilters(
          config,
          processDataSourceConfigs,
          dataSourceViewsMap,
          tagsIn || null,
          tagsNot || null
        );

        if (timeFrame) {
          config.DATASOURCE.filter = config.DATASOURCE.filter || {};
          config.DATASOURCE.filter.timestamp = {
            gt: timeFrameFromNow(timeFrame),
          };
        }

        config.DATASOURCE.top_k = PROCESS_ACTION_TOP_K;

        let contextSize = 16000; // Default fallback
        if (agentLoopContext?.agentConfiguration?.model) {
          const supportedModel = getSupportedModelConfig(
            agentLoopContext.agentConfiguration.model
          );
          contextSize = supportedModel.contextSize;
        }

        // RUN ACTION
        const res = await runActionStreamed(
          auth,
          "assistant-v2-process",
          config,
          [
            {
              context_size: contextSize,
              prompt,
              schema: jsonSchema,
              objective: objectiveText,
            },
          ],
          {
            workspaceId: owner.sId,
            conversationId: agentLoopContext.conversation.sId,
            userMessageId: message.sId,
          }
        );

        if (res.isErr()) {
          logger.error(
            {
              workspaceId: owner.id,
              error: res.error,
            },
            "Error running extract"
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Error running extract: ${res.error.message}`,
              },
            ],
            isError: true,
          };
        }

        const { eventStream } = res.value;
        let outputs: ProcessOutputs | null = null;

        for await (const event of eventStream) {
          if (event.type === "error") {
            logger.error(
              {
                workspaceId: owner.id,
                error: event.content.message,
              },
              "Error running extract"
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error running extract: ${event.content.message}`,
                },
              ],
              isError: true,
            };
          }

          if (event.type === "block_execution") {
            const e = event.content.execution[0][0];
            if (e.error) {
              logger.error(
                {
                  workspaceId: owner.id,
                  error: e.error,
                },
                "Error running extract"
              );
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Error running extract: ${e.error}`,
                  },
                ],
                isError: true,
              };
            }

            if (event.content.block_name === "OUTPUT" && e.value) {
              const rawOutputs = e.value as ProcessOutputs;

              outputs = {
                data: Array.isArray(rawOutputs.data) ? rawOutputs.data : [],
                total_documents:
                  typeof rawOutputs.total_documents === "number"
                    ? rawOutputs.total_documents
                    : 0,
                total_chunks:
                  typeof rawOutputs.total_chunks === "number"
                    ? rawOutputs.total_chunks
                    : 0,
                total_tokens:
                  typeof rawOutputs.total_tokens === "number"
                    ? rawOutputs.total_tokens
                    : 0,
                min_timestamp:
                  typeof rawOutputs.min_timestamp === "number"
                    ? rawOutputs.min_timestamp
                    : Date.now(),
              };
            }
          }
        }

        let jsonFile = null;
        let jsonSnippet = null;

        if (
          outputs &&
          outputs.data.length > 0 &&
          agentLoopContext?.conversation?.sId
        ) {
          try {
            const fileTitle = getExtractFileTitle({
              schema: jsonSchema,
            });

            const result = await generateJSONFileAndSnippet(auth, {
              title: fileTitle,
              conversationId: agentLoopContext.conversation.sId,
              data: outputs.data,
            });

            jsonFile = result.jsonFile;
            jsonSnippet = result.jsonSnippet;

            if (jsonFile) {
              await uploadFileToConversationDataSource({
                auth,
                file: jsonFile,
              });
            }
          } catch (error) {
            logger.error(
              {
                workspaceId: owner.id,
                error,
              },
              "Error generating or uploading JSON file"
            );
          }
        }

        const content = [];

        content.push({
          type: "text" as const,
          text: `Extracted ${outputs?.data.length || 0} data points from ${outputs?.total_documents || 0} documents.`,
        });

        if (outputs && outputs.data.length > 0) {
          content.push({
            type: "text" as const,
            text: "Extracted data:",
          });

          content.push({
            type: "text" as const,
            text: JSON.stringify(outputs.data, null, 2),
          });

          if (jsonFile && jsonSnippet) {
            const jsonAttachment = getJSONFileAttachment({
              jsonFileId: jsonFile.sId,
              jsonFileSnippet: jsonSnippet,
              title: getExtractFileTitle({
                schema: jsonSchema,
              }),
            });

            if (jsonAttachment) {
              content.push({
                type: "text" as const,
                text: jsonAttachment,
              });
            }
          }
        } else {
          content.push({
            type: "text" as const,
            text: "No data was extracted that matches the schema.",
          });
        }

        return {
          content,
          isError: false,
        };
      } catch (error) {
        logger.error(
          {
            workspaceId: owner.id,
            error,
          },
          "Error in extract tool"
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Error extracting data: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
  return server;
};

export default createServer;
