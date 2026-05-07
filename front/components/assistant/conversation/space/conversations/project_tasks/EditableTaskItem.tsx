import { ConversationSidebarStatusDot } from "@app/components/assistant/conversation/ConversationSidebarStatusDot";
import { ProjectTaskStartWorkingDropdown } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskStartWorkingDropdown";
import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import {
  TaskMetadataTooltip,
  TaskSources,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/TaskSubComponents";
import {
  NEW_MANUAL_TASK_MAX_CHARS,
  stripNewlines,
  TODO_TEXTAREA_FIELD_CLASS,
  useAutosizeTextArea,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { useAppRouter } from "@app/lib/platform";
import { removeDiacritics } from "@app/lib/utils";
import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { getConversationRoute } from "@app/lib/utils/router";
import {
  PROJECT_TASK_NO_ASSIGNEE_LABEL,
  type ProjectTaskType,
} from "@app/types/project_task";
import {
  AnimatedText,
  Avatar,
  Button,
  ChatBubbleLeftRightIcon,
  Checkbox,
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
  Tooltip,
  TrashIcon,
  TypingAnimation,
  UserIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface EditableTaskItemProps {
  task: ProjectTaskType;
}

export function EditableTaskItem({ task }: EditableTaskItemProps) {
  const {
    viewerUserId,
    owner,
    activeAgents,
    isAgentsLoading,
    agentNameById,
    newItemKeys,
    doneFlashKeys,
    startingTaskIds,
    isReadOnly,
    firstOnboardingTaskId,
    projectMembers,
    membersWithActiveTaskIds,
    handleToggleDone,
    requestDelete,
    handleStartWorking,
    patchTaskItem,
    isSoleProjectMember,
  } = useProjectTasksPanel();

  const isNew = newItemKeys.has(task.sId);
  const isNewlyDone = doneFlashKeys.has(task.sId);
  const isStarting = startingTaskIds.has(task.sId);
  const isFirstOnboardingTask = task.sId === firstOnboardingTaskId;
  const allowAssigneeReassign = !isSoleProjectMember;

  const router = useAppRouter();
  const [startMenuOpen, setStartMenuOpen] = useState(false);

  const isDone = task.status === "done";
  const hasConversationLink =
    (task.status === "in_progress" || task.status === "done") &&
    !!task.conversationId;
  const conversationDotStatus: ConversationDotStatus =
    task.conversationSidebarStatus ?? "idle";
  const isDoneWithoutConversation = isDone && !hasConversationLink;
  const canEdit = viewerUserId !== null && !isReadOnly;
  const showInProgressTextAnimation = task.status === "in_progress";
  const [showSavedPulse, setShowSavedPulse] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.text);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const blurCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCommittingRef = useRef(false);
  const clickOffsetRef = useRef<number | null>(null);
  const [typingDismissed, setTypingDismissed] = useState(false);
  const measureRef = useRef<HTMLSpanElement>(null);
  const typingAnimationLockedTextRef = useRef<string | null>(null);

  const displayText = stripNewlines(task.text);
  const showTypingAnimation = isNew && !typingDismissed;

  useEffect(() => {
    if (!isNew) {
      typingAnimationLockedTextRef.current = null;
    }
  }, [isNew]);

  useEffect(() => {
    if (!showTypingAnimation) {
      typingAnimationLockedTextRef.current = null;
    }
  }, [showTypingAnimation]);

  let typingAnimationSourceText = displayText;
  if (showTypingAnimation) {
    if (typingAnimationLockedTextRef.current === null) {
      typingAnimationLockedTextRef.current = displayText;
    }
    typingAnimationSourceText = typingAnimationLockedTextRef.current;
  }

  useAutosizeTextArea(editInputRef, draftText, isEditing);

  const reassignSearchNorm = removeDiacritics(
    reassignSearch.trim()
  ).toLowerCase();

  const filteredReassignMembers = useMemo(() => {
    const filtered = reassignSearchNorm
      ? projectMembers.filter((m) =>
          removeDiacritics(m.fullName)
            .toLowerCase()
            .includes(reassignSearchNorm)
        )
      : [...projectMembers];
    // Sort: members with at least one active (non-done) task come first,
    // preserving alphabetical order within each group.
    return filtered.sort((a, b) => {
      const aActive = membersWithActiveTaskIds.has(a.sId) ? 0 : 1;
      const bActive = membersWithActiveTaskIds.has(b.sId) ? 0 : 1;
      return aActive - bActive;
    });
  }, [reassignSearchNorm, projectMembers, membersWithActiveTaskIds]);

  const noAssigneeLabelNorm = removeDiacritics(
    PROJECT_TASK_NO_ASSIGNEE_LABEL
  ).toLowerCase();
  const showNoAssigneeReassignOption =
    task.user !== null &&
    (reassignSearchNorm === "" ||
      noAssigneeLabelNorm.includes(reassignSearchNorm));

  useEffect(() => {
    if (!isEditing) {
      setDraftText(stripNewlines(task.text));
    }
  }, [isEditing, task.text]);

  useEffect(() => {
    if (isEditing) {
      queueMicrotask(() => {
        const el = editInputRef.current;
        if (!el) {
          return;
        }
        el.focus();
        const offset = clickOffsetRef.current;
        if (offset !== null) {
          const pos = Math.min(offset, el.value.length);
          el.selectionStart = pos;
          el.selectionEnd = pos;
          clickOffsetRef.current = null;
        }
      });
    }
  }, [isEditing]);

  useEffect(
    () => () => {
      if (blurCommitTimerRef.current) {
        clearTimeout(blurCommitTimerRef.current);
      }
    },
    []
  );

  const cancelEdit = useCallback(() => {
    if (blurCommitTimerRef.current) {
      clearTimeout(blurCommitTimerRef.current);
      blurCommitTimerRef.current = null;
    }
    setDraftText(stripNewlines(task.text));
    setIsEditing(false);
  }, [task.text]);

  const commitEdit = useCallback(async () => {
    if (blurCommitTimerRef.current) {
      clearTimeout(blurCommitTimerRef.current);
      blurCommitTimerRef.current = null;
    }
    if (isCommittingRef.current || !isEditing) {
      return;
    }
    const textTrim = stripNewlines(draftText).trim();
    if (!textTrim) {
      cancelEdit();
      return;
    }
    if (textTrim === stripNewlines(task.text)) {
      setIsEditing(false);
      return;
    }
    isCommittingRef.current = true;
    try {
      await patchTaskItem(task.sId, { text: textTrim });
      setIsEditing(false);
      setShowSavedPulse(true);
    } finally {
      isCommittingRef.current = false;
    }
  }, [cancelEdit, draftText, isEditing, patchTaskItem, task.sId, task.text]);

  const startEdit = useCallback(
    (charOffset?: number) => {
      if (!canEdit) {
        return;
      }
      clickOffsetRef.current = charOffset ?? null;
      setTypingDismissed(true);
      setDraftText(stripNewlines(task.text));
      setIsEditing(true);
    },
    [canEdit, task.text]
  );

  const startMenuKeepsActionsVisible =
    startMenuOpen ||
    (isFirstOnboardingTask && !hasConversationLink) ||
    isStarting;

  return (
    <div
      className={cn(
        "group/task flex items-start gap-3 rounded-md px-1 py-1",
        "transition-all duration-200 hover:bg-muted-background dark:hover:bg-muted-background-night",
        "max-h-[1000px] opacity-100"
      )}
    >
      <div className="mt-0.5 shrink-0">
        <Checkbox
          size="xs"
          checked={isDone}
          disabled={!canEdit}
          isMutedAfterCheck
          onCheckedChange={() => handleToggleDone(task)}
        />
      </div>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <textarea
              ref={editInputRef}
              aria-label="Edit task text"
              autoComplete="off"
              rows={1}
              maxLength={NEW_MANUAL_TASK_MAX_CHARS}
              value={draftText}
              disabled={isStarting}
              className={cn(
                TODO_TEXTAREA_FIELD_CLASS,
                isDone && "text-faint line-through dark:text-faint-night",
                isNewlyDone &&
                  "rounded bg-warning-100/40 dark:bg-warning-100-night/30"
              )}
              onChange={(e) => setDraftText(stripNewlines(e.target.value))}
              onFocus={() => {
                if (blurCommitTimerRef.current) {
                  clearTimeout(blurCommitTimerRef.current);
                  blurCommitTimerRef.current = null;
                }
              }}
              onBlur={() => {
                blurCommitTimerRef.current = setTimeout(() => {
                  void commitEdit();
                }, 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitEdit();
                }
              }}
            />
            <TaskSources sources={task.sources} owner={owner} isDone={isDone} />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="relative min-w-0 text-left">
              {showTypingAnimation && (
                <span
                  ref={measureRef}
                  aria-hidden
                  className="invisible block w-full min-w-0 break-words text-pretty text-base leading-6"
                >
                  {typingAnimationSourceText}
                </span>
              )}
              <TaskMetadataTooltip task={task} agentNameById={agentNameById}>
                <span
                  className={cn(
                    "block min-h-6 w-full min-w-0 select-text break-words text-pretty text-left align-top text-base leading-6 transition-all duration-300",
                    showTypingAnimation && "absolute inset-0",
                    isDone
                      ? "text-faint dark:text-faint-night line-through"
                      : "text-foreground dark:text-foreground-night",
                    isNewlyDone &&
                      "rounded bg-warning-100/40 dark:bg-warning-100-night/30",
                    showSavedPulse && "animate-saved-pulse",
                    canEdit && "cursor-pointer"
                  )}
                  onAnimationEnd={() => setShowSavedPulse(false)}
                  onClick={() => {
                    const sel = window.getSelection();
                    const offset =
                      sel?.rangeCount &&
                      sel.getRangeAt(0).startContainer.nodeType ===
                        Node.TEXT_NODE
                        ? sel.getRangeAt(0).startOffset
                        : undefined;
                    startEdit(offset);
                  }}
                  onKeyDown={(e) => {
                    if (canEdit && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      startEdit();
                    }
                  }}
                  role={canEdit ? "button" : undefined}
                  tabIndex={canEdit ? 0 : undefined}
                >
                  {showTypingAnimation ? (
                    <TypingAnimation
                      text={typingAnimationSourceText}
                      duration={16}
                      onComplete={() => setTypingDismissed(true)}
                    />
                  ) : showInProgressTextAnimation ? (
                    <AnimatedText variant="muted">{displayText}</AnimatedText>
                  ) : (
                    displayText
                  )}
                </span>
              </TaskMetadataTooltip>
            </div>
            {!showTypingAnimation && (
              <TaskSources
                sources={task.sources}
                owner={owner}
                isDone={isDone}
              />
            )}
          </div>
        )}
        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          {hasConversationLink && (
            <Tooltip
              label="Open task conversation"
              trigger={
                <span className="relative inline-flex shrink-0">
                  <Button
                    icon={ChatBubbleLeftRightIcon}
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      if (!task.conversationId) {
                        return;
                      }
                      void router.push(
                        getConversationRoute(owner.sId, task.conversationId),
                        undefined,
                        { shallow: true }
                      );
                    }}
                  />
                  <ConversationSidebarStatusDot
                    status={conversationDotStatus}
                    className="pointer-events-none absolute -right-0.5 -top-0.5 m-0 ring-2 ring-background dark:ring-background-night"
                  />
                </span>
              }
            />
          )}
          {!hasConversationLink && canEdit && (
            <div
              className={cn(
                "flex shrink-0 items-center gap-1 transition-opacity",
                startMenuKeepsActionsVisible
                  ? "opacity-100"
                  : "opacity-100 md:opacity-0 md:group-hover/task:opacity-100 md:focus-within:opacity-100"
              )}
            >
              <ProjectTaskStartWorkingDropdown
                owner={owner}
                taskSId={task.sId}
                activeAgents={activeAgents}
                agentsLoading={isAgentsLoading}
                disabled={isDoneWithoutConversation}
                disabledReason="Reopen this task before starting work."
                isStarting={isStarting}
                isFirstOnboardingTask={isFirstOnboardingTask}
                defaultGoToConversation={!!task.agentInstructions?.trim()}
                onOpenChange={setStartMenuOpen}
                onStart={async (opts) => {
                  await handleStartWorking(task, opts);
                }}
              />
            </div>
          )}
          {canEdit && (
            <div
              className={cn(
                "transition-opacity",
                overflowMenuOpen
                  ? "opacity-100"
                  : "md:opacity-0 md:group-hover/task:opacity-100 md:focus-within:opacity-100"
              )}
            >
              <DropdownMenu
                modal={false}
                open={overflowMenuOpen}
                onOpenChange={(open) => {
                  setOverflowMenuOpen(open);
                  if (open) {
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
                <DropdownMenuContent
                  align="end"
                  className="z-[1000] w-56 shadow-2xl ring-1 ring-border/60"
                >
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
                        disabled={
                          projectMembers.length === 0 && task.user === null
                        }
                      />
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent
                          alignOffset={-4}
                          className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
                        >
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
                                            setOverflowMenuOpen(false);
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
                                          setOverflowMenuOpen(false);
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
                      setOverflowMenuOpen(false);
                      void requestDelete(task);
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
