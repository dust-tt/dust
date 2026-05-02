import { MCPError } from "@app/lib/actions/mcp_errors";
import { getDataSourceURI } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type {
  DataSourcesToolConfigurationType,
  DustProjectConfigurationType,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { parseProjectConfigurationURI } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { DataSourceFilter } from "@app/lib/api/assistant/configuration/types";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  getProjectConversationFolderInternalId,
  listProjectContextAttachments,
} from "@app/lib/api/projects/context";
import { fetchProjectDataSourceView } from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export interface ProjectSpaceContext {
  space: SpaceResource;
}

export async function buildProjectRetrieveDataSources(
  auth: Authenticator,
  {
    space,
    onlyGroupConversationsAndConnectedData,
  }: { space: SpaceResource; onlyGroupConversationsAndConnectedData: boolean }
): Promise<DataSourcesToolConfigurationType> {
  const owner = auth.getNonNullableWorkspace();
  const dataSources: DataSourcesToolConfigurationType = [];

  const projectDsViewRes = await fetchProjectDataSourceView(auth, space);
  if (projectDsViewRes.isOk()) {
    let filter: DataSourceFilter = { parents: null, tags: null };
    const dsView = projectDsViewRes.value.toJSON();
    if (
      onlyGroupConversationsAndConnectedData &&
      dsView.dataSource.connectorId
    ) {
      const conversationsFolderInternalId =
        getProjectConversationFolderInternalId(
          dsView.dataSource.connectorId,
          space.sId
        );
      filter = {
        parents: { in: [conversationsFolderInternalId], not: [] },
        tags: { in: ["group"], not: [], mode: "custom" },
      };
    }

    dataSources.push({
      uri: getDataSourceURI({
        workspaceId: owner.sId,
        dataSourceViewId: projectDsViewRes.value.sId,
        filter,
      }),
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    });
  }

  const attachments = await listProjectContextAttachments(auth, space);
  const seenContentNodeKeys = new Set<string>();
  for (const attachment of attachments) {
    if (!isContentNodeAttachmentType(attachment)) {
      continue;
    }
    const key = `${attachment.nodeDataSourceViewId}:${attachment.nodeId}`;
    if (seenContentNodeKeys.has(key)) {
      continue;
    }
    seenContentNodeKeys.add(key);
    dataSources.push({
      uri: getDataSourceURI({
        workspaceId: owner.sId,
        dataSourceViewId: attachment.nodeDataSourceViewId,
        filter: {
          parents: { in: [attachment.nodeId], not: [] },
          tags: null,
        },
      }),
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    });
  }

  return dataSources;
}

/**
 * Gets the spaces from the agent loop context or from the provided dustProject parameter.
 * If dustProject is provided, uses that to fetch all spaces. Otherwise, gets from conversation.
 * The conversation must be in a project (space) if dustProject is not provided.
 */
export async function getProjectSpace(
  auth: Authenticator,
  from:
    | { agentLoopContext?: AgentLoopContextType }
    | { dustProject?: DustProjectConfigurationType }
): Promise<Result<ProjectSpaceContext, MCPError>> {
  if ("dustProject" in from && from.dustProject) {
    const { dustProject } = from;
    const authWorkspaceId = auth.getNonNullableWorkspace().sId;

    // Parse the project URI to extract workspaceId and projectId.
    const parseResult = parseProjectConfigurationURI(dustProject.uri);
    if (parseResult.isErr()) {
      return new Err(
        new MCPError(`Invalid project URI: ${parseResult.error.message}`, {
          tracked: false,
        })
      );
    }

    const { workspaceId, projectId } = parseResult.value;

    // Validate that the workspace ID matches the authenticated workspace.
    if (workspaceId !== authWorkspaceId) {
      return new Err(
        new MCPError(
          `Workspace mismatch: project belongs to workspace ${workspaceId} but authenticated workspace is ${authWorkspaceId}`,
          { tracked: false }
        )
      );
    }

    // Fetch the space by projectId.
    const space = await SpaceResource.fetchById(auth, projectId);
    if (!space) {
      return new Err(
        new MCPError(`Project not found: ${projectId}`, { tracked: false })
      );
    }

    return new Ok({ space });
  }

  // Otherwise, use the existing logic to get space from conversation context.
  if ("agentLoopContext" in from && from.agentLoopContext) {
    const { agentLoopContext } = from;
    if (!agentLoopContext.runContext?.conversation) {
      return new Err(
        new MCPError("No conversation context available", { tracked: false })
      );
    }

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        agentLoopContext.runContext.conversation.sId
      );

    if (conversationRes.isErr()) {
      return new Err(
        new MCPError(
          `Conversation not found: ${conversationRes.error.message}`,
          {
            tracked: false,
          }
        )
      );
    }

    const conversation = conversationRes.value;

    if (!isProjectConversation(conversation)) {
      return new Err(
        new MCPError(
          "This conversation is not in a project. Project context management is only available in project conversations.",
          { tracked: false }
        )
      );
    }

    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (!space) {
      return new Err(new MCPError("Project not found", { tracked: false }));
    }

    return new Ok({ space });
  }

  return new Err(
    new MCPError("No project context available", { tracked: false })
  );
}

/**
 * Checks if the user has write permissions for the space.
 * Returns an error if they don't.
 */
export function checkWritePermission(
  auth: Authenticator,
  space: SpaceResource
): Result<void, MCPError> {
  if (!space.canWrite(auth)) {
    return new Err(
      new MCPError("You do not have write permissions for this project", {
        tracked: false,
      })
    );
  }
  return new Ok(undefined);
}

/**
 * Gets the space context and verifies write permissions for all spaces.
 * This is a convenience function that combines getProjectSpace and checkWritePermission.
 */
export async function getWritableProjectContext(
  auth: Authenticator,
  from:
    | { agentLoopContext?: AgentLoopContextType }
    | { dustProject?: DustProjectConfigurationType }
): Promise<Result<ProjectSpaceContext, MCPError>> {
  const contextRes = await getProjectSpace(auth, from);
  if (contextRes.isErr()) {
    return contextRes;
  }

  const { space } = contextRes.value;

  // Check write permissions for all spaces.
  const permissionRes = checkWritePermission(auth, space);
  if (permissionRes.isErr()) {
    return permissionRes;
  }

  return contextRes;
}

/**
 * Validates a source file for copying to project context.
 * Checks that:
 * - File exists and is ready
 * - File is associated with a conversation
 * - Conversation belongs to the target space
 * - File has a copyable content type
 */
export async function validateSourceFileForCopy(
  auth: Authenticator,
  {
    sourceFileId,
    targetSpaceId,
  }: { sourceFileId: string; targetSpaceId: number }
): Promise<Result<FileResource, MCPError>> {
  const sourceFile = await FileResource.fetchById(auth, sourceFileId);
  if (!sourceFile) {
    return new Err(new MCPError("Source file not found", { tracked: false }));
  }

  if (!sourceFile.isReady) {
    return new Err(
      new MCPError(`Source file not ready: ${sourceFileId}`, {
        tracked: false,
      })
    );
  }

  if (!sourceFile.useCaseMetadata?.conversationId) {
    return new Err(
      new MCPError("Source file is not associated with a conversation", {
        tracked: false,
      })
    );
  }

  const sourceFileConversation = await ConversationResource.fetchById(
    auth,
    sourceFile.useCaseMetadata.conversationId
  );
  if (!sourceFileConversation) {
    return new Err(
      new MCPError("Source file's conversation not found", {
        tracked: false,
      })
    );
  }

  if (sourceFileConversation.spaceId !== targetSpaceId) {
    return new Err(
      new MCPError("Cannot copy files external to the project", {
        tracked: false,
      })
    );
  }

  return new Ok(sourceFile);
}

/**
 * Creates a success response with a JSON-formatted message.
 */
export function makeSuccessResponse(data: Record<string, unknown>): {
  type: "text";
  text: string;
}[] {
  return [
    {
      type: "text" as const,
      text: JSON.stringify(data, null, 2),
    },
  ];
}

/**
 * Wraps an async operation with standardized error handling.
 * Catches exceptions and converts them to MCPError results.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<Result<T, MCPError>>,
  errorMessage: string
): Promise<Result<T, MCPError>> {
  try {
    return await operation();
  } catch (error) {
    return new Err(
      new MCPError(errorMessage, {
        cause: normalizeError(error),
      })
    );
  }
}
