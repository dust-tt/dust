import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

const CLAMP_HEIGHT = "3.75rem";
const FADE_HEIGHT = "2rem";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DUR_OPEN_MS = "180ms";
const DUR_CLOSE_MS = "145ms";
const FADE_DELAY_MS = "40ms";

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
  const [needsTruncation, setNeedsTruncation] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const isMeasured = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || isStreaming || !isMessageDone || isMeasured.current) {
      return;
    }

    setNeedsTruncation(el.scrollHeight > el.clientHeight);
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

  const isCollapsed = needsTruncation && !isExpanded;

  const contentStyle: React.CSSProperties = {
    maxHeight: isCollapsed ? CLAMP_HEIGHT : "max-content",
    transition: `max-height ${isCollapsed ? DUR_CLOSE_MS : DUR_OPEN_MS} ${EASE}`,
  };

  const fadeStyle: React.CSSProperties = {
    height: FADE_HEIGHT,
    opacity: isExpanded ? 0 : 1,
    transition: isExpanded
      ? `opacity ${DUR_OPEN_MS} ${EASE} ${FADE_DELAY_MS}`
      : `opacity ${DUR_CLOSE_MS} ${EASE}`,
  };

  return (
    <div
      className={cn(needsTruncation && "cursor-pointer")}
      onClick={handleClick}
    >
      <TimelineRow icon="circle" isLast={isLast}>
        <div className="relative min-w-0 flex-1">
          <div
            ref={contentRef}
            className={cn(
              "relative min-w-0 overflow-hidden",
              "[&_*]:transition-[padding,margin,gap]",
              isCollapsed
                ? "[&_*]:!py-0 [&_*]:!my-0 [&_*]:!gap-0 [&_*]:duration-[145ms]"
                : "[&_*]:duration-[180ms]"
            )}
            style={contentStyle}
          >
            {markdown}
          </div>
          {needsTruncation && (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0",
                "bg-gradient-to-b from-transparent via-white/85 via-65% to-white",
                "dark:via-gray-950/85 dark:to-gray-950"
              )}
              style={fadeStyle}
              aria-hidden
            />
          )}
        </div>
      </TimelineRow>
    </div>
  );
}
