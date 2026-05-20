import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getScopedPathFromGCSPath } from "@app/lib/api/files/gcs_mount/files";
import {
  getConversationFilesBasePath,
  getProjectFilesBasePath,
} from "@app/lib/api/files/mount_path";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isProjectConversation } from "@app/types/assistant/conversation";
import { isConversationFileUseCase } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";

export async function resolveHandler(
  { file_id }: { file_id: string },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = extra.agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const file = await FileResource.fetchById(extra.auth, file_id);
  if (!file) {
    return new Err(
      new MCPError(`File not found: \`${file_id}\`.`, { tracked: false })
    );
  }

  if (!file.mountFilePath) {
    return new Err(
      new MCPError(
        `File \`${file_id}\` is not accessible through the file system.`,
        { tracked: false }
      )
    );
  }

  const owner = extra.auth.getNonNullableWorkspace();
  const { useCase, useCaseMetadata } = file;

  if (isConversationFileUseCase(useCase)) {
    if (useCaseMetadata?.conversationId !== conversation.sId) {
      return new Err(
        new MCPError(
          `File \`${file_id}\` does not belong to this conversation.`,
          { tracked: false }
        )
      );
    }

    const scopedPath = getScopedPathFromGCSPath({
      prefix: getConversationFilesBasePath({
        workspaceId: owner.sId,
        conversationId: conversation.sId,
      }),
      gcsPath: file.mountFilePath,
      useCase: "conversation",
    });
    if (!scopedPath) {
      return new Err(
        new MCPError(
          `File \`${file_id}\` does not belong to this conversation.`,
          { tracked: false }
        )
      );
    }

    return new Ok([{ type: "text", text: scopedPath }]);
  }

  if (useCase === "project_context") {
    if (!isProjectConversation(conversation)) {
      return new Err(
        new MCPError(
          `File \`${file_id}\` is a project file but this is not a project conversation.`,
          { tracked: false }
        )
      );
    }

    const spaceId = useCaseMetadata?.spaceId;
    if (!spaceId || spaceId !== conversation.spaceId) {
      return new Err(
        new MCPError(
          `File \`${file_id}\` does not belong to the project of this conversation.`,
          { tracked: false }
        )
      );
    }

    const space = await SpaceResource.fetchById(extra.auth, spaceId);
    if (!space || !space.canRead(extra.auth)) {
      return new Err(
        new MCPError(
          "You do not have read access to the project containing this file.",
          { tracked: false }
        )
      );
    }

    const scopedPath = getScopedPathFromGCSPath({
      prefix: getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: spaceId,
      }),
      gcsPath: file.mountFilePath,
      useCase: "project",
    });
    if (!scopedPath) {
      return new Err(
        new MCPError(
          `File \`${file_id}\` does not belong to the project of this conversation.`,
          { tracked: false }
        )
      );
    }

    return new Ok([{ type: "text", text: scopedPath }]);
  }

  return new Err(
    new MCPError(
      `File \`${file_id}\` is not accessible through the file system (use case: ${useCase}).`,
      { tracked: false }
    )
  );
}
