#!/usr/bin/env node
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI, normalizeError } from "@dust-tt/client";
import assert from "assert";
import fs from "fs";
import { z } from "zod";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listGeneratedFiles } from "@app/lib/api/assistant/conversation/files";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { APIError, Result } from "@app/types";
import {
  Err,
  isInteractiveContentFileContentType,
  Ok,
  safeParseJSON,
} from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

const systemPrompt = fs.readFileSync("./wrapped_system_prompt.txt", "utf8");

// Zod schema for workspace data validation
const WorkspaceDataSchema = z
  .object({
    WORKSPACE_SID: z.string(),
    COMPANY_NAME: z.string(),
  })
  .passthrough();

const WorkspaceDataArraySchema = z.array(WorkspaceDataSchema);

type WorkspaceData = z.infer<typeof WorkspaceDataSchema>;

interface ProcessResult {
  workspaceId: string;
  workspaceName: string;
  conversationId?: string;
  conversationUrl?: string;
  framePublicUrl?: string;
  frameWrappedToken?: string;
  status: "success" | "error" | "partial";
  error?: string;
  timestamp: string;
}

const RECAP_AGENT_NAME = "2025-recap-generator";
const RESULTS_FILE = "2025_recap_results.json";

/**
 * Creates the frame prompt with workspace data and custom instructions
 */
function createFramePromptForWorkspace(data: WorkspaceData): string {
  const workspaceInfo = `Let's create the 2025 Year in Review frame for the workspace:
  Company: ${data.COMPANY_NAME}
  Workspace ID: ${data.WORKSPACE_SID}

Here are the key metrics of their usage in 2025:
${JSON.stringify(data, null, 2)}`;

  return `${systemPrompt}

${workspaceInfo}`;
}

/**
 * Creates a conversation using the Dust API
 */
async function createWrappedConversation(
  auth: Authenticator,
  data: WorkspaceData,
  logger: Logger,
  { execute }: { execute: boolean }
): Promise<
  Result<{ conversationId: string; conversationUrl: string }, APIError | Error>
> {
  logger.info("Creating conversation for wrapped");

  const systemKey = await KeyResource.fetchSystemKeyForWorkspace(
    auth.getNonNullableWorkspace()
  );
  assert(systemKey, "System key should be available");

  const workspaceId = auth.getNonNullableWorkspace().sId;

  const prompt = createFramePromptForWorkspace(data);

  if (!execute) {
    logger.info("About to create conversation");
    return new Ok({
      conversationId: "dry-run-conversation-id",
      conversationUrl: "https://example.com/dry-run-conversation-url",
    });
  }

  try {
    const dustAPI = new DustAPI(
      config.getDustAPIConfig(),
      {
        apiKey: systemKey.secret,
        workspaceId,
      },
      logger
    );

    // Create conversation with blocking=true.
    const result = await dustAPI.createConversation({
      title: `${data.COMPANY_NAME} - 2025 Year in Review`,
      visibility: "unlisted",
      blocking: true, // Wait for completion.
      message: {
        content: prompt,
        context: {
          username: RECAP_AGENT_NAME,
          fullName: "2025 Recap Generator",
          email: "recap@dust.tt",
          timezone: "UTC",
          origin: "api",
        },
        mentions: [
          {
            configurationId: GLOBAL_AGENTS_SID.GEMINI_PRO,
          },
        ],
      },
    });

    if (result.isErr()) {
      logger.error(
        { error: result.error },
        "❌ API error creating conversation"
      );
      return result;
    }

    const conversationId = result.value.conversation.sId;
    const conversationUrl = `${config.getDustAPIConfig().url}/w/${workspaceId}/assistant/${conversationId}`;

    logger.info({ conversationId }, `✅ Created conversation`);
    return new Ok({ conversationId, conversationUrl });
  } catch (error) {
    logger.error({ error }, "❌ Error creating conversation");
    return new Err(normalizeError(error));
  }
}

async function handleCreatedFrame(
  auth: Authenticator,
  { conversationId }: { conversationId: string },
  logger: Logger
): Promise<{ frameWrappedToken: string; framePublicUrl: string } | null> {
  try {
    logger.info(`🔍 Looking for frames in conversation ${conversationId}`);

    // Get full conversation object.
    const conversationResult = await getConversation(auth, conversationId);
    if (conversationResult.isErr()) {
      logger.error(
        { error: conversationResult.error },
        `❌ Failed to fetch conversation details`
      );
      return null;
    }

    const conversation = conversationResult.value;

    // Use listGeneratedFiles function to find all generated files.
    const generatedFiles = listGeneratedFiles(conversation);

    // Look for frame files.
    const frameFiles = generatedFiles.filter((file) =>
      isInteractiveContentFileContentType(file.contentType)
    );

    if (frameFiles.length > 0) {
      const frameFile = frameFiles[0]; // Take the first frame found.
      const frameFileId = frameFile.fileId;

      const fileResource = await FileResource.fetchById(auth, frameFileId);
      if (!fileResource) {
        logger.error({ frameFileId }, "❌ Frame file resource not found");
        return null;
      }

      // We mark the frame as public so we can validate it works. We will switch it back to private later.
      await fileResource.setShareScope(auth, "public");

      const shareInfo = await fileResource.getShareInfo();
      assert(
        shareInfo,
        `Share info should be available for the frame file ${frameFileId}`
      );

      const frameWrappedToken = shareInfo.shareUrl.split("/").pop();
      assert(
        frameWrappedToken,
        "Frame wrapped token should be extractable from share URL"
      );

      logger.info(
        {
          frameWrappedToken,
          shareUrl: shareInfo?.shareUrl,
          title: frameFile.title,
        },
        "📄 Found frame"
      );
      return { frameWrappedToken, framePublicUrl: shareInfo?.shareUrl };
    }

    logger.warn({ conversationId }, "⚠️  No frame found in conversation");
    return null;
  } catch (error) {
    logger.error({ conversationId, error }, "❌ Error extracting frame info");
    return null;
  }
}

/**
 * Loads existing results from file
 */
function loadExistingResults(): ProcessResult[] {
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      const content = fs.readFileSync(RESULTS_FILE, "utf8");
      return JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️  Could not load existing results: ${error}`);
    }
  }
  return [];
}

/**
 * Saves results to file
 */
function saveResults(results: ProcessResult[]): void {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

async function processForWorkspace(
  data: WorkspaceData,
  logger: Logger,
  { execute }: { execute: boolean }
): Promise<ProcessResult | null> {
  const childLogger = logger.child({
    workspaceId: data.WORKSPACE_SID,
    workspaceName: data.COMPANY_NAME,
  });

  const result: ProcessResult = {
    workspaceId: data.WORKSPACE_SID,
    workspaceName: data.COMPANY_NAME,
    status: "error",
    timestamp: new Date().toISOString(),
  };

  const workspace = await WorkspaceResource.fetchById(data.WORKSPACE_SID);
  if (!workspace) {
    childLogger.error({}, `❌ Workspace not found in region`);
    result.error = "Workspace not found in region";
    return result;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  try {
    // Step 1: Create conversation.
    const conversationResult = await createWrappedConversation(
      auth,
      data,
      logger,
      { execute }
    );

    if (conversationResult.isErr()) {
      result.error = `Failed to create conversation: ${conversationResult.error.message}`;
      return result;
    }

    const { conversationId, conversationUrl } = conversationResult.value;

    result.conversationId = conversationId;
    result.conversationUrl = conversationUrl;

    // Step 2: Extract frame info.
    const frameInfo = await handleCreatedFrame(
      auth,
      { conversationId },
      childLogger
    );
    if (frameInfo) {
      result.frameWrappedToken = frameInfo.frameWrappedToken;
      result.framePublicUrl = frameInfo.framePublicUrl;
      result.status = "success";
    } else {
      result.status = "partial";
      result.error = "Frame not found or generated";
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

async function processWorkspacesFile(
  {
    filePath,
    execute,
  }: {
    filePath: string;
    execute: boolean;
  },
  logger: Logger
) {
  logger.info(`Reading frame metadata from: ${filePath}`);

  const fileContent = fs.readFileSync(filePath, "utf8");

  // Parse and validation the JSON file.
  const parsedJsonRes = safeParseJSON(fileContent);
  if (parsedJsonRes.isErr()) {
    logger.error("❌ Invalid JSON file:", parsedJsonRes.error);
    throw new Error(`Invalid JSON file: ${parsedJsonRes.error.message}`);
  }

  const workspaceDataArray = WorkspaceDataArraySchema.safeParse(
    parsedJsonRes.value
  );
  if (!workspaceDataArray.success) {
    logger.error(
      { errors: workspaceDataArray.error.format() },
      "❌ File validation errors:"
    );

    throw new Error(
      `File validation failed: ${workspaceDataArray.error.errors.length} errors found`
    );
  }

  logger.info(`Found ${workspaceDataArray.data.length} workspace entries`);
  logger.info(`✅ All entries passed validation`);

  // Load existing results for recovery.
  const existingResults = loadExistingResults();
  const processedWorkspaces = new Set(
    existingResults.map((r) => r.workspaceId)
  );

  // Filter out already processed workspaces.
  const workspacesToProcess = workspaceDataArray.data.filter(
    (data) => !processedWorkspaces.has(data.WORKSPACE_SID)
  );

  logger.info(
    {
      total: workspaceDataArray.data.length,
      alreadyProcessed: processedWorkspaces.size,
      toProcess: workspacesToProcess.length,
    },
    "📊 Processing status"
  );

  if (workspacesToProcess.length === 0) {
    logger.info("✅ All workspaces already processed");
    return;
  }

  // Generate frames concurrently with progress tracking.
  const allResults = [...existingResults];

  await concurrentExecutor(
    workspacesToProcess,
    async (data) => {
      const result = await processForWorkspace(data, logger, { execute });
      if (result) {
        allResults.push(result);
        saveResults(allResults);

        logger.info(
          {
            workspaceId: result.workspaceId,
            status: result.status,
            progress: `${allResults.length}/${workspaceDataArray.data.length}`,
          },
          "💾 Saved progress"
        );
      }
      return result;
    },
    { concurrency: 3 }
  );

  // Final summary.
  const successCount = allResults.filter((r) => r.status === "success").length;
  const partialCount = allResults.filter((r) => r.status === "partial").length;
  const errorCount = allResults.filter((r) => r.status === "error").length;

  logger.info(
    {
      total: allResults.length,
      success: successCount,
      partial: partialCount,
      errors: errorCount,
    },
    "📈 Final results summary"
  );
}

makeScript(
  {
    file: {
      type: "string",
      demandOption: true,
      describe: "Path to JSON file containing workspace data",
    },
  },
  async ({ file, execute }, logger) => {
    logger.info("🚀 Starting wrapped frame generation");
    logger.info(`📁 Input file: ${file}`);
    logger.info(`🔄 Execute mode: ${execute}`);

    if (!fs.existsSync(file)) {
      throw new Error(`File not found: ${file}`);
    }

    await processWorkspacesFile({ filePath: file, execute }, logger);

    logger.info("✅ Wrapped frame generation completed");
  }
);
