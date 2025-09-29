/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import rehypeKatex from "rehype-katex";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

import { Chip } from "@sparkle/components";
import { BlockquoteBlock } from "@sparkle/components/markdown/BlockquoteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/markdown/CodeBlockWithExtendedSupport";
import markdownHeaderClasses, {
  H1Block,
  H2Block,
  H3Block,
  H4Block,
  H5Block,
  H6Block,
} from "@sparkle/components/markdown/HeaderBlocks";
import { InputBlock } from "@sparkle/components/markdown/InputBlock";
import { LinkBlock } from "@sparkle/components/markdown/LinkBlock";
import { LiBlock, OlBlock, UlBlock } from "@sparkle/components/markdown/List";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { PreBlock } from "@sparkle/components/markdown/PreBlock";
import {
  TableBlock,
  TableBodyBlock,
  TableDataBlock,
  TableHeadBlock,
  TableHeaderBlock,
} from "@sparkle/components/markdown/TableBlock";
import {
  HorizontalRuleBlock,
  StrongBlock,
} from "@sparkle/components/markdown/TextFormattingBlocks";
import { sanitizeContent } from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib/utils";

const sizes = {
  p: "s-copy-sm @sm:s-text-base @sm:s-leading-7",
  ...markdownHeaderClasses,
};

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

export function Markdown({
  content,
  isStreaming = false,
  textColor = "s-text-foreground dark:s-text-foreground-night",
  forcedTextSize,
  isLastMessage = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
}: {
  content: string;
  isStreaming?: boolean;
  textColor?: string;
  isLastMessage?: boolean;
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
}) {
  const processedContent = useMemo(() => sanitizeContent(content), [content]);

  // Note on re-renderings. A lot of effort has been put into preventing rerendering across markdown
  // AST parsing rounds (happening at each token being streamed).
  //
  // When adding a new directive and associated component that depends on external data (eg
  // workspace or message), you can use the customRenderer.visualization pattern. It is essential
  // for the customRenderer argument to be memoized to avoid re-renderings through the
  // markdownComponents memoization dependency on `customRenderer`.
  //
  // Make sure to spend some time understanding the re-rendering or lack thereof through the parser
  // rounds.
  //
  // Minimal test whenever editing this code: ensure that code block content of a streaming message
  // can be selected without blinking.

  // Memoize markdown components to avoid unnecessary re-renders that disrupt text selection
  const markdownComponents: Components = useMemo(() => {
    return {
      pre: ({ children }) => <PreBlock>{children}</PreBlock>,
      a: LinkBlock,
      ul: ({ children }) => (
        <UlBlock
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
          textColor={textColor}
        >
          {children}
        </UlBlock>
      ),
      ol: ({ children, start }) => (
        <OlBlock
          start={start}
          textColor={textColor}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
        >
          {children}
        </OlBlock>
      ),
      li: ({ children }) => (
        <LiBlock
          textColor={textColor}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
        >
          {children}
        </LiBlock>
      ),
      p: ({ children }) => (
        <ParagraphBlock
          textColor={textColor}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
        >
          {children}
        </ParagraphBlock>
      ),
      table: TableBlock,
      thead: TableHeadBlock,
      tbody: TableBodyBlock,
      th: TableHeaderBlock,
      td: TableDataBlock,
      h1: ({ children }) => (
        <H1Block textColor={textColor} forcedTextSize={forcedTextSize}>
          {children}
        </H1Block>
      ),
      h2: ({ children }) => (
        <H2Block textColor={textColor} forcedTextSize={forcedTextSize}>
          {children}
        </H2Block>
      ),
      h3: ({ children }) => (
        <H3Block textColor={textColor} forcedTextSize={forcedTextSize}>
          {children}
        </H3Block>
      ),
      h4: ({ children }) => (
        <H4Block textColor={textColor} forcedTextSize={forcedTextSize}>
          {children}
        </H4Block>
      ),
      h5: ({ children }) => (
        <H5Block textColor={textColor} forcedTextSize={forcedTextSize}>
          {children}
        </H5Block>
      ),
      h6: ({ children }) => (
        <H6Block textColor={textColor} forcedTextSize={forcedTextSize}>
          {children}
        </H6Block>
      ),
      strong: ({ children }) => <StrongBlock>{children}</StrongBlock>,
      input: InputBlock,
      blockquote: BlockquoteBlock,
      hr: HorizontalRuleBlock,
      code: CodeBlockWithExtendedSupport,
      ...additionalMarkdownComponents,
    };
  }, [textColor, additionalMarkdownComponents]);

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

  const rehypePlugins = [[rehypeKatex, { output: "mathml" }]] as PluggableList;

  try {
    return (
      <div className={cn("s-w-full", isStreaming ? "s-blinking-cursor" : "")}>
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
      <div className={cn("s-w-full", isStreaming ? "s-blinking-cursor" : "")}>
        <Chip color="warning">
          There was an error parsing this markdown content
        </Chip>
        {processedContent}
      </div>
    );
  }
}
