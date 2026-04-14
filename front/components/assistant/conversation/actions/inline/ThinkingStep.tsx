import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
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

  const markdown = content ? (
    <Markdown
      content={content}
      isStreaming={isStreaming}
      streamingState={isStreaming ? "streaming" : "none"}
      enableAnimation={isStreaming}
      animationDurationSeconds={0.3}
      delimiter=" "
      forcedTextSize="text-sm"
      textColor="text-muted-foreground dark:text-muted-foreground-night"
      isLastMessage={false}
    />
  ) : null;

  if (isStreaming) {
    return (
      <TimelineRow
        icon={content ? "circle" : null}
        spinner={!content}
        isLast={isLast}
      >
        {markdown}
      </TimelineRow>
    );
  }

  const needsTruncation =
    isMessageDone && content.length > MAX_THINKING_DISPLAY_LENGTH;
  const isCollapsed = needsTruncation && !isExpanded;

  return (
    <div
      className={cn(needsTruncation && "cursor-pointer")}
      onClick={
        needsTruncation
          ? () => setIsExpanded((expanded) => !expanded)
          : undefined
      }
    >
      <TimelineRow icon="circle" isLast={isLast}>
        <div
          className={cn(
            "min-w-0 flex-1",
            isCollapsed && "line-clamp-3"
          )}
        >
          {markdown}
        </div>
      </TimelineRow>
    </div>
  );
}
