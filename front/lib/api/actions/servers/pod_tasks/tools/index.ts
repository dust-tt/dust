import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  getPod,
  withErrorHandling,
} from "@app/lib/api/actions/servers/pod_manager/helpers";
import {
  CREATE_TASKS_TOOL_NAME,
  POD_TASKS_TOOLS_METADATA,
  START_TASK_AGENT_TOOL_NAME,
  UPDATE_TASKS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_tasks/metadata";
import { inferProjectTaskSourceFromUrl } from "@app/lib/api/actions/servers/pod_tasks/source_utils";
import { resolveAgentConfigurationIdByName } from "@app/lib/api/assistant/configuration/agent";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { startAgentForProjectTask } from "@app/lib/project_task/start_agent";
import {
  ProjectTaskResource,
  type UpdateBlob,
} from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodTaskActorType, PodTaskStatus } from "@app/types/project_task";
import { POD_TASK_NO_ASSIGNEE_LABEL } from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PodTaskUpdateItem = {
  taskId: string;
  text?: string;
  assigneeUserId?: string | null;
  doneRationale?: string;
  status?: PodTaskStatus;
  markAsDoneByType?: PodTaskActorType;
};

type DoneAttribution = Pick<
  UpdateBlob,
  | "markedAsDoneByType"
  | "markedAsDoneByUserId"
  | "markedAsDoneByAgentConfigurationId"
>;

export function doneAttribution(
  actorType: PodTaskActorType,
  actorUserId: ModelId | null,
  agentConfigId: string | null
): DoneAttribution {
  switch (actorType) {
    case "user":
      return {
        markedAsDoneByType: "user",
        markedAsDoneByUserId: actorUserId,
        markedAsDoneByAgentConfigurationId: null,
      };
    case "agent":
      return {
        markedAsDoneByType: "agent",
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: agentConfigId,
      };
    default:
      return assertNever(actorType);
  }
}

export function statusTransitionUpdates(
  nextStatus: PodTaskStatus,
  actorType: PodTaskActorType,
  actorUserId: ModelId | null,
  agentConfigId: string | null
): UpdateBlob {
  switch (nextStatus) {
    case "done":
      return {
        status: "done",
        doneAt: new Date(),
        ...doneAttribution(actorType, actorUserId, agentConfigId),
      };
    case "todo":
    case "in_progress":
      return {
        status: nextStatus,
        doneAt: null,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
      };
    default:
      return assertNever(nextStatus);
  }
}

async function resolveAssigneeUpdate(
  space: SpaceResource,
  workspaceId: string,
  itemUserId: string | null | undefined
): Promise<Result<{ userId?: number | null }, DustError<"user_not_member">>> {
  if (itemUserId === undefined) {
    return new Ok({ userId: undefined });
  }
  if (itemUserId === null) {
    return new Ok({ userId: null });
  }
  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    itemUserId,
    workspaceId
  );
  if (!space.isMember(userAuth)) {
    return new Err(
      new DustError(
        "user_not_member",
        `User ${itemUserId} is not a member of the Pod.`
      )
    );
  }
  return new Ok({ userId: userAuth.getNonNullableUser().id });
}

export function rationaleUpdate(
  item: PodTaskUpdateItem,
  prevStatus: PodTaskStatus,
  nextStatus: PodTaskStatus
): Pick<UpdateBlob, "actorRationale"> {
  if (item.doneRationale !== undefined) {
    return { actorRationale: item.doneRationale };
  }
  if (nextStatus !== "done" && prevStatus === "done") {
    return { actorRationale: null };
  }
  return {};
}

export async function buildTaskUpdatePayload(
  auth: Authenticator,
  space: SpaceResource,
  row: ProjectTaskResource,
  item: PodTaskUpdateItem,
  agentConfigId: string | null
): Promise<Result<{ taskUpdates: UpdateBlob }, DustError<"user_not_member">>> {
  const actorUserId = auth.user()?.id ?? null;
  const workspaceSId = auth.getNonNullableWorkspace().sId;

  const nextStatus: PodTaskStatus = item.doneRationale
    ? "done"
    : (item.status ?? row.status);

  const updates: UpdateBlob = {
    ...(nextStatus !== row.status
      ? statusTransitionUpdates(
          nextStatus,
          item.markAsDoneByType ?? "agent",
          actorUserId,
          agentConfigId
        )
      : {}),
    ...rationaleUpdate(item, row.status, nextStatus),
    ...(item.text !== undefined ? { text: item.text } : {}),
  };

  const assignee = await resolveAssigneeUpdate(
    space,
    workspaceSId,
    item.assigneeUserId
  );
  if (assignee.isErr()) {
    return assignee;
  }

  if (assignee.value.userId !== undefined) {
    updates.userId = assignee.value.userId;
  }

  return new Ok({ taskUpdates: updates });
}

function formatTaskListingLine(row: ProjectTaskResource): string {
  const json = row.toJSON();
  const assigneePart = json.user
    ? `${json.user.fullName} (${json.user.sId})`
    : POD_TASK_NO_ASSIGNEE_LABEL;
  const lines = [
    `- [${json.sId}] ${json.text}`,
    ` Assignee: ${assigneePart} | Status: ${json.status} | Created: ${json.createdAt.toISOString().slice(0, 10)}`,
  ];
  if (row.doneAt) {
    lines.push(`  Done: ${row.doneAt.toISOString().slice(0, 10)}`);
  }
  return lines.join("\n");
}

export function createProjectTasksTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const owner = auth.getNonNullableWorkspace();
  const handlers: ToolHandlers<typeof POD_TASKS_TOOLS_METADATA> = {
    list_tasks: async ({
      assigneeFilter = "mine",
      statusFilter = "all",
      daysAgo = 7,
      dustPod,
    }) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }
        const { pod } = contextRes.value;

        let rows: ProjectTaskResource[] = [];

        if (assigneeFilter === "mine") {
          rows = await ProjectTaskResource.fetchLatestBySpace(auth, {
            spaceId: pod.id,
          });
        } else if (assigneeFilter === "all") {
          rows = await ProjectTaskResource.fetchBySpace(auth, {
            spaceId: pod.id,
            timeScope: "all",
          });
        }

        const cutoff = new Date(Date.now() - daysAgo * MS_PER_DAY);

        if (statusFilter === "open") {
          rows = rows.filter((t) => t.status !== "done");
        } else if (statusFilter === "done") {
          rows = rows.filter(
            (t) =>
              t.status === "done" && t.doneAt !== null && t.doneAt >= cutoff
          );
        } else {
          // "all": keep open items as-is; limit done items by daysAgo.
          rows = rows.filter(
            (t) =>
              t.status !== "done" || (t.doneAt !== null && t.doneAt >= cutoff)
          );
        }

        if (rows.length === 0) {
          return new Ok([{ type: "text" as const, text: "No tasks found." }]);
        }

        if (statusFilter === "done") {
          rows.sort(
            (a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0)
          );
          const lines: string[] = [
            `Found ${rows.length} completed task(s) in the last ${daysAgo} day(s):\n`,
          ];
          for (const row of rows) {
            lines.push(formatTaskListingLine(row));
          }
          return new Ok([{ type: "text" as const, text: lines.join("\n") }]);
        }
        const assigneeLabel = assigneeFilter === "mine" ? "you" : "everyone";
        const label =
          statusFilter === "open"
            ? `Found ${rows.length} open task(s) for ${assigneeLabel}:\n`
            : `Found ${rows.length} task(s) for ${assigneeLabel}:\n`;

        const lines: string[] = [label];
        for (const row of rows) {
          lines.push(formatTaskListingLine(row));
        }

        return new Ok([{ type: "text" as const, text: lines.join("\n") }]);
      }, "Failed to list tasks");
    },

    [CREATE_TASKS_TOOL_NAME]: async ({ creatorType, tasks, dustPod }) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }
        const { pod } = contextRes.value;

        const assignmentPool =
          await pod.fetchDistinctActiveManualGroupMembers(auth);
        const soleAssigneeModelId =
          assignmentPool.length === 1 ? assignmentPool[0]!.id : null;

        const currentUser = auth.getNonNullableUser();
        const agentConfigId =
          agentLoopContext?.runContext?.agentConfiguration?.sId ?? null;

        const created: string[] = [];
        const errors: string[] = [];
        for (const item of tasks) {
          let newUserId: ModelId | null = null;
          if (typeof item.userId === "string") {
            const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
              item.userId,
              owner.sId
            );
            if (!contextRes.value.pod.isMember(userAuth)) {
              errors.push(
                `Could not create task ${item.text} for user ${item.userId} because they are not a member of the Pod.`
              );
              continue;
            }
            newUserId = userAuth.getNonNullableUser().id;
          } else if (
            soleAssigneeModelId !== null &&
            (item.userId === undefined || item.userId === null)
          ) {
            newUserId = soleAssigneeModelId;
          }

          const row = await ProjectTaskResource.makeNew(auth, {
            spaceId: pod.id,
            userId: newUserId,
            createdByType: creatorType,
            createdByAgentConfigurationId:
              creatorType === "agent" ? agentConfigId : null,
            createdByUserId: creatorType === "user" ? currentUser.id : null,
            text: item.text,
            status: item.doneRationale ? "done" : "todo",
            doneAt: item.doneRationale ? new Date() : null,
            actorRationale: item.doneRationale ?? null,
            agentInstructions: null,
          });

          // Record the conversation where the task was created as a source so
          // it surfaces in the kickoff prompt when the task is started.
          const sourceConversation = agentLoopContext?.runContext?.conversation;
          if (sourceConversation) {
            await row.upsertSource(auth, {
              itemId: sourceConversation.sId,
              source: {
                sourceType: "project_conversation",
                sourceId: sourceConversation.sId,
                sourceTitle: sourceConversation.title ?? "Source conversation",
                sourceUrl: `${config.getAppUrl()}${getConversationRoute(owner.sId, sourceConversation.sId)}`,
              },
            });
          }

          if (item.sources) {
            for (const sourceInput of item.sources) {
              const source = inferProjectTaskSourceFromUrl({
                url: sourceInput.url,
                title: sourceInput.title,
              });
              await row.upsertSource(auth, {
                itemId: sourceInput.url,
                source,
              });
            }
          }

          created.push(formatTaskListingLine(row));
        }

        return new Ok([
          {
            type: "text" as const,
            text: [
              `Created ${created.length} task(s):\n${created.join("\n")}`,
              ...errors.map((error) => `- ${error}`),
            ].join("\n"),
          },
        ]);
      }, "Failed to create tasks");
    },

    [UPDATE_TASKS_TOOL_NAME]: async ({ tasks, dustPod }) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }
        const { pod } = contextRes.value;

        const agentConfigId =
          agentLoopContext?.runContext?.agentConfiguration?.sId ?? null;

        const updated: string[] = [];
        const errors: string[] = [];

        for (const item of tasks) {
          const row = await ProjectTaskResource.fetchBySId(auth, item.taskId);

          if (!row) {
            errors.push(`Task not found: ${item.taskId}`);
            continue;
          }

          const payloadRes = await buildTaskUpdatePayload(
            auth,
            pod,
            row,
            item,
            agentConfigId
          );
          if (payloadRes.isErr()) {
            errors.push(payloadRes.error.message);
            continue;
          }

          const { taskUpdates } = payloadRes.value;

          if (Object.keys(taskUpdates).length === 0) {
            updated.push(formatTaskListingLine(row));
            continue;
          }

          const updatedRow = await row.updateWithVersion(auth, taskUpdates);
          updated.push(formatTaskListingLine(updatedRow));
        }

        return new Ok([
          {
            type: "text" as const,
            text: [
              `Updated ${updated.length} task(s):`,
              ...updated.map((line) => line),
              ...errors.map((error) => `- ${error}`),
            ].join("\n"),
          },
        ]);
      }, "Failed to update tasks");
    },

    [START_TASK_AGENT_TOOL_NAME]: async ({
      taskId,
      agentName,
      customMessage,
      dustPod,
    }) => {
      return withErrorHandling(async () => {
        const contextRes = await getPod(auth, {
          agentLoopContext,
          dustPod,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { pod } = contextRes.value;
        let agentConfigurationId: string | undefined;
        if (agentName) {
          const matchedAgentId = await resolveAgentConfigurationIdByName(
            auth,
            agentName
          );
          if (!matchedAgentId) {
            return new Err(
              new MCPError(`No agent found matching name: "${agentName}"`, {
                tracked: false,
              })
            );
          }
          agentConfigurationId = matchedAgentId;
        }

        const startRes = await startAgentForProjectTask(auth, {
          space: pod,
          taskId,
          agentConfigurationId,
          customMessage,
        });

        if (startRes.isErr()) {
          return new Err(
            new MCPError(startRes.error.message, {
              tracked: false,
            })
          );
        }

        const conversationUrl = `${config.getAppUrl()}${getConversationRoute(
          owner.sId,
          startRes.value.conversationId
        )}`;

        return new Ok([
          {
            type: "text" as const,
            text:
              startRes.value.action === "created"
                ? `Started task work for ${taskId} by creating a new conversation: ${startRes.value.conversationId}. Conversation URL: ${conversationUrl}`
                : `Started task work for ${taskId} by appending a new message to existing conversation: ${startRes.value.conversationId}. Conversation URL: ${conversationUrl}`,
          },
        ]);
      }, "Failed to start task work");
    },
  };

  return buildTools(POD_TASKS_TOOLS_METADATA, handlers);
}
