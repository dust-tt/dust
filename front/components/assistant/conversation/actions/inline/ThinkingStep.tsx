import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import type { UiView } from "@app/components/assistant/conversation/types";
import {
  AnimatedText,
  ChevronRight,
  cn,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import { memo, useEffect, useRef, useState } from "react";

import styles from "./ThinkingStep.module.css";

// Resolved once from the CSS custom property --clamp-height; shared across all instances.
let cachedClampHeightPx: number | null = null;

// Converts the --clamp-height CSS variable from rem to px.
// rem ("root em") is relative to the <html> element's font-size (typically 16px),
// so 3.75rem = 3.75 × 16 = 60px. We need the px value to compare against
// el.scrollHeight (which is always in px) when deciding whether to truncate.
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
  uiView: UiView;
}

export const ThinkingStep = memo(function ThinkingStep({
  content,
  isStreaming,
  isMessageDone,
  isLast,
  uiView,
}: ThinkingStepProps) {
  // Compact UI view: thinking always stays collapsed until the user clicks to expand it.
  const forceCollapsed = uiView === "compact";

  // if it's currently streaming, default to open (we don't auto collapse until message is done)
  // if it's not streaming, default to collapse to avoid glitchy effects (since most of thinking steps need to be collapsed)
  const [isExpanded, setIsExpanded] = useState(
    !isMessageDone && !forceCollapsed
  );
  const [needsTruncation, setNeedsTruncation] = useState(
    isMessageDone || forceCollapsed
  );
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || isStreaming || forceCollapsed) {
      return;
    }

    // we don't want to update the collapse state in the middle of streaming
    if (isMessageDone) {
      const overflows = el.scrollHeight > getClampHeightPx(el);
      setNeedsTruncation(overflows);
      setIsExpanded(!overflows);
    }
  }, [isStreaming, isMessageDone, forceCollapsed]);

  const markdown = content ? (
    <Markdown
      content={content}
      streamingState={isStreaming ? "streaming" : "none"}
      enableAnimation={isStreaming}
      animationDurationSeconds={0.3}
      delimiter=" "
      forcedTextSize="text-sm"
      textColor="text-muted-foreground"
      isLastMessage={false}
    />
  ) : null;

  if (isStreaming && !forceCollapsed) {
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
    ? (e: React.MouseEvent) => {
        // Prevent multi clicks from being caught as a selection and not toggling on+off the expansion.
        if (window.getSelection()?.toString() && e.detail <= 1) {
          return;
        }
        setIsExpanded((prev) => !prev);
      }
    : undefined;

  const handleKeyDown = needsTruncation
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsExpanded((prev) => !prev);
        }
      }
    : undefined;

  // Compact UI view: thinking is collapsed automatically
  const isCompactCollapsed = forceCollapsed && !isExpanded;

  return (
    <div
      className={cn(needsTruncation && "cursor-pointer")}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={needsTruncation ? "button" : undefined}
      tabIndex={needsTruncation ? 0 : undefined}
      aria-expanded={needsTruncation ? isExpanded : undefined}
    >
      {isCompactCollapsed ? (
        <TimelineRow
          icon={isStreaming && !content ? null : "circle"}
          spinner={isStreaming && !content}
          isLast={isLast}
        >
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            {isStreaming ? <AnimatedText>Thinking…</AnimatedText> : "Thinking…"}
            <Icon size="xs" visual={ChevronRight} className="shrink-0" />
          </span>
        </TimelineRow>
      ) : (
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
      )}
    </div>
  );
});
