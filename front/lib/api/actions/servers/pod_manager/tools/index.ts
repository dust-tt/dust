import { MCPError } from "@app/lib/actions/mcp_errors";
import { makePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/pod_configuration_uri";
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
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import { buildPodSearchDataSources } from "@app/lib/api/actions/servers/pod_manager/build_pod_search_data_sources";
import {
  buildProjectRetrieveDataSources,
  getPod,
  getWritablePodContext,
  makeSuccessResponse,
  partitionMembersToRemove,
  resolvePodUserRolesBySId,
  withErrorHandling,
} from "@app/lib/api/actions/servers/pod_manager/helpers";
import {
  LIST_MEMBERS_TOOL_NAME,
  POD_MANAGER_TOOLS_METADATA,
  SEMANTIC_SEARCH_TOOL_NAME,
  UPDATE_MEMBERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_manager/metadata";
import { partitionMembersToAdd } from "@app/lib/api/actions/servers/pod_manager/types";
import { searchFunction } from "@app/lib/api/actions/servers/search/tools";
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
import { DustFileSystem, SCOPED_PREFIX_POD } from "@app/lib/api/file_system";
import {
  addContentNodeToProject,
  listProjectContextAttachments,
  removeContentNodesFromProject,
} from "@app/lib/api/projects/context";
import { listPodsForScope } from "@app/lib/api/projects/list";
import { validatePinnedFramePath } from "@app/lib/api/projects/pinned_frame";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { notifyPodMembersAdded } from "@app/lib/notifications/workflows/pod-added-as-member";
import { seedInitialPodTasks } from "@app/lib/project_task/seed_initial_pod_tasks";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { ProjectMetadataBlob } from "@app/lib/resources/project_metadata_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import {
  isUserMessageType,
  type UserMessageOrigin,
} from "@app/types/assistant/conversation";
import { extractDataSourceIdFromNodeId } from "@app/types/core/content_node";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
        const contextRes = await getWritablePodContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;

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
          space: pod,
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
        const contextRes = await getWritablePodContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;

        const removeRes = await removeContentNodesFromProject(auth, {
          space: pod,
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

    edit_information: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;

        if (!pod.canAdministrate(auth)) {
          return new Err(
            new MCPError(
              "You do not have permission to edit this Pod's information",
              { tracked: false }
            )
          );
        }

        const { title, description, pinnedFramePath } = params;
        if (
          title === undefined &&
          description === undefined &&
          pinnedFramePath === undefined
        ) {
          return new Err(
            new MCPError(
              "At least one of title, description, or pinnedFramePath must be provided",
              { tracked: false }
            )
          );
        }

        const updates: ProjectMetadataBlob & { title?: string } = {};

        if (title !== undefined) {
          const updateNameRes = await pod.updateName(auth, title);
          if (updateNameRes.isErr()) {
            return new Err(
              new MCPError(updateNameRes.error.message, { tracked: false })
            );
          }
          updates.title = title.trim();
        }

        if (description !== undefined) {
          updates.description = description;
        }

        if (pinnedFramePath !== undefined) {
          const validation = await validatePinnedFramePath(
            auth,
            pod,
            pinnedFramePath
          );
          if (validation.isErr()) {
            return new Err(
              new MCPError(validation.error.message, { tracked: false })
            );
          }

          // Use the normalized path.
          updates.pinnedFramePath = validation.value;
        }

        const { title: _title, ...podUpdates } = updates;
        let metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
        if (!metadata) {
          metadata = await ProjectMetadataResource.makeNew(
            auth,
            pod,
            podUpdates
          );
        } else {
          await metadata.updateDescriptionAndPinnedFramePath(podUpdates);
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            ...updates,
            message: "Pod information updated successfully.",
          })
        );
      }, "Failed to edit Pod information");
    },

    [UPDATE_MEMBERS_TOOL_NAME]: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;

        if (!pod.canAdministrate(auth)) {
          return new Err(
            new MCPError("You do not have permission to update Pod members", {
              tracked: false,
            })
          );
        }

        const membersToAdd = params.membersToAdd ?? {};
        const membersToRemove = params.membersToRemove ?? [];
        const { editorIds: addEditorIds, memberIds: addMemberIds } =
          partitionMembersToAdd(membersToAdd);

        if (
          addMemberIds.length === 0 &&
          membersToRemove.length === 0 &&
          addEditorIds.length === 0
        ) {
          return new Err(
            new MCPError(
              "At least one of membersToAdd or membersToRemove must be provided",
              { tracked: false }
            )
          );
        }

        const roleByUserSId = await resolvePodUserRolesBySId(auth, pod);
        const { editorIds: removeEditorIds, memberIds: removeMemberIds } =
          partitionMembersToRemove(membersToRemove, roleByUserSId);

        const addedMembers: string[] = [];
        const removedMembers: string[] = [];
        const addedEditors: string[] = [];
        const removedEditors: string[] = [];

        if (addEditorIds.length > 0) {
          const uniqueAddEditorIds = [...new Set(addEditorIds)];
          const addEditorsRes = await pod.addEditors(auth, {
            userIds: uniqueAddEditorIds,
          });
          if (addEditorsRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to add editors: ${addEditorsRes.error.message}`,
                { tracked: false }
              )
            );
          }
          addedEditors.push(...addEditorsRes.value.map((user) => user.sId));
        }

        if (removeEditorIds.length > 0) {
          const uniqueRemoveEditorIds = [...new Set(removeEditorIds)];
          const removeEditorsRes = await pod.removeEditors(auth, {
            userIds: uniqueRemoveEditorIds,
          });
          if (removeEditorsRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to remove editors: ${removeEditorsRes.error.message}`,
                { tracked: false }
              )
            );
          }
          removedEditors.push(
            ...removeEditorsRes.value.map((user) => user.sId)
          );
        }

        if (addMemberIds.length > 0) {
          const uniqueAddIds = [...new Set(addMemberIds)];
          const addMembersRes = await pod.addMembers(auth, {
            userIds: uniqueAddIds,
          });
          if (addMembersRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to add members: ${addMembersRes.error.message}`,
                { tracked: false }
              )
            );
          }
          addedMembers.push(...addMembersRes.value.map((user) => user.sId));
          notifyPodMembersAdded(auth, {
            pod: pod.toJSON(),
            addedUserIds: addedMembers,
          });
        }

        if (removeMemberIds.length > 0) {
          const uniqueRemoveIds = [...new Set(removeMemberIds)];
          const removeMembersRes = await pod.removeMembers(auth, {
            userIds: uniqueRemoveIds,
          });
          if (removeMembersRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to remove members: ${removeMembersRes.error.message}`,
                { tracked: false }
              )
            );
          }
          removedMembers.push(
            ...removeMembersRes.value.map((user) => user.sId)
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            addedMembers,
            removedMembers,
            addedEditors,
            removedEditors,
            message: [
              "Pod members updated successfully.",
              addedEditors.length > 0
                ? ` Added editors: ${addedEditors.join(", ")}.`
                : "",
              removedEditors.length > 0
                ? ` Removed editors: ${removedEditors.join(", ")}.`
                : "",
              addedMembers.length > 0
                ? ` Added members: ${addedMembers.join(", ")}.`
                : "",
              removedMembers.length > 0
                ? ` Removed members: ${removedMembers.join(", ")}.`
                : "",
            ].join(""),
          })
        );
      }, "Failed to update Pod members");
    },

    get_information: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod: pod } = contextRes.value;
        const owner = auth.getNonNullableWorkspace();

        // Fetch project metadata
        const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);

        // Linked content nodes (Company Data references) have no other discovery surface, so we
        // surface them here. Pod files do (they live under `pod-{podId}/<rel>` scoped paths and are
        // discovered through the `files` MCP server), so we only report a count plus a hint.
        const attachments = await listProjectContextAttachments(auth, pod);
        const contentNodes = attachments
          .filter(isContentNodeAttachmentType)
          .map((node) => ({
            name: node.title,
            nodeId: node.nodeId,
            dataSourceViewId: node.nodeDataSourceViewId,
          }));

        const fsResult = await DustFileSystem.forPod(auth, pod);
        if (fsResult.isErr()) {
          return new Err(
            new MCPError("Failed to initialise file system for this Pod.", {
              tracked: true,
            })
          );
        }
        const podFilesResult = await fsResult.value.list(
          `${SCOPED_PREFIX_POD}${pod.sId}`
        );
        if (podFilesResult.isErr()) {
          return new Err(
            new MCPError("Failed to list Pod files.", { tracked: true })
          );
        }
        const projectFileCount = podFilesResult.value.filter(
          (e) => !e.isDirectory
        ).length;

        // Construct project URL
        const projectPath = getPodRoute(owner.sId, pod.sId);
        const projectUrl = `${config.getAppUrl()}${projectPath}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            pod: {
              id: pod.sId,
              name: pod.name,
              url: projectUrl,
              description: metadata?.description ?? null,
              pinnedFramePath: metadata?.pinnedFramePath ?? null,
              contentNodes,
              files: {
                count: projectFileCount,
                hint: `Use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` with \`scope: { type: "pod" }\` to enumerate.`,
              },
            },
            message: "Successfully retrieved Pod information",
          })
        );
      }, "Failed to get Pod information");
    },
    [LIST_MEMBERS_TOOL_NAME]: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
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
          await pod.fetchManualGroupsMemberships(auth, {
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
              message: `No members found in Pod "${pod.name}".`,
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
            message: `Found ${pageMembers.length} member(s) in Pod "${pod.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch more members." : ""}.`,
          })
        );
      }, "Failed to list Pod members");
    },
    list_pods: async (params) => {
      return withErrorHandling(async () => {
        const owner = auth.getNonNullableWorkspace();
        const workspaceSId = owner.sId;
        const { access = "member", q, limit = 20, pageCursor } = params;

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
              "Invalid pageCursor. Expected an offset cursor from a previous list_pods response.",
              { tracked: false }
            )
          );
        }

        const {
          pods: pagePods,
          total,
          hasMore,
        } = await listPodsForScope(auth, {
          access,
          q,
          pagination: { limit, pageOffset },
        });

        if (total === 0) {
          let emptyMessage: string;
          switch (access) {
            case "open":
              emptyMessage = q?.trim()
                ? `No open Pods found matching "${q.trim()}".`
                : "No non-archived open Pods found in this workspace.";
              break;
            case "member":
              emptyMessage = q?.trim()
                ? `No Pods found matching "${q.trim()}" where you are a member.`
                : "No non-archived Pods found where you are a space member.";
              break;
            default:
              assertNever(access);
          }

          return new Ok(
            makeSuccessResponse({
              success: true,
              count: 0,
              total: 0,
              hasMore: false,
              nextPageCursor: null,
              pods: [],
              message: emptyMessage,
            })
          );
        }

        const nextPageCursor = hasMore
          ? String(pageOffset + pagePods.length)
          : null;

        const pods = pagePods.map((pod) => ({
          id: pod.sId,
          name: pod.name,
          dustPod: {
            uri: makePodConfigurationURI(workspaceSId, pod.sId),
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
          },
        }));

        let accessLabel: string;
        switch (access) {
          case "open":
            accessLabel = "open Pod(s)";
            break;
          case "member":
            accessLabel = "Pod(s) you are a member of";
            break;
          default:
            assertNever(access);
        }
        const filterLabel = q?.trim() ? ` matching "${q.trim()}"` : "";

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: pods.length,
            total,
            hasMore,
            nextPageCursor,
            pods,
            message:
              `Found ${pods.length} of ${total} ${accessLabel}${filterLabel}.` +
              (hasMore
                ? " Pass nextPageCursor to fetch more Pods."
                : " Use each entry's dustPod as the dustPod argument for other pod_manager tools."),
          })
        );
      }, "Failed to list Pods");
    },
    create_pod: async (params) => {
      return withErrorHandling(async () => {
        const owner = auth.getNonNullableWorkspace();

        if (params.visibility === "open" && !areOpenPodsAllowed(owner)) {
          return new Err(
            new MCPError(
              "Open Pods are disabled by your workspace admin. Create a private Pod instead.",
              { tracked: false }
            )
          );
        }

        const createSpaceRes = await createSpaceAndGroup(auth, {
          name: params.title,
          isRestricted: params.visibility !== "open",
          spaceKind: "project",
          managementMode: "manual",
          memberIds: [],
        });

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

        // createSpaceAndGroup grants the creator editor access via a new group
        // membership. Refresh auth so this tool can administrate the Pod immediately
        // (e.g. addMembers, seedInitialTasks) and later tools see the membership.
        await auth.refresh();

        const pod = await SpaceResource.fetchById(
          auth,
          createSpaceRes.value.sId
        );
        if (!pod) {
          return new Err(
            new MCPError("Pod created but could not be retrieved.", {
              tracked: false,
            })
          );
        }

        if (params.description) {
          const metadata = await ProjectMetadataResource.fetchBySpace(
            auth,
            pod
          );
          if (metadata) {
            await metadata.updateDescription(params.description);
          } else {
            await ProjectMetadataResource.makeNew(auth, pod, {
              description: params.description,
            });
          }
        }

        const creatorId = auth.getNonNullableUser().sId;
        const membersToAdd = Object.fromEntries(
          Object.entries(params.membersToAdd ?? {}).filter(
            ([userId]) => userId !== creatorId
          )
        );
        const { editorIds: additionalEditorIds, memberIds } =
          partitionMembersToAdd(membersToAdd);

        if (additionalEditorIds.length > 0) {
          const addEditorsRes = await pod.addEditors(auth, {
            userIds: additionalEditorIds,
          });
          if (addEditorsRes.isErr()) {
            return new Err(
              new MCPError(
                `Pod created but failed to add some editors: ${addEditorsRes.error.message}`,
                { tracked: false }
              )
            );
          }
        }

        if (memberIds.length > 0) {
          const addMembersRes = await pod.addMembers(auth, {
            userIds: memberIds,
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

        if (params.seedInitialTasks) {
          const seedResult = await seedInitialPodTasks(auth, pod);
          if (
            seedResult.isErr() &&
            seedResult.error.code === "internal_error"
          ) {
            return new Err(
              new MCPError("Pod created but failed to seed initial tasks.", {
                tracked: false,
              })
            );
          }
        }

        const projectUrl = `${config.getAppUrl()}${getPodRoute(
          owner.sId,
          pod.sId
        )}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            pod: {
              id: pod.sId,
              title: pod.name,
              visibility: pod.isOpen() ? "open" : "private",
              dustPod: {
                uri: makePodConfigurationURI(owner.sId, pod.sId),
                mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
              },
              url: projectUrl,
            },
            message: `Pod "${pod.name}" created successfully.`,
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

        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
        const dataSources = await buildProjectRetrieveDataSources(auth, {
          space: pod,
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

    [SEMANTIC_SEARCH_TOOL_NAME]: async (params) => {
      return withErrorHandling(async () => {
        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError("No conversation context available", {
              tracked: false,
            })
          );
        }

        const scope = params.searchScope ?? "all";
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
        const dataSources = await buildPodSearchDataSources(auth, pod, scope);

        if (dataSources.length === 0) {
          return new Err(
            new MCPError(
              scope === "conversations"
                ? "No Pod data source available to search conversations, or the Pod connector is not linked (required to scope transcript documents)."
                : "No Pod data sources available to search for this scope.",
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
      }, "Failed to search Pod");
    },

    create_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritablePodContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
        const user = auth.user();
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
          spaceId: pod.id,
        });

        // Post user message
        const messageRes = await postUserMessage(auth, {
          conversation,
          content: params.message,
          mentions,
          context: {
            username: agentName,
            fullName: user
              ? `@${agentName} on behalf of ${user.fullName()}`
              : `@${agentName}`,
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
            message: `Conversation created successfully in Pod "${pod.name}"`,
          })
        );
      }, "Failed to create conversation");
    },

    list_conversations: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
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
              spaceId: pod.sId,
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
                text: `No conversations found in Pod "${pod.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
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
              message: `Found ${conversationsPayload.length} conversation(s) in Pod "${pod.name}" (page)${hasMore ? ". Pass nextPageCursor to fetch older updates in this window." : ""}.`,
            })
          );
        }

        const spaceConversations =
          await ConversationResource.listConversationsInSpace(auth, {
            spaceId: pod.sId,
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
              text: `No unread conversations found in Pod "${pod.name}" updated on or after ${new Date(updatedSinceMs).toISOString()}.`,
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
            message: `Found ${pageResources.length} unread conversation(s) in Pod "${pod.name}"${unreadResources.length > limit ? ` (showing first ${limit} of ${unreadResources.length})` : ""}.`,
          })
        );
      }, "Failed to list Pod conversations");
    },

    add_message_to_conversation: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritablePodContext(auth, {
          agentLoopContext,
          dustPod: params.dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
        const user = auth.user();
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
        if (conversation.spaceId !== pod.sId) {
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
            fullName: user
              ? `@${agentName} on behalf of ${user.fullName()}`
              : `@${agentName}`,
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
            message: `Message posted to conversation in Pod "${pod.name}".`,
          })
        );
      }, "Failed to add message to conversation");
    },
  };

  return buildTools(POD_MANAGER_TOOLS_METADATA, handlers);
}
