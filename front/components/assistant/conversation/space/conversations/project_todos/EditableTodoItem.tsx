import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { ConversationSidebarStatusDot } from "@app/components/assistant/conversation/ConversationSidebarStatusDot";
import {
  TodoMetadataTooltip,
  TodoSources,
} from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import {
  NEW_MANUAL_TODO_MAX_CHARS,
  stripNewlines,
  TODO_TEXTAREA_FIELD_CLASS,
  useAutosizeTextArea,
} from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { useAppRouter } from "@app/lib/platform";
import { removeDiacritics } from "@app/lib/utils";
import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ProjectTodoType } from "@app/types/project_todo";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import {
  AnimatedText,
  Avatar,
  Button,
  ButtonGroup,
  ButtonGroupDropdown,
  ChatBubbleLeftRightIcon,
  Checkbox,
  CheckIcon,
  ChevronDownIcon,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  type DropdownMenuItemProps,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  MoreIcon,
  PlayIcon,
  RobotIcon,
  SparklesIcon,
  TextArea,
  Tooltip,
  TrashIcon,
  TypingAnimation,
  UserIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface EditableTodoItemProps {
  todo: ProjectTodoType;
  viewerUserId: string | null;
  onToggleDone: (todo: ProjectTodoType) => void;
  onDelete: (todo: ProjectTodoType) => void | Promise<void>;
  onApproveAgentSuggestion: (todo: ProjectTodoType) => void | Promise<void>;
  onRejectAgentSuggestion: (todo: ProjectTodoType) => void | Promise<void>;
  onStartWorking: (
    todo: ProjectTodoType,
    options?: {
      customMessage?: string;
      agentConfigurationId?: string;
      goToConversation?: boolean;
    }
  ) => Promise<void>;
  owner: LightWorkspaceType;
  activeAgents: LightAgentConfigurationType[];
  agentsLoading: boolean;
  agentNameById: Map<string, string>;
  isExiting: boolean;
  isNew: boolean;
  isNewlyDone: boolean;
  isStarting: boolean;
  isReadOnly?: boolean;
  isFirstOnboardingTodo: boolean;
  projectMembers: SpaceUserType[];
  membersWithActiveTodoIds: Set<string>;
  onPatchTodo: (
    todoId: string,
    updates: { text?: string; assigneeUserId?: string }
  ) => Promise<void>;
}

export const EditableTodoItem = memo(function EditableTodoItem({
  todo,
  viewerUserId,
  onToggleDone,
  onDelete,
  onApproveAgentSuggestion,
  onRejectAgentSuggestion,
  onStartWorking,
  owner,
  activeAgents,
  agentsLoading,
  agentNameById,
  isExiting,
  isNew,
  isNewlyDone,
  isStarting,
  isReadOnly,
  isFirstOnboardingTodo,
  projectMembers,
  membersWithActiveTodoIds,
  onPatchTodo,
}: EditableTodoItemProps) {
  const router = useAppRouter();
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [startCustomMessage, setStartCustomMessage] = useState("");
  const [goToConversationAfterStart, setGoToConversationAfterStart] = useState(
    () => !!todo.agentInstructions?.trim()
  );
  const [selectedStartAgent, setSelectedStartAgent] =
    useState<LightAgentConfigurationType | null>(null);

  const isDone = todo.status === "done";
  const hasConversationLink =
    (todo.status === "in_progress" || todo.status === "done") &&
    !!todo.conversationId;
  const conversationDotStatus: ConversationDotStatus =
    todo.conversationSidebarStatus ?? "idle";
  const isDoneWithoutConversation = isDone && !hasConversationLink;
  const isPendingApproval = todo.agentSuggestionStatus === "pending";
  const canAct = viewerUserId !== null && !isReadOnly;
  const canEdit = canAct && !isPendingApproval;
  const showInProgressTextAnimation = todo.status === "in_progress";
  const [isFlashing, setIsFlashing] = useState(isNewlyDone);
  const [showSavedPulse, setShowSavedPulse] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(todo.text);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");
  const [pendingSuggestionAction, setPendingSuggestionAction] = useState<
    "approve" | "reject" | null
  >(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const blurCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCommittingRef = useRef(false);
  const clickOffsetRef = useRef<number | null>(null);
  const [typingDismissed, setTypingDismissed] = useState(false);
  const measureRef = useRef<HTMLSpanElement>(null);

  const displayText = stripNewlines(todo.text);
  const showTypingAnimation = isNew && !typingDismissed;
  useAutosizeTextArea(editInputRef, draftText, isEditing);

  const filteredReassignMembers = useMemo(() => {
    const q = removeDiacritics(reassignSearch.trim()).toLowerCase();
    const filtered = q
      ? projectMembers.filter((m) =>
          removeDiacritics(m.fullName).toLowerCase().includes(q)
        )
      : [...projectMembers];
    // Sort: members with at least one active (non-done) todo come first,
    // preserving alphabetical order within each group.
    return filtered.sort((a, b) => {
      const aActive = membersWithActiveTodoIds.has(a.sId) ? 0 : 1;
      const bActive = membersWithActiveTodoIds.has(b.sId) ? 0 : 1;
      return aActive - bActive;
    });
  }, [reassignSearch, projectMembers, membersWithActiveTodoIds]);

  useEffect(() => {
    if (!isNewlyDone) {
      return;
    }
    const timeout = setTimeout(() => setIsFlashing(false), 1000);
    return () => clearTimeout(timeout);
  }, [isNewlyDone]);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(stripNewlines(todo.text));
    }
  }, [isEditing, todo.text]);

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
    setDraftText(stripNewlines(todo.text));
    setIsEditing(false);
  }, [todo.text]);

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
    if (textTrim === stripNewlines(todo.text)) {
      setIsEditing(false);
      return;
    }
    isCommittingRef.current = true;
    try {
      await onPatchTodo(todo.sId, { text: textTrim });
      setIsEditing(false);
      setShowSavedPulse(true);
    } finally {
      isCommittingRef.current = false;
    }
  }, [cancelEdit, draftText, isEditing, onPatchTodo, todo.sId, todo.text]);

  const startEdit = useCallback(
    (charOffset?: number) => {
      if (!canEdit) {
        return;
      }
      clickOffsetRef.current = charOffset ?? null;
      setTypingDismissed(true);
      setDraftText(stripNewlines(todo.text));
      setIsEditing(true);
    },
    [canEdit, todo.text]
  );

  const handleToggle = () => {
    onToggleDone(todo);
  };

  const handleStartMenuOpenChange = (open: boolean) => {
    setStartMenuOpen(open);
    if (open) {
      setStartCustomMessage("");
      const defaultAgent =
        activeAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ??
        activeAgents[0] ??
        null;
      setSelectedStartAgent(defaultAgent);
    }
  };

  const handleConfirmStart = async () => {
    setStartMenuOpen(false);
    const agentConfigurationId =
      selectedStartAgent && selectedStartAgent.sId !== GLOBAL_AGENTS_SID.DUST
        ? selectedStartAgent.sId
        : undefined;
    await onStartWorking(todo, {
      customMessage: startCustomMessage.trim() || undefined,
      agentConfigurationId,
      goToConversation: goToConversationAfterStart,
    });
  };

  const startRedirectMenuItems = useMemo((): DropdownMenuItemProps[] => {
    const check = (
      <Icon
        size="xs"
        visual={CheckIcon}
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
    );
    return [
      {
        label: "Redirect to conversation",
        onSelect: (e) => {
          e.preventDefault();
          setGoToConversationAfterStart(true);
        },
        endComponent: goToConversationAfterStart ? check : undefined,
      },
      {
        label: "Stay on to-dos",
        onSelect: (e) => {
          e.preventDefault();
          setGoToConversationAfterStart(false);
        },
        endComponent: !goToConversationAfterStart ? check : undefined,
      },
    ];
  }, [goToConversationAfterStart]);

  const startMenuKeepsActionsVisible =
    startMenuOpen ||
    (isFirstOnboardingTodo && !hasConversationLink) ||
    isStarting;

  return (
    <div
      className={cn(
        "group/todo flex items-start gap-3 rounded-md px-1 py-1",
        "transition-all duration-200 hover:bg-muted-background dark:hover:bg-muted-background-night",
        isExiting && "max-h-0 overflow-hidden opacity-0",
        !isExiting && "max-h-[1000px] opacity-100"
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isPendingApproval ? (
          <span className="flex size-4 items-center justify-center text-muted-foreground dark:text-muted-foreground-night">
            <SparklesIcon className="h-3.5 w-3.5" />
          </span>
        ) : (
          <Checkbox
            size="xs"
            checked={isDone}
            disabled={!canEdit}
            isMutedAfterCheck
            onCheckedChange={() => handleToggle()}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <textarea
              ref={editInputRef}
              aria-label="Edit to-do text"
              autoComplete="off"
              rows={1}
              maxLength={NEW_MANUAL_TODO_MAX_CHARS}
              value={draftText}
              disabled={isStarting}
              className={cn(
                TODO_TEXTAREA_FIELD_CLASS,
                isDone && "text-faint line-through dark:text-faint-night",
                isFlashing &&
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
            <div>
              <TodoSources
                sources={todo.sources}
                owner={owner}
                isDone={isDone}
              />
            </div>
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
                  {displayText}
                </span>
              )}
              <TodoMetadataTooltip todo={todo} agentNameById={agentNameById}>
                <span
                  className={cn(
                    "block min-h-6 w-full min-w-0 select-text break-words text-pretty text-left align-top text-base leading-6 transition-all duration-300",
                    showTypingAnimation && "absolute inset-0",
                    isDone
                      ? "text-faint dark:text-faint-night line-through"
                      : "text-foreground dark:text-foreground-night",
                    isFlashing &&
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
                      text={displayText}
                      duration={16}
                      onComplete={() => setTypingDismissed(true)}
                    />
                  ) : showInProgressTextAnimation ? (
                    <AnimatedText variant="muted">{displayText}</AnimatedText>
                  ) : (
                    displayText
                  )}
                </span>
              </TodoMetadataTooltip>
            </div>
            {isPendingApproval && !showTypingAnimation && (
              <p className="min-w-0 text-pretty text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground-night">
                {todo.actorRationale?.trim() ||
                  "Suggested from your project takeaways."}
              </p>
            )}
            {!showTypingAnimation && (
              <div>
                <TodoSources
                  sources={todo.sources}
                  owner={owner}
                  isDone={isDone}
                />
              </div>
            )}
          </div>
        )}
        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          {isPendingApproval && canAct && !isEditing ? (
            <div
              className={cn(
                "flex items-center gap-1 transition-opacity",
                "opacity-100 md:opacity-0 md:group-hover/todo:opacity-100 md:focus-within:opacity-100"
              )}
            >
              <Button
                icon={CheckIcon}
                size="xmini"
                variant="outline"
                tooltip="Keep this suggestion"
                isLoading={pendingSuggestionAction === "approve"}
                disabled={pendingSuggestionAction !== null}
                className="text-success-500 hover:text-success-600 dark:text-success-500-night dark:hover:text-success-600-night"
                onClick={async (e) => {
                  e.stopPropagation();
                  setPendingSuggestionAction("approve");
                  try {
                    await onApproveAgentSuggestion(todo);
                  } finally {
                    setPendingSuggestionAction(null);
                  }
                }}
              />
              <Button
                icon={XMarkIcon}
                size="xmini"
                variant="outline"
                tooltip="Reject suggestion"
                isLoading={pendingSuggestionAction === "reject"}
                disabled={pendingSuggestionAction !== null}
                className="text-warning-500 hover:text-warning-600 dark:text-warning-500-night dark:hover:text-warning-600-night"
                onClick={async (e) => {
                  e.stopPropagation();
                  setPendingSuggestionAction("reject");
                  try {
                    await onRejectAgentSuggestion(todo);
                  } finally {
                    setPendingSuggestionAction(null);
                  }
                }}
              />
            </div>
          ) : (
            <>
              {hasConversationLink && (
                <Tooltip
                  label="Open to-do conversation"
                  trigger={
                    <span className="relative inline-flex shrink-0">
                      <Button
                        icon={ChatBubbleLeftRightIcon}
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          if (!todo.conversationId) {
                            return;
                          }
                          void router.push(
                            getConversationRoute(
                              owner.sId,
                              todo.conversationId
                            ),
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
                      : "opacity-100 md:opacity-0 md:group-hover/todo:opacity-100 md:focus-within:opacity-100"
                  )}
                >
                  {isDoneWithoutConversation ? (
                    <Tooltip
                      label="Reopen this to-do before starting work."
                      trigger={
                        <Button
                          icon={PlayIcon}
                          size="xs"
                          variant="outline"
                          disabled
                        />
                      }
                    />
                  ) : (
                    <DropdownMenu
                      modal={false}
                      open={startMenuOpen}
                      onOpenChange={handleStartMenuOpenChange}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          icon={PlayIcon}
                          size="xs"
                          variant="outline"
                          isLoading={isStarting}
                          disabled={isStarting}
                          isPulsing={isFirstOnboardingTodo && !startMenuOpen}
                          tooltip="Start working on to-do"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-96">
                        <div className="flex flex-col gap-3 p-3">
                          <TextArea
                            id={`todo-start-msg-${todo.sId}`}
                            aria-label="Additional instructions for the agent"
                            placeholder="(optional) Add a custom message for the agent..."
                            value={startCustomMessage}
                            rows={4}
                            onChange={(
                              event: React.ChangeEvent<HTMLTextAreaElement>
                            ) => setStartCustomMessage(event.target.value)}
                          />
                          <div className="flex items-end justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <AgentPicker
                                owner={owner}
                                agents={activeAgents}
                                disabled={agentsLoading}
                                isLoading={agentsLoading}
                                mountPortal
                                showDropdownArrow
                                showFooterButtons={false}
                                side="bottom"
                                size="xs"
                                onItemClick={(agent) =>
                                  setSelectedStartAgent(agent)
                                }
                                pickerButton={
                                  <Button
                                    variant="ghost-secondary"
                                    size="xs"
                                    isSelect
                                    icon={
                                      selectedStartAgent
                                        ? () => (
                                            <Avatar
                                              size="xxs"
                                              visual={
                                                selectedStartAgent.pictureUrl
                                              }
                                            />
                                          )
                                        : RobotIcon
                                    }
                                    label={selectedStartAgent?.name ?? "Agent"}
                                    className="max-w-full min-w-0"
                                  />
                                }
                              />
                            </div>
                            <ButtonGroup className="shrink-0">
                              <Button
                                label="Start working"
                                variant="outline"
                                size="sm"
                                className={isFirstOnboardingTodo ? "z-10" : ""}
                                isLoading={isStarting}
                                isPulsing={isFirstOnboardingTodo}
                                disabled={isStarting || !selectedStartAgent}
                                onClick={() => void handleConfirmStart()}
                              />
                              <ButtonGroupDropdown
                                align="end"
                                items={startRedirectMenuItems}
                                trigger={
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={ChevronDownIcon}
                                    disabled={isStarting || !selectedStartAgent}
                                    aria-label="After start: open conversation or stay on to-dos"
                                  />
                                }
                              />
                            </ButtonGroup>
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
              {canEdit && (
                <div
                  className={cn(
                    "transition-opacity",
                    overflowMenuOpen
                      ? "opacity-100"
                      : "md:opacity-0 md:group-hover/todo:opacity-100 md:focus-within:opacity-100"
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
                        aria-label="To-do actions"
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
                          disabled={projectMembers.length === 0}
                        />
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent
                            alignOffset={-4}
                            className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
                          >
                            <DropdownMenuSearchbar
                              autoFocus
                              name={`reassign-todo-${todo.sId}`}
                              placeholder="Search members"
                              value={reassignSearch}
                              onChange={setReassignSearch}
                            />
                            <DropdownMenuSeparator />
                            <div className="max-h-64 overflow-auto">
                              {filteredReassignMembers.length > 0 ? (
                                filteredReassignMembers.map((member) => (
                                  <DropdownMenuItem
                                    key={`reassign-${todo.sId}-${member.sId}`}
                                    label={`${member.fullName}${viewerUserId === member.sId ? " (you)" : ""}`}
                                    disabled={member.sId === todo.user?.sId}
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
                                          if (member.sId !== todo.user?.sId) {
                                            await onPatchTodo(todo.sId, {
                                              assigneeUserId: member.sId,
                                            });
                                          }
                                        } finally {
                                          setOverflowMenuOpen(false);
                                        }
                                      })();
                                    }}
                                  />
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  No members found
                                </div>
                              )}
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      <DropdownMenuItem
                        label="Delete"
                        icon={TrashIcon}
                        variant="warning"
                        onClick={() => {
                          setOverflowMenuOpen(false);
                          void onDelete(todo);
                        }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
