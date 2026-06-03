import { ConversationSidebarStatusDot } from "@app/components/assistant/conversation/ConversationSidebarStatusDot";
import { useTaskInlineEdit } from "@app/components/assistant/conversation/space/conversations/project_tasks/useTaskInlineEdit";
import { useTypingAnimation } from "@app/components/assistant/conversation/space/conversations/project_tasks/useTypingAnimation";
import {
  NEW_MANUAL_TASK_MAX_CHARS,
  stripNewlines,
  TASK_DESKTOP_HOVER_REVEAL_CLASS,
  TASK_TEXTAREA_FIELD_CLASS,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { PodTaskStartWorkingDropdown } from "@app/components/pod/tasks/PodTaskStartWorkingDropdown";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import { TaskOverflowMenu } from "@app/components/pod/tasks/TaskOverflowMenu";
import {
  TaskMetadataTooltip,
  TaskSources,
} from "@app/components/pod/tasks/TaskSubComponents";
import { useAppRouter } from "@app/lib/platform";
import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodTaskType } from "@app/types/project_task";
import {
  AnimatedText,
  Button,
  Checkbox,
  cn,
  MessageChatSquareV2,
  Tooltip,
  TypingAnimation,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface EditableTaskItemProps {
  task: PodTaskType;
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
    handleToggleDone,
    handleStartWorking,
    patchTaskItem,
  } = usePodTasksPanel();

  const router = useAppRouter();
  const [startMenuOpen, setStartMenuOpen] = useState(false);

  const isNew = newItemKeys.has(task.sId);
  const isNewlyDone = doneFlashKeys.has(task.sId);
  const isStarting = startingTaskIds.has(task.sId);
  const isFirstOnboardingTask = task.sId === firstOnboardingTaskId;
  const isDone = task.status === "done";
  const hasConversationLink =
    (task.status === "in_progress" || task.status === "done") &&
    !!task.conversationId;
  const isDoneWithoutConversation = isDone && !hasConversationLink;
  const canEdit = viewerUserId !== null && !isReadOnly;
  const conversationDotStatus: ConversationDotStatus =
    task.conversationSidebarStatus ?? "idle";

  const inlineEdit = useTaskInlineEdit({
    task,
    canEdit,
    onCommitText: (text) => patchTaskItem(task.sId, { text }),
  });

  const displayText = stripNewlines(task.text);
  const typing = useTypingAnimation({
    enabled: isNew && !inlineEdit.isEditing,
    text: displayText,
  });

  const startEdit = (offset?: number) => {
    typing.dismiss();
    inlineEdit.startEdit(offset);
  };

  const startMenuKeepsActionsVisible =
    startMenuOpen ||
    (isFirstOnboardingTask && !hasConversationLink) ||
    isStarting;

  return (
    <div className="group/task flex items-start gap-3 rounded-md p-1 transition-colors duration-200 hover:bg-muted-background dark:hover:bg-muted-background-night">
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
        {inlineEdit.isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <textarea
              ref={inlineEdit.inputRef}
              aria-label="Edit task text"
              autoComplete="off"
              autoFocus
              rows={1}
              maxLength={NEW_MANUAL_TASK_MAX_CHARS}
              defaultValue={stripNewlines(task.text)}
              disabled={isStarting}
              className={cn(
                TASK_TEXTAREA_FIELD_CLASS,
                isDone && "text-faint line-through dark:text-faint-night",
                isNewlyDone &&
                  "rounded bg-warning-100/40 dark:bg-warning-100-night/30"
              )}
              {...inlineEdit.textareaHandlers}
            />
            <TaskSources sources={task.sources} owner={owner} isDone={isDone} />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="relative min-w-0 text-left">
              {typing.isAnimating && (
                <span
                  aria-hidden
                  className="invisible block w-full min-w-0 break-words text-pretty text-base leading-6"
                >
                  {typing.sourceText}
                </span>
              )}
              <TaskMetadataTooltip task={task} agentNameById={agentNameById}>
                <div
                  className={cn(
                    "min-h-6 w-full min-w-0 break-words text-pretty text-base leading-6 transition-colors duration-300",
                    typing.isAnimating && "absolute inset-0",
                    isDone
                      ? "text-faint dark:text-faint-night line-through"
                      : "text-foreground dark:text-foreground-night",
                    isNewlyDone &&
                      "rounded bg-warning-100/40 dark:bg-warning-100-night/30",
                    inlineEdit.showSavedPulse && "animate-saved-pulse",
                    canEdit && "cursor-pointer"
                  )}
                  onAnimationEnd={inlineEdit.dismissSavedPulse}
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
                  {typing.isAnimating ? (
                    <TypingAnimation
                      text={typing.sourceText}
                      duration={16}
                      onComplete={typing.dismiss}
                    />
                  ) : task.conversationIsRunningAgentLoop ? (
                    <AnimatedText variant="muted">{displayText}</AnimatedText>
                  ) : (
                    displayText
                  )}
                </div>
              </TaskMetadataTooltip>
            </div>
            {!typing.isAnimating && (
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
                <div className="relative shrink-0">
                  <Button
                    icon={MessageChatSquareV2}
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
                </div>
              }
            />
          )}
          {!hasConversationLink && canEdit && (
            <div
              className={cn(
                "shrink-0",
                !startMenuKeepsActionsVisible && TASK_DESKTOP_HOVER_REVEAL_CLASS
              )}
            >
              <PodTaskStartWorkingDropdown
                owner={owner}
                taskId={task.sId}
                activeAgents={activeAgents}
                agentsLoading={isAgentsLoading}
                disabled={isDoneWithoutConversation}
                disabledReason="Reopen this task before starting work."
                isStarting={isStarting}
                isFirstOnboardingTask={isFirstOnboardingTask}
                defaultGoToConversation={!!task.agentInstructions?.trim()}
                onOpenChange={setStartMenuOpen}
                onStart={(opts) => handleStartWorking(task, opts)}
              />
            </div>
          )}
          {canEdit && <TaskOverflowMenu task={task} />}
        </div>
      </div>
    </div>
  );
}
