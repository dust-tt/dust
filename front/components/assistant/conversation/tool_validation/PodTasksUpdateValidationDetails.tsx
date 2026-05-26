import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import type {
  PodTasksUpdateTaskItemInput,
  PodTasksUpdateTasksInput,
} from "@app/lib/api/actions/servers/pod_tasks/types";
import {
  type MemberDisplayInfo,
  useMemberDetails,
} from "@app/lib/swr/assistants";
import { useWorkspaceProjectTask } from "@app/lib/swr/pods";
import {
  PROJECT_TASK_NO_ASSIGNEE_LABEL,
  type ProjectTaskStatus,
} from "@app/types/project_task";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Avatar, Checkbox, Chip, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface PodTasksUpdateValidationDetailsProps {
  input: PodTasksUpdateTasksInput;
  owner: LightWorkspaceType;
  user: UserType;
  conversationId?: string | null;
}

interface ChangeRowProps {
  label: string;
  before: string;
  after: string;
}

interface AssigneeChangeRowProps {
  currentAssigneeSId: string | null;
  nextAssigneeSId: string | null;
  currentUserSId: string;
  memberDisplayBySId: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
}

interface TaskUpdateRowProps {
  workspaceId: string;
  taskInput: PodTasksUpdateTaskItemInput;
  user: UserType;
}

interface FormatAssigneeLabelParams {
  userId: string | null | undefined;
  currentUserSId: string;
  memberDisplayBySId: Record<string, { fullName: string }>;
  isMembersLoading: boolean;
}

function formatTaskStatusLabel(status: ProjectTaskStatus): string {
  switch (status) {
    case "todo":
      return "Open";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
    default:
      assertNeverAndIgnore(status);
      return status;
  }
}

function normalizeAssigneeUserId(
  userId: string | null | undefined
): string | null {
  if (
    userId === null ||
    userId === undefined ||
    userId === "" ||
    userId === "null"
  ) {
    return null;
  }
  return userId;
}

function formatAssigneeLabel({
  userId,
  currentUserSId,
  memberDisplayBySId,
  isMembersLoading,
}: FormatAssigneeLabelParams): string {
  if (userId === null || userId === undefined) {
    return PROJECT_TASK_NO_ASSIGNEE_LABEL;
  }
  if (userId === currentUserSId) {
    return "You";
  }
  const member = memberDisplayBySId[userId];
  if (member) {
    return member.fullName;
  }
  if (isMembersLoading) {
    return "Loading…";
  }
  return userId;
}

function ChangeRow({ label, before, after }: ChangeRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground dark:text-foreground-night">
        <span className="text-muted-foreground line-through dark:text-muted-foreground-night">
          {before}
        </span>
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          →
        </span>
        <span className="font-medium">{after}</span>
      </div>
    </div>
  );
}

function AssigneeChangeRow({
  currentAssigneeSId,
  nextAssigneeSId,
  currentUserSId,
  memberDisplayBySId,
  isMembersLoading,
}: AssigneeChangeRowProps) {
  const beforeLabel = formatAssigneeLabel({
    userId: currentAssigneeSId,
    currentUserSId,
    memberDisplayBySId,
    isMembersLoading,
  });
  const afterLabel = formatAssigneeLabel({
    userId: nextAssigneeSId,
    currentUserSId,
    memberDisplayBySId,
    isMembersLoading,
  });
  const currentMember = currentAssigneeSId
    ? memberDisplayBySId[currentAssigneeSId]
    : null;
  const isUnassigning = nextAssigneeSId === null && currentAssigneeSId !== null;

  if (isUnassigning) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
          Assignee
        </span>
        <div className="flex items-center gap-3">
          <Avatar
            size="xs"
            visual={currentMember?.image ?? null}
            name={currentMember?.fullName ?? beforeLabel}
            isRounded
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground dark:text-foreground-night">
            {beforeLabel}
          </span>
          <Chip size="xs" color="rose" label="Unassign" />
        </div>
      </div>
    );
  }

  return <ChangeRow label="Assignee" before={beforeLabel} after={afterLabel} />;
}

function TaskUpdateRow({ workspaceId, taskInput, user }: TaskUpdateRowProps) {
  const { task: currentTask, isWorkspaceProjectTaskLoading } =
    useWorkspaceProjectTask({
      workspaceId,
      taskSId: taskInput.taskId,
    });

  const memberSIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentTask?.user?.sId) {
      ids.add(currentTask.user.sId);
    }
    if (taskInput.userId !== undefined) {
      const normalizedNextAssigneeSId = normalizeAssigneeUserId(
        taskInput.userId
      );
      if (normalizedNextAssigneeSId) {
        ids.add(normalizedNextAssigneeSId);
      }
    }
    return [...ids];
  }, [currentTask?.user?.sId, taskInput.userId]);

  const { membersBySId, isMembersLoading } = useMemberDetails({
    workspaceId,
    userIds: memberSIds,
  });

  const effectiveStatus: ProjectTaskStatus = taskInput.doneRationale
    ? "done"
    : (taskInput.status ?? currentTask?.status ?? "todo");

  const currentAssigneeSId = currentTask?.user?.sId ?? null;
  const nextAssigneeSId =
    taskInput.userId !== undefined
      ? normalizeAssigneeUserId(taskInput.userId)
      : currentAssigneeSId;

  const textChange =
    taskInput.text !== undefined && taskInput.text !== currentTask?.text;
  const assigneeChange =
    taskInput.userId !== undefined && nextAssigneeSId !== currentAssigneeSId;
  const currentStatus = currentTask?.status;
  const statusChange =
    currentStatus !== undefined && effectiveStatus !== currentStatus;
  const displayText = taskInput.text ?? currentTask?.text ?? taskInput.taskId;
  const isDone = effectiveStatus === "done";

  if (isWorkspaceProjectTaskLoading) {
    return (
      <div className="flex items-center justify-center px-3 py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="mt-0.5 shrink-0">
        <Checkbox size="xs" checked={isDone} disabled />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <p className="min-w-0 flex-1 break-words text-sm leading-5 text-foreground dark:text-foreground-night">
            {displayText}
          </p>
          {isDone && <Chip size="xs" color="green" label="Done" />}
        </div>

        {currentTask ? (
          <div className="mt-2 flex flex-col gap-2">
            {textChange && (
              <ChangeRow
                label="Description"
                before={currentTask.text}
                after={taskInput.text ?? currentTask.text}
              />
            )}
            {assigneeChange && (
              <AssigneeChangeRow
                currentAssigneeSId={currentAssigneeSId}
                nextAssigneeSId={nextAssigneeSId}
                currentUserSId={user.sId}
                memberDisplayBySId={membersBySId}
                isMembersLoading={isMembersLoading}
              />
            )}
            {statusChange && (
              <ChangeRow
                label="Status"
                before={formatTaskStatusLabel(currentTask.status)}
                after={formatTaskStatusLabel(effectiveStatus)}
              />
            )}
            {taskInput.doneRationale && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                  Done rationale
                </span>
                <p className="text-sm italic text-foreground dark:text-foreground-night">
                  {taskInput.doneRationale}
                </p>
              </div>
            )}
            {!textChange &&
              !assigneeChange &&
              !statusChange &&
              !taskInput.doneRationale && (
                <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  No visible changes detected.
                </p>
              )}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              Could not load the current task details.
            </p>
            {taskInput.text && (
              <ChangeRow
                label="Description"
                before="—"
                after={taskInput.text}
              />
            )}
            {taskInput.userId !== undefined &&
              normalizeAssigneeUserId(taskInput.userId) !== null && (
                <ChangeRow
                  label="Assignee"
                  before="—"
                  after={formatAssigneeLabel({
                    userId: normalizeAssigneeUserId(taskInput.userId),
                    currentUserSId: user.sId,
                    memberDisplayBySId: membersBySId,
                    isMembersLoading,
                  })}
                />
              )}
            {taskInput.userId !== undefined &&
              normalizeAssigneeUserId(taskInput.userId) === null && (
                <ChangeRow
                  label="Assignee"
                  before="—"
                  after={PROJECT_TASK_NO_ASSIGNEE_LABEL}
                />
              )}
            {taskInput.status && (
              <ChangeRow
                label="Status"
                before="—"
                after={formatTaskStatusLabel(taskInput.status)}
              />
            )}
            {taskInput.doneRationale && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                  Done rationale
                </span>
                <p className="text-sm italic text-foreground dark:text-foreground-night">
                  {taskInput.doneRationale}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PodTasksUpdateValidationDetails({
  input,
  owner,
  user,
  conversationId,
}: PodTasksUpdateValidationDetailsProps) {
  const { podLabel, isPodLabelLoading } = usePodLabel({
    owner,
    dustPodUri: input.dustPod?.uri,
    conversationId,
  });

  const taskCount = input.tasks.length;
  const doneCount = input.tasks.filter((task) => task.doneRationale).length;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        The agent wants to update{" "}
        <span className="font-medium text-foreground dark:text-foreground-night">
          {taskCount}
        </span>{" "}
        task{taskCount === 1 ? "" : "s"} in{" "}
        <span className="font-medium text-foreground dark:text-foreground-night">
          {isPodLabelLoading ? "Loading…" : podLabel}
        </span>
        .{doneCount > 0 && <> {doneCount} will be marked as done.</>}
      </p>

      <div className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background dark:divide-separator-night dark:border-separator-night dark:bg-background-night">
        {input.tasks.map((taskInput) => (
          <TaskUpdateRow
            key={taskInput.taskId}
            workspaceId={owner.sId}
            taskInput={taskInput}
            user={user}
          />
        ))}
      </div>
    </div>
  );
}
