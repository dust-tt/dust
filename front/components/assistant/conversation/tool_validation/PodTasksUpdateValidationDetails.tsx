import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import type {
  PodTasksUpdateTaskItemInput,
  PodTasksUpdateTasksInput,
} from "@app/lib/api/actions/servers/pod_tasks/types";
import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import { useMemberDetails } from "@app/lib/swr/assistants";
import { useWorkspacePodTask } from "@app/lib/swr/pods";
import type { PodTaskStatus } from "@app/types/project_task";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Avatar, Checkbox, Chip, Spinner } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

type Translate = (descriptor: MessageDescriptor) => string;

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
  currentAssigneeId: string | null;
  nextAssigneeId: string | null;
  currentUserId: string;
  memberDisplayById: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
}

interface TaskUpdateRowProps {
  workspaceId: string;
  taskInput: PodTasksUpdateTaskItemInput;
  user: UserType;
}

interface FormatAssigneeLabelParams {
  userId: string | null | undefined;
  currentUserId: string;
  memberDisplayById: Record<string, { fullName: string }>;
  isMembersLoading: boolean;
  t: Translate;
}

function formatTaskStatusLabel(status: PodTaskStatus, t: Translate): string {
  switch (status) {
    case "todo":
      return t(msg({ message: "Open", context: "task status" }));
    case "in_progress":
      return t(msg`In progress`);
    case "done":
      return t(msg({ message: "Done", context: "task status" }));
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
  currentUserId,
  memberDisplayById,
  isMembersLoading,
  t,
}: FormatAssigneeLabelParams): string {
  if (userId === null || userId === undefined) {
    return t(msg`No assignee`);
  }
  if (userId === currentUserId) {
    return t(msg`You`);
  }
  const member = memberDisplayById[userId];
  if (member) {
    return member.fullName;
  }
  if (isMembersLoading) {
    return t(msg`Loading…`);
  }
  return userId;
}

function ChangeRow({ label, before, after }: ChangeRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span className="text-muted-foreground line-through">{before}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{after}</span>
      </div>
    </div>
  );
}

function AssigneeChangeRow({
  currentAssigneeId,
  nextAssigneeId,
  currentUserId,
  memberDisplayById,
  isMembersLoading,
}: AssigneeChangeRowProps) {
  const { t } = useLingui();
  const beforeLabel = formatAssigneeLabel({
    userId: currentAssigneeId,
    currentUserId,
    memberDisplayById,
    isMembersLoading,
    t,
  });
  const afterLabel = formatAssigneeLabel({
    userId: nextAssigneeId,
    currentUserId,
    memberDisplayById,
    isMembersLoading,
    t,
  });
  const currentMember = currentAssigneeId
    ? memberDisplayById[currentAssigneeId]
    : null;
  const isUnassigning = nextAssigneeId === null && currentAssigneeId !== null;

  if (isUnassigning) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          <Trans>Assignee</Trans>
        </span>
        <div className="flex items-center gap-3">
          <Avatar
            size="xs"
            visual={currentMember?.image ?? null}
            name={currentMember?.fullName ?? beforeLabel}
            isRounded
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {beforeLabel}
          </span>
          <Chip size="xs" color="warning" label={t`Unassign`} />
        </div>
      </div>
    );
  }

  return (
    <ChangeRow label={t`Assignee`} before={beforeLabel} after={afterLabel} />
  );
}

function TaskUpdateRow({ workspaceId, taskInput, user }: TaskUpdateRowProps) {
  const { t } = useLingui();
  const {
    task: currentTask,
    isWorkspacePodTaskLoading: isWorkspaceProjectTaskLoading,
  } = useWorkspacePodTask({
    workspaceId,
    taskId: taskInput.taskId,
  });

  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentTask?.user?.sId) {
      ids.add(currentTask.user.sId);
    }
    if (taskInput.assigneeUserId !== undefined) {
      const normalizedNextAssigneeId = normalizeAssigneeUserId(
        taskInput.assigneeUserId
      );
      if (normalizedNextAssigneeId) {
        ids.add(normalizedNextAssigneeId);
      }
    }
    return [...ids];
  }, [currentTask?.user?.sId, taskInput.assigneeUserId]);

  const { membersById, isMembersLoading } = useMemberDetails({
    workspaceId,
    userIds: memberIds,
  });

  const effectiveStatus: PodTaskStatus = taskInput.doneRationale
    ? "done"
    : (taskInput.status ?? currentTask?.status ?? "todo");

  const currentAssigneeId = currentTask?.user?.sId ?? null;
  const nextAssigneeId =
    taskInput.assigneeUserId !== undefined
      ? normalizeAssigneeUserId(taskInput.assigneeUserId)
      : currentAssigneeId;

  const textChange =
    taskInput.text !== undefined && taskInput.text !== currentTask?.text;
  const assigneeChange =
    taskInput.assigneeUserId !== undefined &&
    nextAssigneeId !== currentAssigneeId;
  const currentStatus = currentTask?.status;
  const statusChange =
    currentStatus !== undefined && effectiveStatus !== currentStatus;
  const displayText = taskInput.text ?? currentTask?.text ?? taskInput.taskId;
  const isDone = effectiveStatus === "done";
  const markedDoneByLabel =
    taskInput.markAsDoneByType === "user"
      ? t({ message: "you", context: "marked done by" })
      : t({ message: "agent", context: "marked done by" });

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
        <Checkbox checked={isDone} disabled />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <p className="min-w-0 flex-1 break-words text-sm leading-5 text-foreground">
            {displayText}
          </p>
          {isDone && (
            <Chip
              size="xs"
              color="success"
              label={t({ message: "Done", context: "task status" })}
            />
          )}
        </div>

        {currentTask ? (
          <div className="mt-2 flex flex-col gap-2">
            {textChange && (
              <ChangeRow
                label={t`Description`}
                before={currentTask.text}
                after={taskInput.text ?? currentTask.text}
              />
            )}
            {assigneeChange && (
              <AssigneeChangeRow
                currentAssigneeId={currentAssigneeId}
                nextAssigneeId={nextAssigneeId}
                currentUserId={user.sId}
                memberDisplayById={membersById}
                isMembersLoading={isMembersLoading}
              />
            )}
            {statusChange && (
              <ChangeRow
                label={t`Status`}
                before={formatTaskStatusLabel(currentTask.status, t)}
                after={formatTaskStatusLabel(effectiveStatus, t)}
              />
            )}
            {statusChange && effectiveStatus === "done" && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <Trans>Marked done by</Trans>
                </span>
                <span className="text-sm font-medium text-foreground">
                  {markedDoneByLabel}
                </span>
              </div>
            )}
            {taskInput.doneRationale && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <Trans>Done rationale</Trans>
                </span>
                <p className="text-sm italic text-foreground">
                  {taskInput.doneRationale}
                </p>
              </div>
            )}
            {!textChange &&
              !assigneeChange &&
              !statusChange &&
              !taskInput.doneRationale && (
                <p className="text-xs text-muted-foreground">
                  <Trans>No visible changes detected.</Trans>
                </p>
              )}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              <Trans>Could not load the current task details.</Trans>
            </p>
            {taskInput.text && (
              <ChangeRow
                label={t`Description`}
                before="—"
                after={taskInput.text}
              />
            )}
            {taskInput.assigneeUserId !== undefined &&
              normalizeAssigneeUserId(taskInput.assigneeUserId) !== null && (
                <ChangeRow
                  label={t`Assignee`}
                  before="—"
                  after={formatAssigneeLabel({
                    userId: normalizeAssigneeUserId(taskInput.assigneeUserId),
                    currentUserId: user.sId,
                    memberDisplayById: membersById,
                    isMembersLoading,
                    t,
                  })}
                />
              )}
            {taskInput.assigneeUserId !== undefined &&
              normalizeAssigneeUserId(taskInput.assigneeUserId) === null && (
                <ChangeRow
                  label={t`Assignee`}
                  before="—"
                  after={t`No assignee`}
                />
              )}
            {taskInput.status && (
              <ChangeRow
                label={t`Status`}
                before="—"
                after={formatTaskStatusLabel(taskInput.status, t)}
              />
            )}
            {(taskInput.status === "done" || taskInput.doneRationale) && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <Trans>Marked done by</Trans>
                </span>
                <span className="text-sm font-medium text-foreground">
                  {markedDoneByLabel}
                </span>
              </div>
            )}
            {taskInput.doneRationale && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  <Trans>Done rationale</Trans>
                </span>
                <p className="text-sm italic text-foreground">
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
  const { t } = useLingui();
  const { podLabel, isPodLabelLoading } = usePodLabel({
    owner,
    dustPodUri: input.dustPod?.uri,
    conversationId,
  });

  const taskCount = input.tasks.length;
  const doneCount = input.tasks.filter((task) => task.doneRationale).length;
  const podName = isPodLabelLoading ? t`Loading…` : podLabel;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        <Trans>
          The agent wants to update{" "}
          <span className="font-medium text-foreground">{taskCount}</span>{" "}
          <Plural value={taskCount} one="task" other="tasks" /> in{" "}
          <span className="font-medium text-foreground">{podName}</span>.
        </Trans>
        {doneCount > 0 && (
          <>
            {" "}
            <Plural
              value={doneCount}
              one="# will be marked as done."
              other="# will be marked as done."
            />
          </>
        )}
      </p>

      <div className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background">
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
