import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { stripMarkdown } from "@app/types/shared/utils/string_utils";
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

  const collapsedTextContent = stripMarkdown(content).trim();
  const needsTruncation =
    isMessageDone && collapsedTextContent.length > MAX_THINKING_DISPLAY_LENGTH;

  const collapsedPreviewContent =
    collapsedTextContent.slice(0, MAX_THINKING_DISPLAY_LENGTH) + "…";

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
        <div className="min-w-0 flex-1">
          {needsTruncation && !isExpanded ? (
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {collapsedPreviewContent}
            </span>
          ) : (
            markdown
          )}
        </div>
      </TimelineRow>
    </div>
  );
}
