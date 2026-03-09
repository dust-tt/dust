import { Chip } from "@sparkle/components/Chip";
import { BlockquoteBlock } from "@sparkle/components/markdown/BlockquoteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/markdown/CodeBlockWithExtendedSupport";
import {
  H1Block,
  H2Block,
  H3Block,
  H4Block,
  H5Block,
  H6Block,
} from "@sparkle/components/markdown/HeadingBlock";
import { HrBlock } from "@sparkle/components/markdown/HrBlock";
import { MemoInput } from "@sparkle/components/markdown/InputBlock";
import { LinkBlock } from "@sparkle/components/markdown/LinkBlock";
import { LiBlock, OlBlock, UlBlock } from "@sparkle/components/markdown/List";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { MarkdownStyleContext } from "@sparkle/components/markdown/MarkdownStyleContext";
import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { PreBlock } from "@sparkle/components/markdown/PreBlock";
import { StrongBlock } from "@sparkle/components/markdown/StrongBlock";
import { safeRehypeKatex } from "@sparkle/components/markdown/safeRehypeKatex";
import {
  TableBlock,
  TableBodyBlock,
  TableDataBlock,
  TableHeadBlock,
  TableHeaderBlock,
} from "@sparkle/components/markdown/TableBlock";
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
  textColor?: string;
  isLastMessage?: boolean;
  compactSpacing?: boolean; // When true, removes vertical padding from paragraph blocks for tighter spacing
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  canCopyQuotes?: boolean;
}

export const Markdown: React.FC<MarkdownProps> = ({
  content,
  isStreaming = false,
  textColor = "s-text-foreground dark:s-text-foreground-night",
  forcedTextSize,
  isLastMessage = false,
  compactSpacing = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  canCopyQuotes = true,
}) => {
  const processedContent = useMemo(() => {
    let sanitized = sanitizeContent(content);
    if (compactSpacing) {
      sanitized = preserveLineBreaks(sanitized);
    }
    return sanitized;
  }, [content, compactSpacing]);

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

  // All base components are memo'd and read style props from MarkdownStyleContext,
  // so this object never needs to be recreated.
  const baseMarkdownComponents: Components = useMemo(
    () => ({
      pre: PreBlock,
      a: LinkBlock,
      ul: UlBlock,
      ol: OlBlock,
      li: LiBlock,
      p: ParagraphBlock,
      h1: H1Block,
      h2: H2Block,
      h3: H3Block,
      h4: H4Block,
      h5: H5Block,
      h6: H6Block,
      table: TableBlock,
      thead: TableHeadBlock,
      tbody: TableBodyBlock,
      th: TableHeaderBlock,
      td: TableDataBlock,
      strong: StrongBlock,
      input: MemoInput,
      blockquote: BlockquoteBlock,
      hr: HrBlock,
      code: CodeBlockWithExtendedSupport,
    }),
    []
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

  try {
    return (
      <div className="s-w-full">
        <MarkdownStyleContext.Provider value={styleContextValue}>
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
