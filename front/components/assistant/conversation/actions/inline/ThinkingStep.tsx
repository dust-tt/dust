import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { ChevronRightIcon, cn, Icon, Markdown } from "@dust-tt/sparkle";
import { useState } from "react";

const MAX_THINKING_DISPLAY_LENGTH = 250;

interface ThinkingStepProps {
  content: string;
  isStreaming: boolean;
  isMessageDone: boolean;
  isLast: boolean;
}

export function ThinkingStep({
  content,
  isStreaming,
  isMessageDone,
  isLast,
}: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isStreaming) {
    return (
      <TimelineRow
        icon={content ? "circle" : null}
        spinner={!content}
        isLast={isLast}
      >
        {content ? (
          <Markdown
            content={content}
            isStreaming={false}
            streamingState="streaming"
            enableAnimation
            animationDurationSeconds={0.3}
            delimiter=" "
            forcedTextSize="text-sm"
            textColor="text-muted-foreground dark:text-muted-foreground-night"
            isLastMessage={false}
          />
        ) : null}
      </TimelineRow>
    );
  }

  const needsTruncation =
    isMessageDone && content.length > MAX_THINKING_DISPLAY_LENGTH;

  const displayContent =
    needsTruncation && !isExpanded
      ? content.slice(0, MAX_THINKING_DISPLAY_LENGTH) + "\u2026"
      : content;

  return (
    <TimelineRow icon="circle" isLast={isLast}>
      <span
        className={cn(
          "text-sm text-muted-foreground dark:text-muted-foreground-night",
          needsTruncation && "cursor-pointer"
        )}
        onClick={needsTruncation ? () => setIsExpanded((v) => !v) : undefined}
      >
        {displayContent}
        {needsTruncation && (
          <Icon
            size="xs"
            visual={ChevronRightIcon}
            className={cn(
              "inline ml-1 shrink-0 opacity-50 transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />
        )}
      </span>
    </TimelineRow>
  );
}
