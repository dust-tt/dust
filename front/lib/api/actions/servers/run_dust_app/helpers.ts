// eslint-disable-next-line dust/enforce-client-types-in-public-api

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
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { getDatasetSchema } from "@app/lib/api/datasets";
import type { Authenticator } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AppResource } from "@app/lib/resources/app_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { BlockRunConfig, SpecificationBlockType } from "@app/types/app";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DatasetSchema } from "@app/types/dataset";
import type { SupportedFileContentType } from "@app/types/files";
import { extensionsForContentType } from "@app/types/files";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { ZodRawShape } from "zod";
import { z } from "zod";

const MIN_GENERATION_TOKENS = 2048;

export interface DustFileOutput {
  __dust_file?: {
    type: string;
    content: unknown;
  };
  [key: string]: unknown;
}

export function getDustAppRunResultsFileTitle({
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

export function convertDatasetSchemaToZodRawShape(
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

export async function prepareAppContext(
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
        groupIds: auth.groupIds(),
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
        groupIds: auth.groupIds(),
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

export async function processDustFileOutput(
  auth: Authenticator,
  sanitizedOutput: DustFileOutput,
  conversation: ConversationWithoutContentType,
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
    let file: FileResource;

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
      fileTitle = getDustAppRunResultsFileTitle({
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

export async function prepareParamsWithHistory(
  params: { [p: string]: unknown },
  schema: DatasetSchema | null,
  agentLoopRunContext: AgentLoopRunContextType,
  auth: Authenticator
): Promise<{ [p: string]: unknown }> {
  if (
    schema?.some((s) => s.key === DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY)
  ) {
    const model = getSupportedModelConfig(
      agentLoopRunContext.agentConfiguration.model
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

export function containsFileOutput(output: unknown): output is DustFileOutput {
  return (
    typeof output === "object" &&
    output !== null &&
    "__dust_file" in output &&
    typeof output.__dust_file === "object" &&
    output.__dust_file !== null &&
    "type" in output.__dust_file &&
    "content" in output.__dust_file
  );
}
