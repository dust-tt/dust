import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { memo, useEffect, useRef, useState } from "react";

import styles from "./ThinkingStep.module.css";

// Resolved once from the CSS custom property --clamp-height; shared across all instances.
let cachedClampHeightPx: number | null = null;

function getClampHeightPx(el: HTMLElement): number {
  if (cachedClampHeightPx !== null) {
    return cachedClampHeightPx;
  }
  const raw = getComputedStyle(el).getPropertyValue("--clamp-height").trim();
  const rem = parseFloat(raw);
  if (isNaN(rem)) {
    return 60; // 3.75rem × 16px default font size
  }
  const fontSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  cachedClampHeightPx = rem * fontSize;
  return cachedClampHeightPx;
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
  // if it's currently streaming, default to open (we don't auto collapse until message is done)
  // if it's not streaming, default to collapse to avoid glitchy effects (since most of thinking steps need to be collapsed)
  const [isExpanded, setIsExpanded] = useState(!isMessageDone);
  const [needsTruncation, setNeedsTruncation] = useState(isMessageDone);
  const contentRef = useRef<HTMLDivElement>(null);
  const isMeasured = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || isStreaming || isMeasured.current) {
      return;
    }

    // we don't want to update the collapse state in the middle of streaming 
    if (isMessageDone) {
      const overflows = el.scrollHeight > getClampHeightPx(el);
      setNeedsTruncation(overflows);
      setIsExpanded(!overflows);
    
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
