import {
  TaskMetadataTooltip,
  TaskSources,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/TaskSubComponents";
import { stripNewlines } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import type { ProjectTaskType } from "@app/types/project_task";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  Button,
  CheckIcon,
  cn,
  SparklesIcon,
  TypingAnimation,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { memo, useEffect, useRef, useState } from "react";

export interface SuggestedTaskItemProps {
  task: ProjectTaskType;
  viewerUserId: string | null;
  onApproveAgentSuggestion: (task: ProjectTaskType) => void | Promise<void>;
  onRejectAgentSuggestion: (task: ProjectTaskType) => void | Promise<void>;
  owner: LightWorkspaceType;
  agentNameById: Map<string, string>;
  isNew: boolean;
  isReadOnly?: boolean;
}

export const SuggestedTaskItem = memo(function SuggestedTaskItem({
  task,
  viewerUserId,
  onApproveAgentSuggestion,
  onRejectAgentSuggestion,
  owner,
  agentNameById,
  isNew,
  isReadOnly,
}: SuggestedTaskItemProps) {
  const [typingDismissed, setTypingDismissed] = useState(false);
  const [pendingSuggestionAction, setPendingSuggestionAction] = useState<
    "approve" | "reject" | null
  >(null);
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

  const showInProgressTextAnimation = task.status === "in_progress";

  const canAct = viewerUserId !== null && !isReadOnly;

  const rationaleText =
    task.actorRationale?.trim() || "Suggested from your project takeaways.";

  return (
    <div
      className={cn(
        "group/task flex items-start gap-3 rounded-md px-1 py-1",
        "transition-all duration-200 hover:bg-muted-background dark:hover:bg-muted-background-night",
        "max-h-[1000px] opacity-100"
      )}
    >
      <div className="mt-0.5 shrink-0">
        <span className="flex size-4 items-center justify-center text-muted-foreground dark:text-muted-foreground-night">
          <SparklesIcon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-start gap-2">
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
                  "text-foreground dark:text-foreground-night"
                )}
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
            <p className="min-w-0 text-pretty text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground-night">
              {rationaleText}
            </p>
          )}
          {!showTypingAnimation && (
            <div>
              <TaskSources
                sources={task.sources}
                owner={owner}
                isDone={task.status === "done"}
              />
            </div>
          )}
        </div>
        {canAct && (
          <div className="mt-0.5 flex shrink-0 items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1 transition-opacity",
                "opacity-100 md:opacity-0 md:group-hover/task:opacity-100 md:focus-within:opacity-100"
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
                    await onApproveAgentSuggestion(task);
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
                    await onRejectAgentSuggestion(task);
                  } finally {
                    setPendingSuggestionAction(null);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
