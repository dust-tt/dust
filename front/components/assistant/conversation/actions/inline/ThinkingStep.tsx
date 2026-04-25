import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { memo, useEffect, useRef, useState } from "react";

import styles from "./ThinkingStep.module.css";

function getClampHeightPx(el: HTMLElement): number {
  const raw = getComputedStyle(el).getPropertyValue("--clamp-height").trim();
  const rem = parseFloat(raw);
  if (isNaN(rem)) {
    return 60; // best guess if we cannot figure out the value
  }
  const fontSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  return rem * fontSize;
}

interface ThinkingStepProps {
  content: string;
  isStreaming: boolean;
  isMessageDone: boolean;
  isLast: boolean;
}

export const ThinkingStep = memo(function ThinkingStep({
  content,
  isStreaming,
  isMessageDone,
  isLast,
}: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [needsTruncation, setNeedsTruncation] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const isMeasured = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || isStreaming || isMeasured.current) {
      return;
    }

    if (isMessageDone) {
      const overflows = el.scrollHeight > getClampHeightPx(el);
      if (overflows) {
        setNeedsTruncation(overflows);
        setIsExpanded(false);
      }

      isMeasured.current = true;
    }
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
});
