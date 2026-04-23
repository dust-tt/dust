import { TimelineRow } from "@app/components/assistant/conversation/actions/inline/TimelineRow";
import { cn, Markdown } from "@dust-tt/sparkle";
import { useState } from "react";

const MAX_THINKING_DISPLAY_LENGTH = 250;

const CLAMP_LINES = 3;
const LINE_HEIGHT = 1.65;

const CLAMP_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const OPEN_DURATION_MS = 180;
const CLOSE_DURATION_MS = 145;
const FADE_DELAY_OPEN_MS = 60;

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
  const isCollapsed = needsTruncation && !isExpanded;

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

  const durationMs = isExpanded ? OPEN_DURATION_MS : CLOSE_DURATION_MS;

  return (
    <div
      className={cn(needsTruncation && "cursor-pointer select-none")}
      onClick={
        needsTruncation
          ? () => setIsExpanded((expanded) => !expanded)
          : undefined
      }
    >
      <TimelineRow icon="circle" isLast={isLast}>
        <div className="relative min-w-0 flex-1">
          <div
            className={cn("thinking-clamp min-w-0 overflow-hidden", {
              "is-collapsed": isCollapsed,
            })}
            style={{
              maxHeight: isCollapsed
                ? `calc(${LINE_HEIGHT} * ${CLAMP_LINES} * 1em)`
                : "max-content",
              transition: `max-height ${durationMs}ms ${CLAMP_EASE}`,
            }}
          >
            {markdown}
          </div>

          {needsTruncation && (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0",
                "bg-gradient-to-b from-transparent via-background/85 via-[65%] to-background",
                "dark:via-background-night/85 dark:to-background-night"
              )}
              style={{
                height: `calc(${LINE_HEIGHT} * 1.6em)`,
                opacity: isCollapsed ? 1 : 0,
                transition: isExpanded
                  ? `opacity ${OPEN_DURATION_MS}ms ${CLAMP_EASE} ${FADE_DELAY_OPEN_MS}ms`
                  : `opacity ${CLOSE_DURATION_MS}ms ${CLAMP_EASE}`,
              }}
            />
          )}
        </div>
      </TimelineRow>
    </div>
  );
}
