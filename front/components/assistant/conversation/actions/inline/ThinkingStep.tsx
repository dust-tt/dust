import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { useState } from "react";

const MAX_THINKING_DISPLAY_LENGTH = 250;
const COLLAPSED_THINKING_MAX_HEIGHT_CLASS = "max-h-20";

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
      compactSpacing
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
        <div className="relative min-w-0 flex-1">
          <div
            className={cn(
              "min-w-0",
              isCollapsed && [
                COLLAPSED_THINKING_MAX_HEIGHT_CLASS,
                "overflow-hidden",
              ]
            )}
          >
            {markdown}
          </div>

          {isCollapsed ? (
            <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10",
              "bg-gradient-to-t from-background via-background/80 to-transparent",
              "dark:from-background-night dark:via-background-night/80")} />
          ) : null}
        </div>
      </TimelineRow>
    </div>
  );
}
