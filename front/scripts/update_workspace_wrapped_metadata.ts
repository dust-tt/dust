import assert from "assert";
import fs from "fs";
import { z } from "zod";

import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const FrameMetadataSchema = z.object({
  frameWrappedToken: z.string(),
  workspaceId: z.string(),
});

const FrameMetadataArraySchema = z.array(FrameMetadataSchema);

type FrameMetadata = z.infer<typeof FrameMetadataSchema>;

async function updateFrameMetadata(
  frameData: FrameMetadata,
  logger: Logger,
  execute: boolean
): Promise<void> {
  const { frameWrappedToken, workspaceId } = frameData;

  logger.info(`Processing workspace: ${workspaceId}`);

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error(`Workspace not found: ${workspaceId} in region`);
    return;
  }

  // Find first internal admin for the workspace.
  // We need a user to change the shared scope of the frame later.
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: renderLightWorkspaceType({ workspace }),
    roles: ["admin"],
  });

  const [firstAdmin] = memberships;

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    firstAdmin.user!.sId,
    workspace.sId
  );

  const result =
    await FileResource.fetchByShareTokenWithContent(frameWrappedToken);
  if (!result) {
    logger.error(`Frame file not found for token: ${frameWrappedToken}`);
    return;
  }

  const { file, shareScope } = result;

  // If the frame is public, update the scope to workspace.
  if (shareScope === "public") {
    if (execute) {
      await file.setShareScope(auth, "workspace");
    }

    logger.info(
      `Updated share scope to workspace for file: ${file.id} in workspace: ${workspaceId}`
    );
  }

  const shareInfo = await file.getShareInfo();
  assert(
    shareInfo,
    "Share info should be available after fetching by share token"
  );

  const { shareUrl: frameWrappedUrl } = shareInfo;

  if (execute) {
    const newMetadata = {
      ...workspace.metadata,
      wrappedUrl: frameWrappedUrl,
    };
    await WorkspaceResource.updateMetadata(workspace.id, newMetadata);
  }
  logger.info(
    `Would update workspace ${workspaceId} frames with URL: ${frameWrappedUrl}`
  );

  logger.info(`✅ Processed workspace: ${workspaceId}`);
}

async function processFrameMetadataFile(
  {
    filePath,
    execute,
  }: {
    filePath: string;
    execute: boolean;
  },
  logger: Logger
): Promise<void> {
  try {
    logger.info(`Reading frame metadata from: ${filePath}`);

    const fileContent = fs.readFileSync(filePath, "utf8");

    // Parse and validate the entire file content with Zod
    let frameDataArray: FrameMetadata[];
    try {
      const rawData = JSON.parse(fileContent);
      frameDataArray = FrameMetadataArraySchema.parse(rawData);
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        logger.error("❌ File validation errors:");
        parseError.errors.forEach((error, index) => {
          logger.error(
            `  ${index + 1}. ${error.path.join(".")} - ${error.message}`
          );
        });
        throw new Error(
          `File validation failed: ${parseError.errors.length} errors found`
        );
      }
      throw new Error(`Invalid JSON file: ${parseError}`);
    }

    logger.info(`Found ${frameDataArray.length} frame metadata entries`);
    logger.info(`✅ All entries passed validation`);

    // Process each validated entry
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < frameDataArray.length; i++) {
      try {
        await updateFrameMetadata(frameDataArray[i], logger, execute);
        processed++;
      } catch (processError) {
        logger.error(`Processing error for entry ${i + 1}:`, processError);
        errors++;
      }
    }

    logger.info(`\n📊 Summary:`);
    logger.info(`✅ Processed: ${processed}`);
    logger.info(`❌ Errors: ${errors}`);
  } catch (error) {
    logger.error(`❌ Failed to process frame metadata file:`, error);
    throw error;
  }
}

makeScript(
  {
    file: {
      type: "string",
      demandOption: true,
      describe:
        "Path to JSON file containing frame metadata (workspaceId, wrappedUrl)",
    },
  },
  async ({ file, execute }, logger) => {
    logger.info("🚀 Starting frame metadata update script");
    logger.info(`📁 Input file: ${file}`);
    logger.info(`🔄 Execute mode: ${execute}`);

    if (!fs.existsSync(file)) {
      throw new Error(`File not found: ${file}`);
    }

    await processFrameMetadataFile({ filePath: file, execute }, logger);

    logger.info("✅ Frame metadata update script completed");
  }
);
