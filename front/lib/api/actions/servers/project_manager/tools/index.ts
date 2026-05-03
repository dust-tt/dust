import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeProjectConfigurationURI } from "@app/lib/actions/mcp_internal_actions/project_configuration_uri";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import { buildProjectSearchDataSources } from "@app/lib/api/actions/servers/project_manager/build_project_search_data_sources";
import {
  buildProjectRetrieveDataSources,
  getProjectSpace,
  getWritableProjectContext,
  makeSuccessResponse,
  validateSourceFileForCopy,
  withErrorHandling,
} from "@app/lib/api/actions/servers/project_manager/helpers";
import { PROJECT_MANAGER_TOOLS_METADATA } from "@app/lib/api/actions/servers/project_manager/metadata";
import { searchFunction } from "@app/lib/api/actions/servers/search/tools";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { renderAttachmentXml } from "@app/lib/api/assistant/conversation/attachments";
import {
  getConversation,
  getLightConversation,
} from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import {
  addContentNodeToProject,
  addFileToProject,
  fetchLatestProjectContextFileContentFragment,
  listProjectContextAttachments,
  removeContentNodeFromProject,
  removeFileFromProject,
} from "@app/lib/api/projects/context";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute, getProjectRoute } from "@app/lib/utils/router";
import { areOpenProjectsAllowed } from "@app/lib/workspace_policies";
import logger from "@app/logger/logger";
import {
  isUserMessageType,
  type UserMessageOrigin,
} from "@app/types/assistant/conversation";
import { extractDataSourceIdFromNodeId } from "@app/types/core/content_node";
import {
  contentTypeFromFileName,
  isAllSupportedFileContentType,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { formatConversationsForDisplay } from "./conversation_formatting";

const LIST_CONVERSATIONS_DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function formatListedConversationWithoutMessages(
  c: ConversationResource,
  workspaceSId: string
) {
  const j = c.toJSON();
  return {
    sId: j.sId,
    title: j.title ?? "Untitled Conversation",
    created: new Date(j.created).toISOString(),
    updated: new Date(j.updated).toISOString(),
    unread: j.unread,
    actionRequired: j.actionRequired,
    hasError: j.hasError,
    conversationUrl: getConversationRoute(
      workspaceSId,
      j.sId,
      undefined,
      config.getAppUrl()
    ),
  };
}

/**
 * Reads content from a source file.
 */
async function readSourceFileContent(
  auth: Authenticator,
  sourceFile: FileResource
): Promise<string> {
  const owner = auth.getNonNullableWorkspace();
  const readStream = sourceFile.getSharedReadStream(owner, "original");
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function createProjectManagerTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof PROJECT_MANAGER_TOOLS_METADATA> = {
    add_file: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { fileName, content, sourceFileId, contentType } = params;
        const owner = auth.getNonNullableWorkspace();
        const user = auth.getNonNullableUser();

        let file: FileResource;

        // If sourceFileId is provided, use the copy method.
        if (sourceFileId) {
          const sourceFileRes = await validateSourceFileForCopy(auth, {
            sourceFileId,
            targetSpaceId: space.id,
          });
          if (sourceFileRes.isErr()) {
            return sourceFileRes;
          }

          const sourceFile = sourceFileRes.value;
          const sourceConversationId = sourceFile.useCaseMetadata
            ?.conversationId
            ? sourceFile.useCaseMetadata.sourceConversationId
            : undefined;

          const copyResult = await FileResource.copy(auth, {
            sourceId: sourceFileId,
            useCase: "project_context",
            useCaseMetadata: {
              spaceId: space.sId,
              sourceConversationId,
            },
          });

          if (copyResult.isErr()) {
            return new Err(
              new MCPError(`Failed to copy file: ${copyResult.error.message}`, {
                tracked: false,
              })
            );
          }

          file = copyResult.value;

          // Rename if a different fileName was provided.
          if (fileName !== file.fileName) {
            await file.rename(fileName);
          }
        } else if (content) {
          // Create file from direct content.
          const finalContentType =
            contentType ?? contentTypeFromFileName(fileName) ?? "text/plain";

          // Validate content type is text-based.
          if (!finalContentType.startsWith("text/")) {
            return new Err(
              new MCPError(
                `Only text-based content types are supported. Got: ${finalContentType}`,
                { tracked: false }
              )
            );
          }

          // Validate content type is supported.
          if (!isAllSupportedFileContentType(finalContentType)) {
            return new Err(
              new MCPError(`Unsupported content type: ${finalContentType}`, {
                tracked: false,
              })
            );
          }

          // Create file resource.
          file = await FileResource.makeNew({
            workspaceId: owner.id,
            userId: user.id,
            contentType: finalContentType,
            fileName,
            fileSize: Buffer.byteLength(content, "utf-8"),
            useCase: "project_context",
            useCaseMetadata: {
              spaceId: space.sId,
              sourceConversationId:
                agentLoopContext?.runContext?.conversation?.sId,
            },
          });

          // Upload content to GCS.
          await file.uploadContent(auth, content);
        } else {
          return new Err(
            new MCPError(
              "Either 'content' or 'sourceFileId' must be provided",
              { tracked: false }
            )
          );
        }

        const upsertRes = await addFileToProject(auth, {
          file,
          space,
          sourceConversationId: agentLoopContext?.runContext?.conversation?.sId,
        });

        if (upsertRes.isErr()) {
          logger.warn(
            {
              error: upsertRes.error,
              fileId: file.sId,
            },
            "Failed to add file to project (datasource or content fragment)"
          );
          // Don't fail - file is uploaded, just not fully indexed yet.
        }

        // Adapt the message based on the input
        let message: string;
        if (sourceFileId) {
          message = `File "${fileName}" (${file.sId}) created in project context successfully by copying from the source file (${sourceFileId}). These 2 files are NOT the same, you must use the appropriate file ID depending if you want to work on the original file or the new one.`;
        } else {
          message = `File "${fileName}" (${file.sId}) created in project context successfully from provided content.`;
        }

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              uri: file.getPublicUrl(auth),
              fileId: file.sId,
              title: file.fileName,
              contentType: file.contentType,
              snippet: null,
              text: message,
            },
          },
        ]);
      }, "Failed to add file");
    },
    add_content_node: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;

        const dataSourceId = extractDataSourceIdFromNodeId(
          params.dataSourceNodeId
        );
        if (!dataSourceId) {
          return new Err(
            new MCPError("Invalid node ID, unable to extract data source ID", {
              tracked: false,
            })
          );
        }

        const dataSource = await DataSourceResource.fetchByDustAPIDataSourceId(
          auth,
          dataSourceId
        );

        if (!dataSource) {
          return new Err(
            new MCPError(`Data source not found: ${dataSourceId}`, {
              tracked: false,
            })
          );
        }

        // We assume the node is coming from company data, as it's the only allowed source for projects.
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        const [dataSourceView] =
          await DataSourceViewResource.listForDataSourcesInSpace(
            auth,
            [dataSource],
            globalSpace
          );

        if (!dataSourceView) {
          return new Err(
            new MCPError(
              `Data source view not found for Company Data node: ${params.dataSourceNodeId}`,
              {
                tracked: false,
              }
            )
          );
        }

        const upsertRes = await addContentNodeToProject(auth, {
          space,
          contentFragment: {
            title: params.title,
            url: params.url,
            nodeId: params.nodeId,
            nodeDataSourceViewId: dataSourceView.sId,
          },
        });

        if (upsertRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to add content node to project: ${upsertRes.error.message}`,
              { tracked: false }
            )
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            contentNode: {
              title: params.title,
              nodeId: params.nodeId,
              nodeDataSourceViewId: dataSourceView.sId,
              url: params.url ?? null,
            },
            message: `Content node "${params.title}" added to project context successfully.`,
          })
        );
      }, "Failed to add content node");
    },

    update_file: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { fileId, content, sourceFileId } = params;

        // Fetch file.
        const file = await FileResource.fetchById(auth, fileId);
        if (!file) {
          return new Err(
            new MCPError(`File not found: ${fileId}`, { tracked: false })
          );
        }

        // Verify it's a project context file for this space.
        const metadata = file.useCaseMetadata as { spaceId?: string };
        if (
          file.useCase !== "project_context" ||
          metadata?.spaceId !== space.sId
        ) {
          return new Err(
            new MCPError("File not found in this project context", {
              tracked: false,
            })
          );
        }

        // Get file content from either direct content or source file.
        let fileContent: string;

        if (sourceFileId) {
          const sourceFileRes = await validateSourceFileForCopy(auth, {
            sourceFileId,
            targetSpaceId: space.id,
          });
          if (sourceFileRes.isErr()) {
            return sourceFileRes;
          }

          const sourceFile = sourceFileRes.value;
          fileContent = await readSourceFileContent(auth, sourceFile);

          if (!fileContent) {
            return new Err(
              new MCPError(
                `Failed to read content from source file: ${sourceFileId}`,
                { tracked: false }
              )
            );
          }
        } else if (content) {
          fileContent = content;
        } else {
          return new Err(
            new MCPError(
              "Either 'content' or 'sourceFileId' must be provided",
              { tracked: false }
            )
          );
        }

        // Upload new content.
        await file.uploadContent(auth, fileContent);

        // Re-upsert to datasource to update search index.
        const upsertRes = await addFileToProject(auth, {
          file,
          space,
          sourceConversationId: agentLoopContext?.runContext?.conversation?.sId,
        });

        if (upsertRes.isErr()) {
          logger.error(
            {
              error: upsertRes.error,
              fileId: file.sId,
            },
            "Failed to re-index updated file"
          );
          // Don't fail - content is updated, just not re-indexed.
        }

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              uri: file.getPublicUrl(auth),
              fileId: file.sId,
              title: file.fileName,
              contentType: file.contentType,
              snippet: null,
              text: `File "${file.fileName}" (${file.sId}) updated in project context successfully.`,
            },
          },
        ]);
      }, "Failed to update file");
    },

    remove_file: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { fileId } = params;

        const removeRes = await removeFileFromProject(auth, {
          space,
          fileId,
        });
        if (removeRes.isErr()) {
          return new Err(
            new MCPError(removeRes.error.message, { tracked: false })
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            message: `File "${fileId}" removed from the project context.`,
          })
        );
      }, "Failed to remove file from project");
    },

    remove_content_node: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;

        const removeRes = await removeContentNodeFromProject(auth, {
          space,
          nodeId: params.nodeId,
          nodeDataSourceViewId: params.nodeDataSourceViewId,
        });
        if (removeRes.isErr()) {
          return new Err(
            new MCPError(removeRes.error.message, { tracked: false })
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            nodeId: params.nodeId,
            nodeDataSourceViewId: params.nodeDataSourceViewId,
            message:
              "Content node reference removed from the project context if present (Company Data unchanged).",
          })
        );
      }, "Failed to remove linked content from project");
    },

    attach_to_conversation: async (params) => {
      return withErrorHandling(async () => {
        if (!agentLoopContext?.runContext?.conversation) {
          return new Err(
            new MCPError("No conversation context available", {
              tracked: false,
            })
          );
        }

        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { fileId } = params;

        const projectFile = await fetchLatestProjectContextFileContentFragment(
          auth,
          space,
          fileId
        );
        if (!projectFile) {
          return new Err(
            new MCPError("File not found in this project context", {
              tracked: false,
            })
          );
        }
        const { file } = projectFile;

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              uri: file.getPublicUrl(auth),
              fileId: file.sId,
              title: file.fileName,
              contentType: file.contentType,
              snippet: file.snippet,
              text: `File "${file.fileName}" (${file.sId}) attached to the current conversation.`,
            },
          },
        ]);
      }, "Failed to attach project file to conversation");
    },

    edit_description: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { description } = params;

        // Fetch or create project metadata.
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          space
        );

        if (!metadata) {
          // Create metadata if it doesn't exist.
          await ProjectMetadataResource.makeNew(auth, space, {
            description,
          });
        } else {
          // Update existing metadata.
          await metadata.updateDescription(description);
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            description,
            message: "Project description updated successfully.",
          })
        );
      }, "Failed to edit project description");
    },

    get_information: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const owner = auth.getNonNullableWorkspace();

        // Fetch project metadata
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          space
        );

        const attachments = await listProjectContextAttachments(auth, space);

        // Construct project URL
        const projectPath = getProjectRoute(owner.sId, space.sId);
        const projectUrl = `${config.getAppUrl()}${projectPath}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            project: {
              spaceId: space.sId,
              name: space.name,
              url: projectUrl,
              description: metadata?.description ?? null,
              context: {
                count: attachments.length,
                attachments: attachments
                  .map((a) =>
                    renderAttachmentXml({
                      attachment: a,
                      content: "",
                      // When in the project context, the flags might be misleading, version is useless (it's always the latest)
                      // eg: a csv might have been uploaded in a convo (becoming queryable) but then moved to the project context.
                      // This will be obsolete once we run query directly in the sandbox.
                      hideFlagsAndVersion: true,
                    })
                  )
                  .join("\n"),
              },
            },
            message: "Successfully retrieved project information",
          })
        );
      }, "Failed to get project information");
    },
    list_members: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { limit = 20, pageCursor } = params;

        const decodedPageOffset = pageCursor
          ? Number.parseInt(pageCursor, 10)
          : 0;
        const pageOffset =
          Number.isInteger(decodedPageOffset) && decodedPageOffset >= 0
            ? decodedPageOffset
            : null;

        if (pageOffset === null) {
          return new Err(
            new MCPError(
              "Invalid pageCursor. Expected an offset cursor from a previous list_members response.",
              { tracked: false }
            )
          );
        }

        const { groupsToProcess, allGroupMemberships } =
          await space.fetchManualGroupsMemberships(auth, {
            shouldIncludeAllMembers: true,
          });

        const groupById = new Map(
          groupsToProcess.map((group) => [group.id, group] as const)
        );
        const membershipByUserId = new Map<
          number,
          {
            isEditor: boolean;
            isActive: boolean;
            joinedAtMs: number;
          }
        >();

        for (const membership of allGroupMemberships) {
          const group = groupById.get(membership.groupId);
          if (!group) {
            continue;
          }

          const previous = membershipByUserId.get(membership.userId);
          membershipByUserId.set(membership.userId, {
            isEditor:
              Boolean(previous?.isEditor) || group.kind === "space_editors",
            isActive:
              Boolean(previous?.isActive) || membership.status === "active",
            joinedAtMs: Math.min(
              previous?.joinedAtMs ?? Number.POSITIVE_INFINITY,
              membership.startAt.getTime()
            ),
          });
        }

        const users = await UserResource.fetchByModelIds([
          ...membershipByUserId.keys(),
        ]);
        const userByModelId = new Map(
          users.map((user) => [user.id, user] as const)
        );

        const members = [...membershipByUserId.entries()]
          .map(([userModelId, membershipInfo]) => {
            const user = userByModelId.get(userModelId);
            if (!user) {
              return null;
            }

            return {
              id: user.sId,
              name: user.fullName(),
              email: user.email,
              role: membershipInfo.isEditor ? "editor" : "member",
              status: membershipInfo.isActive ? "active" : "suspended",
              joinedAt: new Date(membershipInfo.joinedAtMs).toISOString(),
            };
          })
          .filter(
            (member): member is NonNullable<typeof member> => member !== null
          )
          .sort((a, b) => {
            if (a.name !== b.name) {
              return a.name.localeCompare(b.name, undefined, {
                sensitivity: "base",
              });
            }
            return a.id.localeCompare(b.id);
          });

        if (members.length === 0) {
          return new Ok(
            makeSuccessResponse({
              success: true,
              count: 0,
              hasMore: false,
              nextPageCursor: null,
              members: [],
              message: `No members found in project "${space.name}".`,
            })
          );
        }

        const pageMembers = members.slice(pageOffset, pageOffset + limit);
        const nextOffset = pageOffset + pageMembers.length;
        const hasMore = nextOffset < members.length;
        const nextPageCursor = hasMore ? String(nextOffset) : null;

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: pageMembers.length,
            total: members.length,
            hasMore,
            nextPageCursor,
            members: pageMembers,
            message: `Found ${pageMembers.length} member(s) in project "${space.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch more members." : ""}.`,
          })
        );
      }, "Failed to list project members");
    },
    list_projects: async () => {
      return withErrorHandling(async () => {
        const owner = auth.getNonNullableWorkspace();
        const workspaceSId = owner.sId;
        const { nonArchivedSpaces } =
          await listNonArchivedMemberSpacesWithMetadata(auth);
        const memberProjects = nonArchivedSpaces
          .filter((space) => space.isProject())
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          );

        const projects = memberProjects.map((space) => ({
          spaceId: space.sId,
          name: space.name,
          dustProject: {
            uri: makeProjectConfigurationURI(workspaceSId, space.sId),
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT,
          },
        }));

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: projects.length,
            projects,
            message:
              projects.length === 0
                ? "No non-archived projects found where you are a space member."
                : `Found ${projects.length} project(s). Use each entry's dustProject as the dustProject argument for other project_manager tools.`,
          })
        );
      }, "Failed to list projects");
    },
    create_project: async (params) => {
      return withErrorHandling(async () => {
        const owner = auth.getNonNullableWorkspace();

        if (params.visibility === "open" && !areOpenProjectsAllowed(owner)) {
          return new Err(
            new MCPError(
              "Open projects are disabled by your workspace admin. Create a private project instead.",
              { tracked: false }
            )
          );
        }

        const createSpaceRes = await createSpaceAndGroup(
          auth,
          {
            name: params.title,
            isRestricted: params.visibility !== "open",
            spaceKind: "project",
            managementMode: "manual",
            memberIds: [],
          },
          { seedInitialTodos: params.seedInitialTodos ?? false }
        );

        if (createSpaceRes.isErr()) {
          const error = createSpaceRes.error;
          switch (error.code) {
            case "limit_reached":
              return new Err(
                new MCPError(
                  "Project creation limit reached for this workspace plan.",
                  { tracked: false }
                )
              );
            case "space_already_exists":
              return new Err(
                new MCPError("A project with this title already exists.", {
                  tracked: false,
                })
              );
            case "unauthorized":
              return new Err(
                new MCPError(
                  "You do not have permission to create a project.",
                  { tracked: false }
                )
              );
            case "internal_error":
              return new Err(
                new MCPError(error.message, {
                  tracked: false,
                })
              );
            default:
              return new Err(
                new MCPError(error.message, {
                  tracked: false,
                })
              );
          }
        }

        const projectSpace = createSpaceRes.value;

        if (params.description) {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            auth,
            projectSpace
          );
          if (metadata) {
            await metadata.updateDescription(params.description);
          } else {
            await ProjectMetadataResource.makeNew(auth, projectSpace, {
              description: params.description,
            });
          }
        }

        if (params.memberIds && params.memberIds.length > 0) {
          const uniqueMemberIds = [...new Set(params.memberIds)];
          const addMembersRes = await projectSpace.addMembers(auth, {
            userIds: uniqueMemberIds,
          });
          if (addMembersRes.isErr()) {
            return new Err(
              new MCPError(
                `Project created but failed to add some members: ${addMembersRes.error.message}`,
                { tracked: false }
              )
            );
          }
        }

        const projectUrl = `${config.getAppUrl()}${getProjectRoute(
          owner.sId,
          projectSpace.sId
        )}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            project: {
              spaceId: projectSpace.sId,
              title: projectSpace.name,
              visibility: projectSpace.isOpen() ? "open" : "private",
              dustProject: {
                uri: makeProjectConfigurationURI(owner.sId, projectSpace.sId),
                mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT,
              },
              url: projectUrl,
            },
            message: `Project "${projectSpace.name}" created successfully.`,
          })
        );
      }, "Failed to create project");
    },

    retrieve_recent_documents: async (params) => {
      return withErrorHandling(async () => {
        if (!agentLoopContext) {
          return new Err(
            new MCPError("No conversation context available", {
              tracked: false,
            })
          );
        }

        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const dataSources = await buildProjectRetrieveDataSources(auth, {
          space,
          onlyGroupConversationsAndConnectedData: false,
        });

        if (dataSources.length === 0) {
          return new Err(
            new MCPError(
              "No project data source or project context nodes available to retrieve from.",
              { tracked: false }
            )
          );
        }

        if (!agentLoopContext?.runContext) {
          throw new Error(
            "agentLoopRunContext is required where the tool is called"
          );
        }

        return runIncludeDataRetrieval(auth, {
          timeFrame: params.timeFrame,
          dataSources,
          nodeIds: params.nodeIds,
          citationsOffset:
            agentLoopContext.runContext.stepContext.citationsOffset,
          retrievalTopK: agentLoopContext.runContext.stepContext.retrievalTopK,
        });
      }, "Failed to retrieve recent project documents");
    },

    semantic_search: async (params) => {
      return withErrorHandling(async () => {
        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError("No conversation context available", {
              tracked: false,
            })
          );
        }

        const scope = params.searchScope ?? "all";
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const dataSources = await buildProjectSearchDataSources(
          auth,
          space,
          scope
        );

        if (dataSources.length === 0) {
          return new Err(
            new MCPError(
              scope === "conversations"
                ? "No project data source available to search conversations, or the project connector is not linked (required to scope transcript documents)."
                : "No project data sources available to search for this scope.",
              { tracked: false }
            )
          );
        }

        return searchFunction(auth, {
          query: params.query,
          relativeTimeFrame: params.relativeTimeFrame ?? "all",
          dataSources,
          nodeIds: params.nodeIds,
          agentLoopContext,
        });
      }, "Failed to search project");
    },

    create_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const user = auth.getNonNullableUser();
        const owner = auth.getNonNullableWorkspace();

        // Get origin and timezone from the current conversation
        let origin: UserMessageOrigin = "web";
        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (agentLoopContext?.runContext?.conversation?.content) {
          const userMessage = agentLoopContext.runContext.conversation.content
            .flat()
            .findLast(isUserMessageType);
          if (userMessage?.context) {
            origin = userMessage.context.origin ?? origin;
            timezone = userMessage.context.timezone ?? timezone;
          }
        }

        // Get agent configuration name & profile picture URL
        const agentName =
          agentLoopContext?.runContext?.agentConfiguration?.name ?? "Agent";

        const agentProfilePictureUrl =
          agentLoopContext?.runContext?.agentConfiguration?.pictureUrl ?? null;

        // Build mentions if agentId is provided
        const mentions = params.agentId
          ? [{ configurationId: params.agentId }]
          : [];

        // Create conversation in the project space
        const conversation = await createConversation(auth, {
          title: params.title,
          visibility: "unlisted",
          spaceId: space.id,
        });

        // Post user message
        const messageRes = await postUserMessage(auth, {
          conversation,
          content: params.message,
          mentions,
          context: {
            username: agentName,
            fullName: `@${agentName} on behalf of ${user.fullName()}`,
            email: null,
            profilePictureUrl: agentProfilePictureUrl,
            timezone,
            origin,
            clientSideMCPServerIds: [],
            selectedMCPServerViewIds: [],
            lastTriggerRunAt: null,
          },
          skipToolsValidation: false,
          doNotAssociateUser: true,
          skipDustAutoMention: true,
        });

        if (messageRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to post message: ${messageRes.error.api_error.message}`,
              { tracked: false }
            )
          );
        }

        const conversationUrl = getConversationRoute(
          owner.sId,
          conversation.sId,
          undefined,
          config.getAppUrl()
        );

        return new Ok(
          makeSuccessResponse({
            success: true,
            conversationId: conversation.sId,
            conversationUrl,
            userMessageId: messageRes.value.userMessage.sId,
            message: `Conversation created successfully in project "${space.name}"`,
          })
        );
      }, "Failed to create conversation");
    },

    list_conversations: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const {
          unreadOnly = false,
          limit = 20,
          pageCursor,
          includeMessages = false,
        } = params;

        const updatedSinceMs =
          params.updatedSince ??
          Date.now() - LIST_CONVERSATIONS_DEFAULT_LOOKBACK_MS;

        const listOptions = {
          updatedSince: updatedSinceMs,
          excludeTest: true,
        };

        if (!unreadOnly) {
          const {
            conversations: resourcePage,
            hasMore,
            lastValue,
          } = await ConversationResource.listConversationsInSpacePaginated(
            auth,
            {
              spaceId: space.sId,
              options: listOptions,
              pagination: {
                limit,
                lastValue: pageCursor,
              },
            }
          );

          if (resourcePage.length === 0) {
            return new Ok([
              {
                type: "text" as const,
                text: `No conversations found in project "${space.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
              },
            ]);
          }

          const owner = auth.getNonNullableWorkspace();
          let conversationsPayload: unknown[];

          if (includeMessages) {
            const conversationResults = await concurrentExecutor(
              resourcePage,
              async (c) => getLightConversation(auth, c.sId, false),
              { concurrency: 10 }
            );
            const conversationsForDisplay = conversationResults
              .filter((r) => r.isOk())
              .map((r) => r.value);
            conversationsPayload = formatConversationsForDisplay(
              conversationsForDisplay,
              owner.sId
            );
          } else {
            conversationsPayload = resourcePage.map((c) =>
              formatListedConversationWithoutMessages(c, owner.sId)
            );
          }

          const nextPageCursor = hasMore && lastValue ? lastValue : null;
          return new Ok(
            makeSuccessResponse({
              success: true,
              count: conversationsPayload.length,
              unreadOnly: false,
              includeMessages,
              updatedSince: updatedSinceMs,
              hasMore,
              nextPageCursor,
              conversations: conversationsPayload,
              message: `Found ${conversationsPayload.length} conversation(s) in project "${space.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch older updates in this window." : ""}.`,
            })
          );
        }

        const spaceConversations =
          await ConversationResource.listConversationsInSpace(auth, {
            spaceId: space.sId,
            options: listOptions,
          });

        const unreadResources = spaceConversations.filter(
          (c) => c.toJSON().unread
        );
        const pageResources = unreadResources.slice(0, limit);

        if (pageResources.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No unread conversations found in project "${space.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
            },
          ]);
        }

        const owner = auth.getNonNullableWorkspace();
        let conversationsPayload: unknown[];

        if (includeMessages) {
          const conversationResults = await concurrentExecutor(
            pageResources,
            async (c) => getLightConversation(auth, c.sId, false),
            { concurrency: 10 }
          );
          const withContent = conversationResults
            .filter((r) => r.isOk())
            .map((r) => r.value);
          conversationsPayload = formatConversationsForDisplay(
            withContent,
            owner.sId
          );
        } else {
          conversationsPayload = pageResources.map((c) =>
            formatListedConversationWithoutMessages(c, owner.sId)
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: pageResources.length,
            total: unreadResources.length,
            unreadOnly: true,
            includeMessages,
            updatedSince: updatedSinceMs,
            conversations: conversationsPayload,
            message: `Found ${pageResources.length} unread conversation(s) in project "${space.name}"${unreadResources.length > limit ? ` (showing first ${limit} of ${unreadResources.length})` : ""}.`,
          })
        );
      }, "Failed to list project conversations");
    },

    add_message_to_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const user = auth.getNonNullableUser();
        const owner = auth.getNonNullableWorkspace();

        const conversationId =
          params.conversationId ??
          agentLoopContext?.runContext?.conversation?.sId;

        if (!conversationId) {
          return new Err(
            new MCPError(
              "No conversationId provided and no conversation in agent context; pass conversationId explicitly.",
              { tracked: false }
            )
          );
        }

        const conversationRes = await getConversation(
          auth,
          conversationId,
          false
        );
        if (conversationRes.isErr()) {
          return new Err(
            new MCPError(`Conversation not found: ${conversationId}`, {
              tracked: false,
            })
          );
        }

        const conversation = conversationRes.value;
        if (conversation.spaceId !== space.sId) {
          return new Err(
            new MCPError("Conversation is not in this project", {
              tracked: false,
            })
          );
        }

        let origin: UserMessageOrigin = "web";
        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (agentLoopContext?.runContext?.conversation?.content) {
          const userMessage = agentLoopContext.runContext.conversation.content
            .flat()
            .findLast(isUserMessageType);
          if (userMessage?.context) {
            origin = userMessage.context.origin ?? origin;
            timezone = userMessage.context.timezone ?? timezone;
          }
        }

        const agentName =
          agentLoopContext?.runContext?.agentConfiguration?.name ?? "Agent";
        const agentProfilePictureUrl =
          agentLoopContext?.runContext?.agentConfiguration?.pictureUrl ?? null;

        const mentions = params.agentId
          ? [{ configurationId: params.agentId }]
          : [];

        const messageRes = await postUserMessage(auth, {
          conversation,
          content: params.message,
          mentions,
          context: {
            username: agentName,
            fullName: `@${agentName} on behalf of ${user.fullName()}`,
            email: null,
            profilePictureUrl: agentProfilePictureUrl,
            timezone,
            origin,
            clientSideMCPServerIds: [],
            selectedMCPServerViewIds: [],
            lastTriggerRunAt: null,
          },
          skipToolsValidation: false,
          doNotAssociateUser: true,
          skipDustAutoMention: true,
        });

        if (messageRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to post message: ${messageRes.error.api_error.message}`,
              { tracked: false }
            )
          );
        }

        const conversationUrl = getConversationRoute(
          owner.sId,
          conversation.sId,
          undefined,
          config.getAppUrl()
        );

        return new Ok(
          makeSuccessResponse({
            success: true,
            conversationId: conversation.sId,
            conversationUrl,
            userMessageId: messageRes.value.userMessage.sId,
            message: `Message posted to conversation in project "${space.name}".`,
          })
        );
      }, "Failed to add message to conversation");
    },
  };

  return buildTools(PROJECT_MANAGER_TOOLS_METADATA, handlers);
}
