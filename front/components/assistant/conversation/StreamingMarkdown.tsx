import { Markdown } from "@dust-tt/sparkle";
import React from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { useSmoothStream } from "@app/components/assistant/conversation/hooks/useSmoothStream";
import { sanitizeVisualizationContent } from "@app/components/markdown/VisualizationBlock";

type StreamingMarkdownProps = {
  content: string;
  // Use this to control the reveal animation (active while the backend streams).
  isStreaming: boolean;
  // Use this specifically for Sparkle's cursor behavior (keeps prior semantics).
  isStreamingTokensForCursor: boolean;
  isLastMessage: boolean;
  additionalMarkdownComponents: Components;
  additionalMarkdownPlugins: PluggableList;
};

export function StreamingMarkdown({
  content,
  isStreaming,
  isLastMessage,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
}: StreamingMarkdownProps) {
  const sanitized = React.useMemo(
    () => sanitizeVisualizationContent(content || ""),
    [content]
  );

  const { displayed } = useSmoothStream(sanitized, isStreaming, {
    granularity: "word",
    stepWords: 1,
    minDelayMs: 120, // even slower cadence
    adaptiveFactorWords: 0, // disable adaptive to keep pace slow
  });

  // Trigger a faint pulse on the gradient overlay when new words appear.
  const pulseClass = React.useMemo(() => {
    if (!isStreaming) {
      return "";
    }
    return displayed.length % 2 === 0 ? "stream-pulse-a" : "stream-pulse-b";
  }, [isStreaming, displayed.length]);

  return (
    <div
      className={isStreaming ? `stream-gradient-mask ${pulseClass}` : undefined}
    >
      <Markdown
        content={isStreaming ? displayed : sanitized}
        isStreaming={false}
        isLastMessage={isLastMessage}
        additionalMarkdownComponents={additionalMarkdownComponents}
        additionalMarkdownPlugins={additionalMarkdownPlugins}
      />
    </div>
  );
}
