import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";
import { z } from "zod";

import {
  generateCSVFileAndSnippet,
  generateJSONFileAndSnippet,
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY } from "@app/lib/actions/constants";
import type {
  LightServerSideMCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  makeInternalMCPServer,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type {
  AgentLoopContextType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import {
  isMCPConfigurationForDustAppRun,
  isMCPInternalDustAppRun,
} from "@app/lib/actions/types/guards";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import config from "@app/lib/api/config";
import { getDatasetSchema } from "@app/lib/api/datasets";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { AppResource } from "@app/lib/resources/app_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  BlockRunConfig,
  ConversationType,
  DatasetSchema,
  SpecificationBlockType,
  SupportedFileContentType,
} from "@app/types";
import {
  extensionsForContentType,
  getHeaderFromGroupIds,
  getHeaderFromRole,
  safeParseJSON,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

import { ConfigurableToolInputSchemas } from "../input_schemas";

const MIN_GENERATION_TOKENS = 2048;

interface DustFileOutput {
  __dust_file?: {
    type: string;
    content: unknown;
  };
  [key: string]: unknown;
}

function getDustAppRunResultsFileTitle({
  appName,
  resultsFileContentType,
}: {
  appName: string;
  resultsFileContentType: SupportedFileContentType;
}): string {
  const extensions = extensionsForContentType(resultsFileContentType);
  let title = `${appName}_output`;
  if (extensions.length > 0) {
    title += extensions[0];
  }
  return title;
}

function convertDatasetSchemaToZodRawShape(
  datasetSchema: DatasetSchema | null
): ZodRawShape {
  const shape: ZodRawShape = {};
  if (datasetSchema) {
    for (const entry of datasetSchema) {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const desc = entry.description || "";
      switch (entry.type) {
        case "string":
          shape[entry.key] = z.string().describe(desc);
          break;
        case "number":
          shape[entry.key] = z.number().describe(desc);
          break;
        case "boolean":
          shape[entry.key] = z.boolean().describe(desc);
          break;
        case "json":
          shape[entry.key] = z.any().describe(desc);
          break;
        default:
          throw new Error(`Unsupported dataset type: ${entry.type}`);
      }
    }
  }
  return shape;
}

async function prepareAppContext(
  auth: Authenticator,
  actionConfig:
    | ServerSideMCPServerConfigurationType
    | LightServerSideMCPToolConfigurationType
): Promise<{
  app: AppResource;
  schema: DatasetSchema | null;
  appConfig: BlockRunConfig;
}> {
  if (!actionConfig.dustAppConfiguration?.appId) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        userId: auth.user()?.sId || "no_user",
        role: auth.role(),
        groupIds: auth.groups().map((g) => g.sId),
        actionConfig,
        dustAppConfiguration: actionConfig.dustAppConfiguration,
        appId: actionConfig.dustAppConfiguration?.appId,
      },
      "[run_dust_app] Missing Dust app ID"
    );
    throw new Error("Missing Dust app ID");
  }

  const app = await AppResource.fetchById(
    auth,
    actionConfig.dustAppConfiguration.appId
  );
  if (!app) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        userId: auth.user()?.sId || "no_user",
        role: auth.role(),
        groupIds: auth.groups().map((g) => g.sId),
        appId: actionConfig.dustAppConfiguration.appId,
        actionConfig,
      },
      "[run_dust_app] Could not find Dust app"
    );
    throw new Error("Could not find Dust app");
  }

  const parsedSpec = app.parseSavedSpecification();
  const appConfig = extractConfig(parsedSpec);

  const inputSpec = parsedSpec.find(
    (b: SpecificationBlockType) => b.type === "input"
  );
  const inputConfig = inputSpec ? appConfig[inputSpec.name] : null;
  const datasetName = inputConfig?.dataset;

  if (!datasetName) {
    return { app, schema: null, appConfig };
  }

  const schema = await getDatasetSchema(auth, app, datasetName);
  if (!schema) {
    throw new Error("Missing dataset schema name");
  }

  return { app, schema, appConfig };
}

async function processDustFileOutput(
  auth: Authenticator,
  sanitizedOutput: DustFileOutput,
  conversation: ConversationType,
  appName: string
): Promise<{ type: "resource"; resource: ToolGeneratedFileType }[]> {
  const content: { type: "resource"; resource: ToolGeneratedFileType }[] = [];

  const containsValidStructuredOutput = (
    output: DustFileOutput
  ): output is {
    __dust_file?: {
      type: "structured";
      content: Array<
        Record<string, string | number | null | boolean | undefined>
      >;
    };
  } =>
    output.__dust_file?.type === "structured" &&
    Array.isArray(output.__dust_file.content) &&
    output.__dust_file.content.length > 0 &&
    output.__dust_file.content.every(
      (r) =>
        typeof r === "object" &&
        Object.values(r).every(
          (v) =>
            !v ||
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
        )
    );

  const containsValidDocumentOutput = (
    output: DustFileOutput
  ): output is {
    __dust_file?: { type: "document"; content: string };
  } =>
    output.__dust_file?.type === "document" &&
    typeof output.__dust_file.content === "string";

  if (containsValidStructuredOutput(sanitizedOutput)) {
    const fileTitle = getDustAppRunResultsFileTitle({
      appName,
      resultsFileContentType: "text/csv",
    });

    const { csvFile } = await generateCSVFileAndSnippet(auth, {
      title: fileTitle,
      conversationId: conversation.sId,
      results: sanitizedOutput.__dust_file?.content ?? [],
    });

    await uploadFileToConversationDataSource({
      auth,
      file: csvFile,
    });

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
    let fileTitle = "";
    let file: FileResource | null = null;

    const jsonOutputRes = safeParseJSON(
      sanitizedOutput.__dust_file?.content ?? ""
    );
    if (jsonOutputRes.isOk()) {
      // If the output is a valid json object, generate a json file.
      fileTitle = getDustAppRunResultsFileTitle({
        appName,
        resultsFileContentType: "application/json",
      });
      const { jsonFile } = await generateJSONFileAndSnippet(auth, {
        title: fileTitle,
        conversationId: conversation.sId,
        data: jsonOutputRes.value,
      });
      file = jsonFile;
    } else {
      // If the output is not a valid json object, generate a text file.
      const fileTitle = getDustAppRunResultsFileTitle({
        appName,
        resultsFileContentType: "text/plain",
      });

      file = await generatePlainTextFile(auth, {
        title: fileTitle,
        conversationId: conversation.sId,
        content: sanitizedOutput.__dust_file?.content ?? "",
      });
    }

    content.push({
      type: "resource",
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
        uri: `file://${file.id}`,
        fileId: file.sId,
        title: fileTitle,
        contentType: file.contentType,
        snippet: file.snippet,
        text: `Generated text file: ${fileTitle}`,
      },
    });

    delete sanitizedOutput.__dust_file;
  }

  return content;
}

async function prepareParamsWithHistory(
  params: { [p: string]: any },
  schema: DatasetSchema | null,
  agentLoopRunContext: AgentLoopRunContextType,
  auth: Authenticator
) {
  if (
    schema?.some((s) => s.key === DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY)
  ) {
    const model = SUPPORTED_MODEL_CONFIGS.find(
      (m) =>
        m.modelId === agentLoopRunContext.agentConfiguration.model.modelId &&
        m.providerId === agentLoopRunContext.agentConfiguration.model.providerId
    );

    if (model) {
      const allowedTokenCount = model.contextSize - MIN_GENERATION_TOKENS;

      const convoRes = await renderConversationForModel(auth, {
        conversation: agentLoopRunContext.conversation,
        model,
        prompt: "",
        tools: "",
        allowedTokenCount,
        excludeImages: true,
        onMissingAction: "skip",
      });

      if (convoRes.isOk()) {
        const messages = convoRes.value.modelConversation.messages;
        params[DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY] =
          JSON.stringify(messages);
      }
    }
  }
  return params;
}

export default async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("run_dust_app");
  const owner = auth.getNonNullableWorkspace();

  if (agentLoopContext && agentLoopContext.listToolsContext) {
    if (
      !isMCPConfigurationForDustAppRun(
        agentLoopContext.listToolsContext.agentActionConfiguration
      )
    ) {
      throw new Error("Invalid Dust app run agent configuration");
    }

    const { app, schema } = await prepareAppContext(
      auth,
      agentLoopContext.listToolsContext.agentActionConfiguration
    );

    if (!app.description) {
      throw new Error("Missing app description");
    }

    server.tool(
      app.name,
      app.description,
      convertDatasetSchemaToZodRawShape(schema),
      async () => {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: "Successfully list Dust App configuration",
            },
          ],
        };
      }
    );
  } else if (agentLoopContext && agentLoopContext.runContext) {
    if (
      !isMCPInternalDustAppRun(agentLoopContext.runContext.toolConfiguration)
    ) {
      throw new Error("Invalid Dust app run tool configuration");
    }

    const { app, schema, appConfig } = await prepareAppContext(
      auth,
      agentLoopContext.runContext.toolConfiguration
    );

    if (!app.description) {
      throw new Error("Missing app description");
    }

    server.tool(
      app.name,
      app.description,
      convertDatasetSchemaToZodRawShape(schema),
      async (params) => {
        const content: (
          | TextContent
          | { type: "resource"; resource: ToolGeneratedFileType }
        )[] = [];

        params = await prepareParamsWithHistory(
          params,
          schema,
          agentLoopContext.runContext,
          auth
        );

        const requestedGroupIds = auth.groups().map((g) => g.sId);

        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const apiConfig = config.getDustAPIConfig();
        const api = new DustAPI(
          apiConfig,
          {
            ...prodCredentials,
            extraHeaders: {
              ...getHeaderFromGroupIds(requestedGroupIds),
              ...getHeaderFromRole(auth.role()), // Keep the user's role for api.runApp call only
            },
          },
          logger,
          apiConfig.nodeEnv === "development" ? "http://localhost:3000" : null
        );

        const runRes = await api.runAppStreamed(
          {
            workspaceId: owner.sId,
            appId: app.sId,
            appSpaceId: app.space.sId,
            appHash: "latest",
          },
          appConfig,
          [params],
          { useWorkspaceCredentials: true }
        );

        if (runRes.isErr()) {
          return makeMCPToolTextError(
            `Error running Dust app: ${runRes.error.message}`
          );
        }

        const { eventStream } = runRes.value;
        let lastBlockOutput = null;

        for await (const event of eventStream) {
          if (event.type === "error") {
            return makeMCPToolTextError(
              `Error running Dust app: ${event.content.message}`
            );
          }

          if (event.type === "block_execution") {
            const e = event.content.execution[0][0];
            if (e.error) {
              return makeMCPToolTextError(
                `Error in block execution: ${e.error}`
              );
            }
            lastBlockOutput = e.value;
          }
        }

        const sanitizedOutput = sanitizeJSONOutput(lastBlockOutput);

        const containsFileOutput = (
          output: unknown
        ): output is DustFileOutput =>
          typeof output === "object" &&
          output !== null &&
          "__dust_file" in output &&
          typeof output.__dust_file === "object" &&
          output.__dust_file !== null &&
          "type" in output.__dust_file &&
          "content" in output.__dust_file;

        if (
          containsFileOutput(sanitizedOutput) &&
          agentLoopContext.runContext?.conversation
        ) {
          const fileContent = await processDustFileOutput(
            auth,
            sanitizedOutput,
            agentLoopContext.runContext.conversation,
            app.name
          );
          content.push(...fileContent);
        }

        content.push({
          type: "text",
          text: JSON.stringify(sanitizedOutput, null, 2),
        });

        return {
          isError: false,
          content,
        };
      }
    );
  } else {
    server.tool(
      "run_dust_app",
      "Run a Dust App with specified parameters.",
      {
        dustApp:
          ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP].default(
            {
              appId: "my_app_id",
              mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
            }
          ),
      },
      async () => {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: "Successfully saved Dust App configuration",
            },
          ],
        };
      }
    );
  }

  return server;
}
