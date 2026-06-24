import { Chip } from "@sparkle/components/Chip";
import { createBaseMarkdownComponents } from "@sparkle/components/markdown/createBaseMarkdownComponents";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { MarkdownStyleContext } from "@sparkle/components/markdown/MarkdownStyleContext";
import { safeRehypeKatex } from "@sparkle/components/markdown/safeRehypeKatex";
import {
  type StreamingState,
  useAnimatedText,
} from "@sparkle/components/markdown/useAnimatedText";
import {
  preserveLineBreaks,
  sanitizeContent,
} from "@sparkle/components/markdown/utils";
import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

export { markdownHeaderClasses } from "@sparkle/components/markdown/markdownSizes";

const DEFAULT_ANIMATION_DURATION_SECONDS = 1;
const DEFAULT_DELIMITER = "";

function showUnsupportedDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.type === "textDirective") {
        // it's not a valid directive, so we'll leave it as plain text
        node.type = "text";
        node.value = `:${node.name}${node.children ? node.children.map((c: any) => c.value).join("") : ""}`;
      }
    });
  };
}

export interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
  streamingState?: StreamingState;
  textColor?: string;
  isLastMessage?: boolean;
  compactSpacing?: boolean; // When true, removes vertical padding from paragraph blocks for tighter spacing
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  canCopyQuotes?: boolean;
  enableAnimation?: boolean;
  animationDurationSeconds?: number;
  delimiter?: string;
  /** When true (default), skip re-rendering blocks whose AST position is unchanged. */
  optimizeForStreaming?: boolean;
}

export const Markdown: React.FC<MarkdownProps> = ({
  content,
  isStreaming = false,
  streamingState,
  textColor = "s-text-foreground dark:s-text-foreground-night",
  forcedTextSize,
  isLastMessage = false,
  compactSpacing = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  canCopyQuotes = true,
  enableAnimation = false,
  animationDurationSeconds = DEFAULT_ANIMATION_DURATION_SECONDS,
  delimiter = DEFAULT_DELIMITER,
  optimizeForStreaming = true,
}) => {
  // Derive streaming state: explicit prop takes priority, otherwise derive from isStreaming boolean.
  // @TODO: remove isStreaming prop and use streamingState prop only
  const effectiveStreamingState: StreamingState =
    streamingState ?? (isStreaming ? "streaming" : "none");

  const processedContent = useMemo(() => {
    let sanitized = sanitizeContent(content);
    if (compactSpacing) {
      sanitized = preserveLineBreaks(sanitized);
    }
    return sanitized;
  }, [content, compactSpacing]);

  // Animate text during streaming for a smooth reveal effect.
  const animatedContent = useAnimatedText(
    processedContent,
    enableAnimation ? effectiveStreamingState : "none",
    animationDurationSeconds,
    delimiter
  );

  const styleContextValue = useMemo(
    () => ({
      textColor,
      forcedTextSize,
      compactSpacing,
      canCopyQuotes,
    }),
    [textColor, forcedTextSize, compactSpacing, canCopyQuotes]
  );

  // Note on re-renderings. A lot of effort has been put into preventing rerendering across markdown
  // AST parsing rounds (happening at each token being streamed).
  //
  // All base components are React.memo'd with sameNodePosition custom comparison.
  // During streaming, unchanged nodes (same AST position) skip re-rendering entirely.
  // Style props flow through MarkdownStyleContext, which bypasses memo when values change.
  //
  // Minimal test whenever editing this code: ensure that code block content of a streaming message
  // can be selected without blinking.

  // When optimizeForStreaming is false, plain (non-memo) block components are used so
  // content edits at unchanged AST positions still re-render (e.g. file preview).

  const baseMarkdownComponents: Components = useMemo(
    () => createBaseMarkdownComponents(optimizeForStreaming),
    [optimizeForStreaming]
  );

  // Merge base components with additional directive components.
  const markdownComponents: Components = useMemo(
    () => ({
      ...baseMarkdownComponents,
      ...additionalMarkdownComponents,
    }),
    [baseMarkdownComponents, additionalMarkdownComponents]
  );

  const markdownPlugins: PluggableList = useMemo(
    () => [
      remarkDirective,
      remarkGfm,
      [remarkMath, { singleDollarTextMath: false }],
      ...(additionalMarkdownPlugins || []),
      showUnsupportedDirective,
    ],
    [additionalMarkdownPlugins]
  );

  const rehypePlugins = useMemo(
    () => [[safeRehypeKatex, { output: "mathml" }]] as PluggableList,
    []
  );

  const contentContextValue = useMemo(
    () => ({
      content: processedContent,
      isStreaming: effectiveStreamingState === "streaming",
      isLastMessage,
    }),
    [processedContent, effectiveStreamingState, isLastMessage]
  );

  try {
    return (
      <div className="s-w-full">
        <MarkdownStyleContext.Provider value={styleContextValue}>
          <MarkdownContentContext.Provider value={contentContextValue}>
            <ReactMarkdown
              linkTarget="_blank"
              components={markdownComponents}
              remarkPlugins={markdownPlugins}
              rehypePlugins={rehypePlugins}
            >
              {animatedContent}
            </ReactMarkdown>
          </MarkdownContentContext.Provider>
        </MarkdownStyleContext.Provider>
      </div>
    );
  } catch (_error) {
    return (
      <div className="s-w-full">
        <Chip color="warning">
          There was an error parsing this markdown content
        </Chip>
        {processedContent}
      </div>
    );
  }
};
