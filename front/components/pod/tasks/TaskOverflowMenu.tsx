import {
  normalizePodTaskSearchNeedle,
  TASK_DESKTOP_HOVER_REVEAL_CLASS,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import type { PodTaskType } from "@app/types/project_task";
import type { SpaceUserType } from "@app/types/user";
import {
  Avatar,
  Button,
  cn,
  DotsHorizontal,
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
  Trash01,
  User01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

interface TaskOverflowMenuProps {
  task: PodTaskType;
}

export function TaskOverflowMenu({ task }: TaskOverflowMenuProps) {
  const { t } = useLingui();
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

  const formatMemberLabel = (member: SpaceUserType) => {
    const memberName = member.fullName;
    return viewerUserId === member.sId ? t`${memberName} (you)` : memberName;
  };

  const noAssigneeLabel = t`No assignee`;
  const showNoAssigneeReassignOption =
    task.user !== null &&
    (reassignSearchNeedle === "" ||
      normalizePodTaskSearchNeedle(noAssigneeLabel).includes(
        reassignSearchNeedle
      ));

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
          aria-label={t`Task actions`}
          icon={DotsHorizontal}
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
              label={t`Reassign`}
              icon={User01}
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
                  placeholder={t`Search members`}
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
                            label={noAssigneeLabel}
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
                          label={formatMemberLabel(member)}
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
                      <Trans>No members found</Trans>
                    </div>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem
          label={t`Delete task`}
          icon={Trash01}
          variant="warning"
          onClick={() => {
            void requestDelete(task);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
