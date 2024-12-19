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

import { BlockquoteBlock } from "@sparkle/components/markdown/BlockquoteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/markdown/CodeBlockWithExtendedSupport";
import {
  ContentBlockWrapper,
  GetContentToDownloadFunction,
} from "@sparkle/components/markdown/ContentBlockWrapper";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import {
  TableBlock,
  TableBodyBlock,
  TableDataBlock,
  TableHeadBlock,
  TableHeaderBlock,
} from "@sparkle/components/markdown/TableBlock";
import {
  detectLanguage,
  sanitizeContent,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib/utils";

const headerColor = "s-text-foreground";
const sizes = {
  sm: {
    p: "s-text-base",
    h1: "s-text-xl s-font-semibold",
    h2: "s-text-xl s-font-regular",
    h3: "s-text-lg s-font-semibold",
    h4: "s-text-base s-font-semibold",
    h5: "s-text-base s-font-medium",
    h6: "s-text-base s-font-bold",
  },
  base: {
    p: "s-text-base",
    h1: "s-text-4xl s-font-semibold",
    h2: "s-text-3xl s-font-semibold",
    h3: "s-text-2xl s-font-semibold",
    h4: "s-text-xl s-font-bold",
    h5: "s-text-lg s-font-medium",
    h6: "s-text-base s-font-bold",
  },
};
type TextSize = "sm" | "base";

function showUnsupportedDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.type === "textDirective") {
        node.type = "text";
        node.value = `:${node.name}${node.children ? node.children.map((c: any) => c.value).join("") : ""}`;
      }
    });
  };
}

export function Markdown({
  content,
  isStreaming = false,
  textSize = "base",
  textColor = "s-text-foreground",
  isLastMessage = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
}: {
  content: string;
  isStreaming?: boolean;
  textSize?: TextSize;
  textColor?: string;
  isLastMessage?: boolean;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
}) {
  const processedContent = useMemo(() => sanitizeContent(content), [content]);

  const markdownComponents: Components = useMemo(() => {
    return {
      pre: ({ children }) => <PreBlock>{children}</PreBlock>,
      a: LinkBlock,
      ul: ({ children }) => (
        <UlBlock textSize={textSize} textColor={textColor}>
          {children}
        </UlBlock>
      ),
      ol: ({ children, start }) => (
        <OlBlock start={start} textSize={textSize} textColor={textColor}>
          {children}
        </OlBlock>
      ),
      li: ({ children }) => (
        <LiBlock textSize={textSize} textColor={textColor}>
          {children}
        </LiBlock>
      ),
      p: ({ children }) => (
        <ParagraphBlock textSize={textSize} textColor={textColor}>
          {children}
        </ParagraphBlock>
      ),
      table: TableBlock,
      thead: TableHeadBlock,
      tbody: TableBodyBlock,
      th: TableHeaderBlock,
      td: TableDataBlock,
      h1: ({ children }) => (
        <h1 className={cn("s-pb-2 s-pt-4", sizes[textSize].h1, headerColor)}>
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className={cn("s-pb-2 s-pt-4", sizes[textSize].h2, headerColor)}>
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className={cn("s-pb-2 s-pt-4", sizes[textSize].h3, headerColor)}>
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4 className={cn("s-pb-2 s-pt-3", sizes[textSize].h4, headerColor)}>
          {children}
        </h4>
      ),
      h5: ({ children }) => (
        <h5
          className={cn("s-pb-1.5 s-pt-2.5", sizes[textSize].h5, headerColor)}
        >
          {children}
        </h5>
      ),
      h6: ({ children }) => (
        <h6
          className={cn("s-pb-1.5 s-pt-2.5", sizes[textSize].h6, headerColor)}
        >
          {children}
        </h6>
      ),
      strong: ({ children }) => (
        <strong className="s-font-semibold s-text-foreground">
          {children}
        </strong>
      ),
      blockquote: BlockquoteBlock,
      hr: () => <div className="s-my-6 s-border-b s-border-structure-200" />,
      code: CodeBlockWithExtendedSupport,
      ...additionalMarkdownComponents,
    };
  }, [textSize, textColor, additionalMarkdownComponents]);

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
}

function LinkBlock({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="s-break-all s-font-semibold s-text-highlight s-transition-all s-duration-200 s-ease-in-out hover:s-text-action-400 hover:s-underline active:s-text-highlight-dark"
    >
      {children}
    </a>
  );
}

function PreBlock({ children }: { children: React.ReactNode }) {
  const validChildrenContent =
    Array.isArray(children) && children[0]
      ? children[0].props.children[0]
      : null;

  let fallbackData: string | null = null;
  if (!validChildrenContent) {
    fallbackData =
      Array.isArray(children) && children[0]
        ? children[0].props?.node?.data?.meta
        : null;
  }

  const text = validChildrenContent || fallbackData || "";
  const language = detectLanguage(children);

  const getContentToDownload: GetContentToDownloadFunction | undefined =
    language === "csv"
      ? async () => {
          return {
            content: text,
            filename: `dust_output_${Date.now()}`,
            type: "text/csv",
          };
        }
      : undefined;

  return (
    <>
      <pre
        className={cn(
          "s-my-2 s-w-full s-break-all s-rounded-2xl s-border s-border-border s-bg-muted-background"
        )}
      >
        <ContentBlockWrapper
          content={{
            "text/plain": text,
          }}
          getContentToDownload={getContentToDownload}
        >
          {validChildrenContent ? children : fallbackData || children}
        </ContentBlockWrapper>
      </pre>
    </>
  );
}

function UlBlock({
  children,
  textColor,
  textSize,
}: {
  children: React.ReactNode;
  textColor: string;
  textSize: TextSize;
}) {
  return (
    <ul
      className={cn(
        "s-list-disc s-py-2 s-pl-8 first:s-pt-0 last:s-pb-0",
        textColor,
        sizes[textSize].p
      )}
    >
      {children}
    </ul>
  );
}
function OlBlock({
  children,
  start,
  textColor,
  textSize,
}: {
  children: React.ReactNode;
  start?: number;
  textColor: string;
  textSize: TextSize;
}) {
  return (
    <ol
      start={start}
      className={cn(
        "s-list-decimal s-py-3 s-pl-8 first:s-pt-0 last:s-pb-0",
        textColor,
        sizes[textSize].p
      )}
    >
      {children}
    </ol>
  );
}
function LiBlock({
  children,
  textColor,
  textSize,
  className = "",
}: {
  children: React.ReactNode;
  textColor: string;
  textSize: TextSize;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "s-break-words first:s-pt-0 last:s-pb-0",
        textSize === "sm" ? "s-py-1" : "s-py-2",
        textColor,
        sizes[textSize].p,
        className
      )}
    >
      {children}
    </li>
  );
}
function ParagraphBlock({
  children,
  textColor,
  textSize,
}: {
  children: React.ReactNode;
  textColor: string;
  textSize: TextSize;
}) {
  return (
    <div
      className={cn(
        "s-whitespace-pre-wrap s-break-words s-font-normal first:s-pt-0 last:s-pb-0",
        textSize === "sm" ? "s-py-1" : "s-py-2 s-leading-7",
        sizes[textSize].p,
        textColor
      )}
    >
      {children}
    </div>
  );
}
