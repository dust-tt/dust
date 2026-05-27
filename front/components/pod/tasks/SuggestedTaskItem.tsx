import { useTypingAnimation } from "@app/components/assistant/conversation/space/conversations/project_tasks/useTypingAnimation";
import { stripNewlines } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import {
  TaskMetadataTooltip,
  TaskSources,
} from "@app/components/pod/tasks/TaskSubComponents";
import type { PodTaskType } from "@app/types/project_task";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  Button,
  Checkbox,
  cn,
  TypingAnimation,
} from "@dust-tt/sparkle";
import { memo, useState } from "react";

export interface SuggestedTaskItemProps {
  task: PodTaskType;
  viewerUserId: string | null;
  onApproveAgentSuggestion: (task: PodTaskType) => void | Promise<void>;
  owner: LightWorkspaceType;
  agentNameById: Map<string, string>;
  isNew: boolean;
  isReadOnly?: boolean;
}

export const SuggestedTaskItem = memo(function SuggestedTaskItem({
  task,
  viewerUserId,
  onApproveAgentSuggestion,
  owner,
  agentNameById,
  isNew,
  isReadOnly,
}: SuggestedTaskItemProps) {
  const [isApproving, setIsApproving] = useState(false);

  const displayText = stripNewlines(task.text);
  const typing = useTypingAnimation({ enabled: isNew, text: displayText });
  const showInProgressTextAnimation = task.status === "in_progress";

  const canAct = viewerUserId !== null && !isReadOnly;
  const rationaleText =
    task.actorRationale?.trim() || "Suggested from your Pod takeaways.";

  return (
    <div className="group/suggestion-item flex items-start gap-3 py-1 pl-6">
      <div className="mt-1 shrink-0">
        <Checkbox size="xs" checked={false} disabled />
      </div>
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
                "min-h-6 w-full min-w-0 break-words text-pretty text-base leading-6 text-foreground dark:text-foreground-night",
                typing.isAnimating && "absolute inset-0"
              )}
            >
              {typing.isAnimating ? (
                <TypingAnimation
                  text={typing.sourceText}
                  duration={16}
                  onComplete={typing.dismiss}
                />
              ) : showInProgressTextAnimation ? (
                <AnimatedText variant="muted">{displayText}</AnimatedText>
              ) : (
                displayText
              )}
            </div>
          </TaskMetadataTooltip>
        </div>
        {!typing.isAnimating && (
          <p className="min-w-0 text-pretty text-xs leading-relaxed text-muted-foreground dark:text-muted-foreground-night">
            {rationaleText}
          </p>
        )}
        {!typing.isAnimating && (
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
        <div
          className={cn(
            "shrink-0 transition-opacity",
            "[@media(hover:hover)]:opacity-0 group-hover/suggestion-item:opacity-100 group-focus-within/suggestion-item:opacity-100"
          )}
        >
          <Button
            label="Accept"
            size="sm"
            variant="outline"
            isLoading={isApproving}
            disabled={isApproving}
            onClick={async (e) => {
              e.stopPropagation();
              setIsApproving(true);
              try {
                await onApproveAgentSuggestion(task);
              } finally {
                setIsApproving(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
});
