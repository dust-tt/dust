import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import styles from "./ThinkingStep.module.css";

// Matches --clamp-height (3.75rem) in ThinkingStep.module.css.
const CLAMP_HEIGHT_PX = 60;

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
  // When the message is still in progress, this step just transitioned from
  // streaming — start expanded so there's no visible collapse flash.
  const [isExpanded, setIsExpanded] = useState(!isMessageDone);
  const [needsTruncation, setNeedsTruncation] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const isMeasured = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || isStreaming || isMeasured.current) {
      return;
    }

    // Compare against the known clamp height so it works whether the
    // CSS is currently expanded or collapsed.
    const overflows = el.scrollHeight > CLAMP_HEIGHT_PX;
    setNeedsTruncation(overflows);
    if (overflows && isMessageDone) {
      setIsExpanded(false);
    }
    isMeasured.current = true;
  }, [isStreaming, isMessageDone]);

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

  const handleClick = needsTruncation
    ? () => {
        if (window.getSelection()?.toString()) {
          return;
        }
        setIsExpanded((prev) => !prev);
      }
    : undefined;

  return (
    <div
      className={cn(needsTruncation && "cursor-pointer")}
      onClick={handleClick}
    >
      <TimelineRow icon="circle" isLast={isLast}>
        <div
          className={cn(
            "relative min-w-0 flex-1",
            styles.root,
            (!needsTruncation || isExpanded) && styles.expanded
          )}
        >
          <div ref={contentRef} className={styles.content}>
            {markdown}
          </div>
          {needsTruncation && <div className={styles.fade} aria-hidden />}
        </div>
      </TimelineRow>
    </div>
  );
}
