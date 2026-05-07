import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import {
  normalizeProjectTaskSearchNeedle,
  TASK_DESKTOP_HOVER_REVEAL_CLASS,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import {
  PROJECT_TASK_NO_ASSIGNEE_LABEL,
  type ProjectTaskType,
} from "@app/types/project_task";
import {
  Avatar,
  Button,
  cn,
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
  MoreIcon,
  TrashIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useMemo, useState } from "react";

const NO_ASSIGNEE_LABEL_NEEDLE = normalizeProjectTaskSearchNeedle(
  PROJECT_TASK_NO_ASSIGNEE_LABEL
);

interface TaskOverflowMenuProps {
  task: ProjectTaskType;
}

export function TaskOverflowMenu({ task }: TaskOverflowMenuProps) {
  const {
    viewerUserId,
    projectMembers,
    membersWithActiveTaskIds,
    patchTaskItem,
    requestDelete,
    isSoleProjectMember,
  } = useProjectTasksPanel();

  const [open, setOpen] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");

  const allowAssigneeReassign = !isSoleProjectMember;
  const reassignSearchNeedle = normalizeProjectTaskSearchNeedle(reassignSearch);

  const filteredReassignMembers = useMemo(() => {
    const filtered = reassignSearchNeedle
      ? projectMembers.filter((m) =>
          normalizeProjectTaskSearchNeedle(m.fullName).includes(
            reassignSearchNeedle
          )
        )
      : [...projectMembers];
    // Members with at least one active (non-done) task come first; alphabetical
    // order is preserved within each group.
    return filtered.sort((a, b) => {
      const aActive = membersWithActiveTaskIds.has(a.sId) ? 0 : 1;
      const bActive = membersWithActiveTaskIds.has(b.sId) ? 0 : 1;
      return aActive - bActive;
    });
  }, [reassignSearchNeedle, projectMembers, membersWithActiveTaskIds]);

  const showNoAssigneeReassignOption =
    task.user !== null &&
    (reassignSearchNeedle === "" ||
      NO_ASSIGNEE_LABEL_NEEDLE.includes(reassignSearchNeedle));

  return (
    <div
      className={cn(
        "transition-opacity",
        !open && TASK_DESKTOP_HOVER_REVEAL_CLASS
      )}
    >
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setReassignSearch("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Task actions"
            icon={MoreIcon}
            size="xs"
            variant="ghost"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
                icon={UserIcon}
                disabled={projectMembers.length === 0 && task.user === null}
              />
              <DropdownMenuPortal>
                <DropdownMenuSubContent alignOffset={-4} className="w-80">
                  <DropdownMenuSearchbar
                    autoFocus
                    name={`reassign-task-${task.sId}`}
                    placeholder="Search members"
                    value={reassignSearch}
                    onChange={setReassignSearch}
                  />
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-auto">
                    {showNoAssigneeReassignOption ||
                    filteredReassignMembers.length > 0 ? (
                      <>
                        {showNoAssigneeReassignOption && (
                          <>
                            <DropdownMenuItem
                              key={`reassign-task-${task.sId}-none`}
                              label={PROJECT_TASK_NO_ASSIGNEE_LABEL}
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await patchTaskItem(task.sId, {
                                      assigneeUserId: null,
                                    });
                                  } finally {
                                    setOpen(false);
                                  }
                                })();
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
                              void (async () => {
                                try {
                                  if (member.sId !== task.user?.sId) {
                                    await patchTaskItem(task.sId, {
                                      assigneeUserId: member.sId,
                                    });
                                  }
                                } finally {
                                  setOpen(false);
                                }
                              })();
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
            icon={TrashIcon}
            variant="warning"
            onClick={() => {
              setOpen(false);
              void requestDelete(task);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
