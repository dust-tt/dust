"use client";
import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { sanitizeContent } from "@sparkle/components/markdown/utils";
import { Chip } from "@sparkle/components";

import type { StreamingMarkdownProps, ProcessChildrenContext } from "./types";
import { showUnsupportedDirective } from "./utils";
import { createMarkdownComponents } from "./markdownComponents";

export const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({
  content,
  animationName,
  animationDuration = "600ms",
  animationTimingFunction = "ease-out",
  animationCurve = "linear",
  isStreaming = true,
  isLastMessage = false,
  textColor = "s-text-foreground dark:s-text-foreground-night",
  forcedTextSize,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
}) => {
  const effectiveAnimationName = useMemo(() => {
    if (animationName) return animationName;

    switch (animationCurve) {
      case "accelerate":
        return "s-stream-fadeInAccelerate";
      case "accelerate-fast":
        return "s-stream-fadeInAccelerateFast";
      case "custom":
        return "s-stream-fadeInCustom";
      case "linear":
      default:
        return "s-stream-fadeIn";
    }
  }, [animationName, animationCurve]);

  const processedContent = useMemo(() => sanitizeContent(content), [content]);

  const processContext: ProcessChildrenContext = useMemo(
    () => ({
      isStreaming,
      animationName: effectiveAnimationName,
      animationDuration,
      animationTimingFunction,
    }),
    [
      isStreaming,
      effectiveAnimationName,
      animationDuration,
      animationTimingFunction,
    ]
  );

  const markdownComponents: Components = useMemo(
    () =>
      createMarkdownComponents({
        textColor,
        forcedTextSize,
        additionalMarkdownComponents,
        processContext,
      }),
    [textColor, forcedTextSize, additionalMarkdownComponents, processContext]
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

  const rehypePlugins = [
    [rehypeKatex, { output: "mathml" }],
    rehypeRaw,
  ] as PluggableList;

  try {
    return (
      <div className="s-w-full">
        <MarkdownContentContext.Provider
          value={{
            content: processedContent,
            isStreaming,
            isLastMessage,
          }}
        >
          <ReactMarkdown
            linkTarget="_blank"
            components={markdownComponents}
            remarkPlugins={markdownPlugins}
            rehypePlugins={rehypePlugins}
          >
            {processedContent}
          </ReactMarkdown>
        </MarkdownContentContext.Provider>
      </div>
    );
  } catch (error) {
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

export default StreamingMarkdown;
