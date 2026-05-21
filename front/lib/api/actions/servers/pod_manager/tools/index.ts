import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeProjectConfigurationURI } from "@app/lib/actions/mcp_internal_actions/project_configuration_uri";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  FILES_LIST_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { listProjectFiles } from "@app/lib/api/actions/servers/files/tools/utils";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import {
  buildProjectRetrieveDataSources,
  getProjectSpace,
  getWritableProjectContext,
  makeSuccessResponse,
  withErrorHandling,
} from "@app/lib/api/actions/servers/pod_manager/helpers";
import { POD_MANAGER_TOOLS_METADATA } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { resolveAgentConfigurationIdByName } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  getConversation,
  getLightConversation,
} from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import {
  addContentNodeToProject,
  listProjectContextAttachments,
  removeContentNodesFromProject,
} from "@app/lib/api/projects/context";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import { areOpenProjectsAllowed } from "@app/lib/workspace_policies";
import {
  isUserMessageType,
  type UserMessageOrigin,
} from "@app/types/assistant/conversation";
import { extractDataSourceIdFromNodeId } from "@app/types/core/content_node";
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

export function createProjectManagerTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof POD_MANAGER_TOOLS_METADATA> = {
    add_content_node: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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
              `Failed to add content node to Pod: ${upsertRes.error.message}`,
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
            message: `Content node "${params.title}" added to Pod context successfully.`,
          })
        );
      }, "Failed to add content node");
    },

    remove_content_node: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;

        const removeRes = await removeContentNodesFromProject(auth, {
          space,
          nodes: [
            {
              nodeId: params.nodeId,
              nodeDataSourceViewId: params.nodeDataSourceViewId,
            },
          ],
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
              "Content node reference removed from the Pod context if present (Company Data unchanged).",
          })
        );
      }, "Failed to remove linked content from Pod");
    },

    edit_description: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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
            message: "Pod description updated successfully.",
          })
        );
      }, "Failed to edit Pod description");
    },

    get_information: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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

        // Linked content nodes (Company Data references) have no other discovery surface, so we
        // surface them here. Project files do (they live under `project/<rel>` scoped paths and
        // are discovered through the `files` MCP server), so we only report a count plus a hint.
        const attachments = await listProjectContextAttachments(auth, space);
        const contentNodes = attachments
          .filter(isContentNodeAttachmentType)
          .map((node) => ({
            name: node.title,
            nodeId: node.nodeId,
            dataSourceViewId: node.nodeDataSourceViewId,
          }));

        const projectFilesRes = await listProjectFiles(auth, space);
        if (projectFilesRes.isErr()) {
          return projectFilesRes;
        }
        const projectFileCount = projectFilesRes.value.filter(
          (e) => !e.isDirectory
        ).length;

        // Construct project URL
        const projectPath = getPodRoute(owner.sId, space.sId);
        const projectUrl = `${config.getAppUrl()}${projectPath}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            pod: {
              spaceId: space.sId,
              name: space.name,
              url: projectUrl,
              description: metadata?.description ?? null,
              contentNodes,
              files: {
                count: projectFileCount,
                hint: `Use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` with \`scope: "project"\` to enumerate.`,
              },
            },
            message: "Successfully retrieved Pod information",
          })
        );
      }, "Failed to get Pod information");
    },
    list_members: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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
              message: `No members found in Pod "${space.name}".`,
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
            message: `Found ${pageMembers.length} member(s) in Pod "${space.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch more members." : ""}.`,
          })
        );
      }, "Failed to list Pod members");
    },
    list_pods: async () => {
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
          dustPod: {
            uri: makeProjectConfigurationURI(workspaceSId, space.sId),
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT,
          },
        }));

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: projects.length,
            pods: projects,
            message:
              projects.length === 0
                ? "No non-archived Pods found where you are a space member."
                : `Found ${projects.length} Pod(s). Use each entry's dustPod as the dustPod argument for other pod_manager tools.`,
          })
        );
      }, "Failed to list Pods");
    },
    create_pod: async (params) => {
      return withErrorHandling(async () => {
        const owner = auth.getNonNullableWorkspace();

        if (params.visibility === "open" && !areOpenProjectsAllowed(owner)) {
          return new Err(
            new MCPError(
              "Open Pods are disabled by your workspace admin. Create a private Pod instead.",
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
          { seedInitialTasks: params.seedInitialTasks ?? false }
        );

        if (createSpaceRes.isErr()) {
          const error = createSpaceRes.error;
          switch (error.code) {
            case "limit_reached":
              return new Err(
                new MCPError(
                  "Pod creation limit reached for this workspace plan.",
                  { tracked: false }
                )
              );
            case "space_already_exists":
              return new Err(
                new MCPError("A Pod with this title already exists.", {
                  tracked: false,
                })
              );
            case "unauthorized":
              return new Err(
                new MCPError("You do not have permission to create a Pod.", {
                  tracked: false,
                })
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
                `Pod created but failed to add some members: ${addMembersRes.error.message}`,
                { tracked: false }
              )
            );
          }
        }

        const projectUrl = `${config.getAppUrl()}${getPodRoute(
          owner.sId,
          projectSpace.sId
        )}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            pod: {
              spaceId: projectSpace.sId,
              title: projectSpace.name,
              visibility: projectSpace.isOpen() ? "open" : "private",
              dustPod: {
                uri: makeProjectConfigurationURI(owner.sId, projectSpace.sId),
                mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT,
              },
              url: projectUrl,
            },
            message: `Pod "${projectSpace.name}" created successfully.`,
          })
        );
      }, "Failed to create Pod");
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
          dustPod: params.dustPod,
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
              "No Pod data source or Pod context nodes available to retrieve from.",
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
      }, "Failed to retrieve recent Pod documents");
    },

    create_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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

        let mentions: { configurationId: string }[] = [];
        if (params.agentName) {
          const matchedAgentId = await resolveAgentConfigurationIdByName(
            auth,
            params.agentName
          );
          if (!matchedAgentId) {
            return new Err(
              new MCPError(
                `No agent found matching name: "${params.agentName}"`,
                { tracked: false }
              )
            );
          }
          mentions = [{ configurationId: matchedAgentId }];
        }

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
            message: `Conversation created successfully in Pod "${space.name}"`,
          })
        );
      }, "Failed to create conversation");
    },

    list_conversations: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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
                text: `No conversations found in Pod "${space.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
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
              message: `Found ${conversationsPayload.length} conversation(s) in Pod "${space.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch older updates in this window." : ""}.`,
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
              text: `No unread conversations found in Pod "${space.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
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
            message: `Found ${pageResources.length} unread conversation(s) in Pod "${space.name}"${unreadResources.length > limit ? ` (showing first ${limit} of ${unreadResources.length})` : ""}.`,
          })
        );
      }, "Failed to list Pod conversations");
    },

    add_message_to_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
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
            new MCPError("Conversation is not in this Pod", {
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

        let mentions: { configurationId: string }[] = [];
        if (params.agentName) {
          const matchedAgentId = await resolveAgentConfigurationIdByName(
            auth,
            params.agentName
          );
          if (!matchedAgentId) {
            return new Err(
              new MCPError(
                `No agent found matching name: "${params.agentName}"`,
                { tracked: false }
              )
            );
          }
          mentions = [{ configurationId: matchedAgentId }];
        }

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
            message: `Message posted to conversation in Pod "${space.name}".`,
          })
        );
      }, "Failed to add message to conversation");
    },
  };

  return buildTools(POD_MANAGER_TOOLS_METADATA, handlers);
}
