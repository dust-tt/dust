import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { getFileContent } from "@app/lib/api/files/utils";
import { fetchProjectDataSource } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { extractFileDependencies } from "@app/lib/files";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

interface PromotionResult {
  frameNodeId: string;
  dataSourceId: string;
  movedFiles: string[];
}

/**
 * Promote a frame and its dependent files from a conversation to a project space.
 * This moves files from useCase "conversation" to "project_context" and upserts them
 * to the project's context datasource, making them searchable by agents.
 *
 * @param auth Authenticator
 * @param frameId File ID (sId) of the frame to promote
 * @param spaceId Space ID (sId) of the target project
 * @returns PromotionResult with frame node ID, datasource ID, and list of moved file IDs
 */
export async function promoteFrameToProject(
  auth: Authenticator,
  frameId: string,
  spaceId: string
): Promise<Result<PromotionResult, Error>> {
  // Step 1: Fetch frame file
  const frameFile = await FileResource.fetchById(auth, frameId);
  if (!frameFile) {
    return new Err(new Error("Frame not found"));
  }

  if (frameFile.contentType !== "application/vnd.dust.frame") {
    return new Err(new Error("File is not a frame"));
  }

  // Check if frame is already promoted to this space
  if (
    frameFile.useCase === "project_context" &&
    frameFile.useCaseMetadata?.spaceId === spaceId
  ) {
    return new Err(new Error("Frame is already promoted to this project"));
  }

  // Step 2: Extract file dependencies from frame content
  const frameContentRes = await getFileContent(auth, frameFile, "original");
  if (!frameContentRes) {
    return new Err(new Error("Failed to get frame content"));
  }

  const dependentFileIds = extractFileDependencies(frameContentRes);
  logger.info(
    {
      frameId: frameFile.sId,
      dependentFileIds,
      dependentFileCount: dependentFileIds.length,
    },
    "Extracted frame dependencies"
  );

  // Step 3: Fetch all dependent files
  const dependentFilesResult = await concurrentExecutor(
    dependentFileIds,
    async (fileId) => {
      return FileResource.fetchById(auth, fileId);
    },
    { concurrency: 5 }
  );

  // Filter out nulls (files that don't exist or can't be accessed)
  const validDependentFiles = dependentFilesResult.filter(
    (f): f is FileResource => f !== null
  );

  if (validDependentFiles.length < dependentFileIds.length) {
    logger.warn(
      {
        frameId: frameFile.sId,
        requestedCount: dependentFileIds.length,
        foundCount: validDependentFiles.length,
        missingFileIds: dependentFileIds.filter(
          (id) => !validDependentFiles.some((f) => f.sId === id)
        ),
      },
      "Some dependent files could not be accessed"
    );
  }

  // Step 4: Validate permissions
  const filesToMove = [frameFile, ...validDependentFiles];

  // 4a. Check read access to all files from source conversations
  for (const file of filesToMove) {
    if (file.useCase === "conversation") {
      const conversationId = file.useCaseMetadata?.conversationId;
      if (!conversationId) {
        logger.error(
          {
            fileId: file.sId,
            useCase: file.useCase,
          },
          "File has conversation use case but no conversationId in metadata"
        );
        return new Err(
          new Error(`File ${file.sId} is missing conversation metadata`)
        );
      }

      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );

      if (!conversation) {
        return new Err(
          new Error(`No access to conversation for file: ${file.sId}`)
        );
      }
    }
  }

  // 4b. Check write access to target project
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return new Err(new Error("Project not found"));
  }

  if (!space.canWrite(auth)) {
    return new Err(new Error("No write access to project"));
  }

  // Step 5: Fetch project_context datasource
  const projectDSResult = await fetchProjectDataSource(auth, space);

  if (projectDSResult.isErr()) {
    return new Err(
      new Error(
        `Failed to fetch project datasource: ${projectDSResult.error.message}`
      )
    );
  }

  const projectDS = projectDSResult.value;

  // Step 6: Move all files (frame + dependencies)
  const moveResults = await concurrentExecutor(
    filesToMove,
    async (file) => {
      try {
        // Skip if file is already promoted to this space
        if (
          file.useCase === "project_context" &&
          file.useCaseMetadata?.spaceId === spaceId
        ) {
          logger.info(
            {
              fileId: file.sId,
              spaceId,
            },
            "File already promoted to this project, skipping"
          );
          return new Ok(file);
        }

        // Store source conversation ID if moving from conversation
        const sourceConversationId =
          file.useCase === "conversation"
            ? file.useCaseMetadata?.conversationId
            : undefined;

        // Update file useCase to project_context
        await file.setUseCase("project_context", {
          spaceId,
          sourceConversationId,
          promotedAt: Date.now(),
          promotedBy: auth.user()?.sId,
        });

        logger.info({}, "set processAndUpsertToDataSource");

        // Upsert to project_context datasource (creates node in Core)
        const upsertResult = await processAndUpsertToDataSource(
          auth,
          projectDS,
          {
            file,
          }
        );

        if (upsertResult.isErr()) {
          logger.error(
            {},
            `Failed to upsert file ${file.sId}: ${upsertResult.error.message}`
          );
          return new Err(
            new Error(
              `Failed to upsert file ${file.sId}: ${upsertResult.error.message}`
            )
          );
        }

        logger.info(
          {
            fileId: file.sId,
            fileName: file.fileName,
            spaceId,
            dataSourceId: projectDS.sId,
          },
          "File promoted to project successfully"
        );

        return new Ok(file);
      } catch (err) {
        logger.error(
          {
            fileId: file.sId,
            fileName: file.fileName,
            spaceId,
            dataSourceId: projectDS.sId,
          },
          `Failed to process file ${file.sId}: ${err instanceof Error ? err.message : String(err)}`
        );
        return new Err(
          new Error(
            `Failed to process file ${file.sId}: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    },
    { concurrency: 5 }
  );

  // Check for any failures
  const failures = moveResults.filter((r) => r.isErr());
  if (failures.length > 0) {
    const errorMessages = failures
      .map((r) => (r.isErr() ? r.error.message : ""))
      .join("; ");
    return new Err(
      new Error(`Failed to move ${failures.length} file(s): ${errorMessages}`)
    );
  }

  // Step 7: Return result
  return new Ok({
    frameNodeId: `fil_${frameFile.sId}`,
    dataSourceId: projectDS.sId,
    movedFiles: validDependentFiles.map((f) => f.sId),
  });
}
