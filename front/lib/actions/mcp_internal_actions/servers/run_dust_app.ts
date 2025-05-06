import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDustAppRunResultsFileTitle } from "@app/components/actions/dust_app_run/utils";
import {
  generateCSVFileAndSnippet,
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY } from "@app/lib/actions/constants";
import type { MCPToolResultContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import config from "@app/lib/api/config";
import { getDatasetSchema } from "@app/lib/api/datasets";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { AppResource } from "@app/lib/resources/app_resource";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { getHeaderFromGroupIds, SUPPORTED_MODEL_CONFIGS } from "@app/types";

import { ConfigurableToolInputSchemas } from "../input_schemas";

interface DustAppBlock {
  type: string;
  name: string;
}

interface DustAppConfig {
  [key: string]: {
    dataset?: string;
    [key: string]: unknown;
  };
}

interface DustFileOutput {
  __dust_file?: {
    type: string;
    content: unknown;
  };
  [key: string]: unknown;
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "run_dust_app",
  version: "1.0.0",
  description: "Run Dust Apps with specified parameters.",
  icon: "CommandLineIcon",
  authorization: null,
};

export default function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);
  const owner = auth.getNonNullableWorkspace();

  server.tool(
    "run_dust_app",
    "Run a Dust App with specified parameters.",
    {
      dustApp:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP],
      params: z
        .record(z.union([z.string(), z.number(), z.boolean()]))
        .describe("Parameters to pass to the Dust App."),
    },
    async ({ dustApp, params }) => {
      const content: MCPToolResultContentType[] = [];
      try {
        // 1. Fetch and validate the app
        const { appWorkspaceId, appId } = dustApp;
        const app = await AppResource.fetchById(auth, appId);
        if (!app) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Failed to retrieve Dust app ${appWorkspaceId}/${appId}`,
              },
            ],
          };
        }

        // 2. Handle conversation history injection if needed
        if (
          agentLoopContext?.conversation &&
          agentLoopContext?.agentConfiguration
        ) {
          const appSpec = JSON.parse(
            app.savedSpecification || "[]"
          ) as DustAppBlock[];
          const appConfig = extractConfig(
            JSON.parse(app.savedSpecification || "{}")
          ) as DustAppConfig;

          const inputSpec = appSpec.find(
            (b: DustAppBlock) => b.type === "input"
          );
          const inputConfig = inputSpec ? appConfig[inputSpec.name] : null;
          const datasetName = inputConfig?.dataset;

          if (datasetName) {
            const schema = await getDatasetSchema(auth, app, datasetName);
            if (
              schema?.some(
                (s) => s.key === DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY
              )
            ) {
              const model = SUPPORTED_MODEL_CONFIGS.find(
                (m) =>
                  m.modelId ===
                    agentLoopContext.agentConfiguration.model.modelId &&
                  m.providerId ===
                    agentLoopContext.agentConfiguration.model.providerId
              );

              if (model) {
                const MIN_GENERATION_TOKENS = 2048;
                const allowedTokenCount =
                  model.contextSize - MIN_GENERATION_TOKENS;

                const convoRes = await renderConversationForModel(auth, {
                  conversation: agentLoopContext.conversation,
                  model,
                  prompt: "",
                  allowedTokenCount,
                  excludeImages: true,
                });

                if (convoRes.isOk()) {
                  const renderedConvo = convoRes.value;
                  const messages = renderedConvo.modelConversation.messages;
                  params[DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY] =
                    JSON.stringify(messages);
                }
              }
            }
          }
        }

        // 3. Set up API and run the app
        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const requestedGroupIds = auth.groups().map((g) => g.sId);
        const api = new DustAPI(
          config.getDustAPIConfig(),
          {
            ...prodCredentials,
            extraHeaders: getHeaderFromGroupIds(requestedGroupIds),
          },
          logger
        );

        const appConfig = extractConfig(
          JSON.parse(app.savedSpecification || "{}")
        );
        const runRes = await api.runAppStreamed(
          {
            workspaceId: appWorkspaceId,
            appId: appId,
            appSpaceId: app.space.sId,
            appHash: "latest",
          },
          appConfig,
          [params],
          { useWorkspaceCredentials: true }
        );

        if (runRes.isErr()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error running Dust app: ${runRes.error.message}`,
              },
            ],
          };
        }

        // 4. Process the event stream
        const { eventStream } = runRes.value;
        let lastBlockOutput = null;

        for await (const event of eventStream) {
          if (event.type === "error") {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Error running Dust app: ${event.content.message}`,
                },
              ],
            };
          }

          // Optional: add block status updates to content
          if (event.type === "block_status") {
            content.push({
              type: "text",
              text: `Running block: ${event.content.name} (${event.content.status})`,
            });
          }

          if (event.type === "block_execution") {
            const e = event.content.execution[0][0];
            if (e.error) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Error in block execution: ${e.error}`,
                  },
                ],
              };
            }
            lastBlockOutput = e.value;
          }
        }

        // 5. Process file output if present
        const sanitizedOutput = sanitizeJSONOutput(
          lastBlockOutput
        ) as DustFileOutput;

        const containsFileOutput = (output: DustFileOutput): boolean =>
          typeof output === "object" &&
          output !== null &&
          "__dust_file" in output &&
          typeof output.__dust_file === "object" &&
          output.__dust_file !== null &&
          "type" in output.__dust_file &&
          "content" in output.__dust_file;

        const containsValidStructuredOutput = (
          output: DustFileOutput
        ): boolean =>
          output.__dust_file?.type === "structured" &&
          Array.isArray(output.__dust_file.content) &&
          output.__dust_file.content.length > 0 &&
          output.__dust_file.content.every(
            (r: Record<string, unknown>) =>
              typeof r === "object" &&
              Object.values(r).every(
                (v) =>
                  !v ||
                  typeof v === "string" ||
                  typeof v === "number" ||
                  typeof v === "boolean"
              )
          );

        const containsValidDocumentOutput = (output: DustFileOutput): boolean =>
          output.__dust_file?.type === "document" &&
          typeof output.__dust_file.content === "string";

        if (
          containsFileOutput(sanitizedOutput) &&
          agentLoopContext?.conversation
        ) {
          if (containsValidStructuredOutput(sanitizedOutput)) {
            // Generate CSV file
            const fileTitle = getDustAppRunResultsFileTitle({
              appName: app.name,
              resultsFileContentType: "text/csv",
            });

            const { csvFile } = await generateCSVFileAndSnippet(auth, {
              title: fileTitle,
              conversationId: agentLoopContext.conversation.sId,
              results: sanitizedOutput.__dust_file?.content as Array<
                Record<string, string | number | boolean | null>
              >,
            });

            await uploadFileToConversationDataSource({
              auth,
              file: csvFile,
            });

            // Add file resource to output
            content.push({
              type: "resource",
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
                uri: `file://${csvFile.id}`,
                fileId: csvFile.sId,
                title: fileTitle,
                contentType: csvFile.contentType,
                snippet: csvFile.snippet,
                text: `Generated CSV file: ${fileTitle}`,
              },
            });

            delete sanitizedOutput.__dust_file;
          } else if (containsValidDocumentOutput(sanitizedOutput)) {
            // Generate plain text file
            const fileTitle = getDustAppRunResultsFileTitle({
              appName: app.name,
              resultsFileContentType: "text/plain",
            });

            const plainTextFile = await generatePlainTextFile(auth, {
              title: fileTitle,
              conversationId: agentLoopContext.conversation.sId,
              content: sanitizedOutput.__dust_file?.content as string,
            });

            await uploadFileToConversationDataSource({
              auth,
              file: plainTextFile,
            });

            // Add file resource to output
            content.push({
              type: "resource",
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
                uri: `file://${plainTextFile.id}`,
                fileId: plainTextFile.sId,
                title: fileTitle,
                contentType: plainTextFile.contentType,
                snippet: plainTextFile.snippet,
                text: `Generated text file: ${fileTitle}`,
              },
            });

            delete sanitizedOutput.__dust_file;
          }
        }

        // 6. Add the main output as the final content item
        content.push({
          type: "text",
          text: JSON.stringify(sanitizedOutput, null, 2),
        });

        return {
          isError: false,
          content,
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error running Dust app: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  return server;
}
