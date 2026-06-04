import {
  normalizePodTaskSearchNeedle,
  TASK_DESKTOP_HOVER_REVEAL_CLASS,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import {
  POD_TASK_NO_ASSIGNEE_LABEL,
  type PodTaskType,
} from "@app/types/project_task";
import {
  Avatar,
  Button,
  cn,
  DotsHorizontalV2,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Trash01V2,
  User01V2,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

const NO_ASSIGNEE_LABEL_NEEDLE = normalizePodTaskSearchNeedle(
  POD_TASK_NO_ASSIGNEE_LABEL
);

interface TaskOverflowMenuProps {
  task: PodTaskType;
}

export function TaskOverflowMenu({ task }: TaskOverflowMenuProps) {
  const {
    viewerUserId,
    podMembers,
    membersWithActiveTaskIds,
    patchTaskItem,
    requestDelete,
    isSolePodMember: isSoleProjectMember,
  } = usePodTasksPanel();

  const [reassignSearch, setReassignSearch] = useState("");

  const allowAssigneeReassign = !isSoleProjectMember;
  const reassignSearchNeedle = normalizePodTaskSearchNeedle(reassignSearch);

  const filteredReassignMembers = useMemo(() => {
    const filtered = reassignSearchNeedle
      ? podMembers.filter((m) =>
          normalizePodTaskSearchNeedle(m.fullName).includes(
            reassignSearchNeedle
          )
        )
      : [...podMembers];
    // Members with active (non-done) tasks come first.
    return filtered.sort((a, b) => {
      const aActive = membersWithActiveTaskIds.has(a.sId) ? 0 : 1;
      const bActive = membersWithActiveTaskIds.has(b.sId) ? 0 : 1;
      return aActive - bActive;
    });
  }, [reassignSearchNeedle, podMembers, membersWithActiveTaskIds]);

  const showNoAssigneeReassignOption =
    task.user !== null &&
    (reassignSearchNeedle === "" ||
      NO_ASSIGNEE_LABEL_NEEDLE.includes(reassignSearchNeedle));

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          setReassignSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Task actions"
          icon={DotsHorizontalV2}
          size="xs"
          variant="ghost"
          className={cn(
            TASK_DESKTOP_HOVER_REVEAL_CLASS,
            "data-[state=open]:opacity-100"
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8}>
        {allowAssigneeReassign && (
          <DropdownMenuSub
            onOpenChange={(subOpen) => {
              if (subOpen) {
                setReassignSearch("");
              }
            }}
          >
            <DropdownMenuSubTrigger
              label="Reassign"
              icon={User01V2}
              disabled={podMembers.length === 0 && task.user === null}
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                collisionPadding={8}
                alignOffset={-4}
                className="max-w-[var(--radix-dropdown-menu-content-available-width)]"
              >
                <DropdownMenuSearchbar
                  autoFocus
                  name={`reassign-task-${task.sId}`}
                  placeholder="Search members"
                  value={reassignSearch}
                  onChange={setReassignSearch}
                />
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto">
                  {showNoAssigneeReassignOption ||
                  filteredReassignMembers.length > 0 ? (
                    <>
                      {showNoAssigneeReassignOption && (
                        <>
                          <DropdownMenuItem
                            key={`reassign-task-${task.sId}-none`}
                            label={POD_TASK_NO_ASSIGNEE_LABEL}
                            onClick={() => {
                              void patchTaskItem(task.sId, {
                                assigneeUserId: null,
                              });
                            }}
                          />
                          {filteredReassignMembers.length > 0 ? (
                            <DropdownMenuSeparator />
                          ) : null}
                        </>
                      )}
                      {filteredReassignMembers.map((member) => (
                        <DropdownMenuItem
                          key={`reassign-task-${task.sId}-${member.sId}`}
                          label={`${member.fullName}${viewerUserId === member.sId ? " (you)" : ""}`}
                          disabled={member.sId === task.user?.sId}
                          icon={() => (
                            <Avatar
                              size="xxs"
                              isRounded
                              visual={
                                member.image ??
                                "/static/humanavatar/anonymous.png"
                              }
                            />
                          )}
                          onClick={() => {
                            void patchTaskItem(task.sId, {
                              assigneeUserId: member.sId,
                            });
                          }}
                        />
                      ))}
                    </>
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No members found
                    </div>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem
          label="Delete task"
          icon={Trash01V2}
          variant="warning"
          onClick={() => {
            void requestDelete(task);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
