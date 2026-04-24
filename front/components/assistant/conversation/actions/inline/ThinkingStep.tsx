import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { useState } from "react";

import styles from "./ThinkingStep.module.css";

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

  const needsTruncation =
    !isStreaming &&
    isMessageDone &&
    content.length > MAX_THINKING_DISPLAY_LENGTH;

  const markdown = content ? (
    <Markdown
      content={content}
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

  return (
    <div
      className={cn(needsTruncation && "cursor-pointer select-none")}
      onClick={
        needsTruncation
          ? () => setIsExpanded((prev) => !prev)
          : undefined
      }
    >
      <TimelineRow icon="circle" isLast={isLast}>
        <div
          className={cn(
            "relative min-w-0 flex-1",
            styles.root,
            (!needsTruncation || isExpanded) && styles.expanded
          )}
        >
          <div className={styles.content}>{markdown}</div>
          {needsTruncation && (
            <div className={styles.fade} aria-hidden />
          )}
        </div>
      </TimelineRow>
    </div>
  );
}
