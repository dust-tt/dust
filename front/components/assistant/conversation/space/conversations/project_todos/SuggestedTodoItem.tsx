import {
  TodoMetadataTooltip,
  TodoSources,
} from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import { stripNewlines } from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import type { ProjectTodoType } from "@app/types/project_todo";
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
import { memo, useRef, useState } from "react";

export interface SuggestedTodoItemProps {
  todo: ProjectTodoType;
  viewerUserId: string | null;
  onApproveAgentSuggestion: (todo: ProjectTodoType) => void | Promise<void>;
  onRejectAgentSuggestion: (todo: ProjectTodoType) => void | Promise<void>;
  owner: LightWorkspaceType;
  agentNameById: Map<string, string>;
  isExiting: boolean;
  isNew: boolean;
  isReadOnly?: boolean;
}

export const SuggestedTodoItem = memo(function SuggestedTodoItem({
  todo,
  viewerUserId,
  onApproveAgentSuggestion,
  onRejectAgentSuggestion,
  owner,
  agentNameById,
  isExiting,
  isNew,
  isReadOnly,
}: SuggestedTodoItemProps) {
  const [typingDismissed, setTypingDismissed] = useState(false);
  const [pendingSuggestionAction, setPendingSuggestionAction] = useState<
    "approve" | "reject" | null
  >(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  const displayText = stripNewlines(todo.text);
  const showTypingAnimation = isNew && !typingDismissed;
  const showInProgressTextAnimation = todo.status === "in_progress";

  const canAct = viewerUserId !== null && !isReadOnly;

  const rationaleText =
    todo.actorRationale?.trim() || "Suggested from your project takeaways.";

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
                {displayText}
              </span>
            )}
            <TodoMetadataTooltip todo={todo} agentNameById={agentNameById}>
              <span
                className={cn(
                  "block min-h-6 w-full min-w-0 select-text break-words text-pretty text-left align-top text-base leading-6 transition-all duration-300",
                  showTypingAnimation && "absolute inset-0",
                  "text-foreground dark:text-foreground-night"
                )}
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
          {!showTypingAnimation && (
            <p className="min-w-0 text-pretty text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground-night">
              {rationaleText}
            </p>
          )}
          {!showTypingAnimation && (
            <div>
              <TodoSources
                sources={todo.sources}
                owner={owner}
                isDone={todo.status === "done"}
              />
            </div>
          )}
        </div>
        {canAct && (
          <div className="mt-0.5 flex shrink-0 items-center gap-1">
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
          </div>
        )}
      </div>
    </div>
  );
});
