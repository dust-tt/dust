/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import rehypeKatex from "rehype-katex";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

import { Checkbox, Chip } from "@sparkle/components";
import { BlockquoteBlock } from "@sparkle/components/markdown/BlockquoteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/markdown/CodeBlockWithExtendedSupport";
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
import { sanitizeContent } from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib/utils";

export const markdownHeaderClasses = {
  h1: "s-heading-2xl",
  h2: "s-heading-xl",
  h3: "s-heading-lg",
  h4: "s-text-base s-font-semibold",
  h5: "s-text-sm s-font-semibold",
  h6: "s-text-sm s-font-regular s-italic",
};

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
        <h1
          className={cn(
            "s-pb-2 s-pt-4",
            forcedTextSize ? forcedTextSize : sizes.h1,
            textColor
          )}
        >
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2
          className={cn(
            "s-pb-2 s-pt-4",
            forcedTextSize ? forcedTextSize : sizes.h2,
            textColor
          )}
        >
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3
          className={cn(
            "s-pb-2 s-pt-4",
            forcedTextSize ? forcedTextSize : sizes.h3,
            textColor
          )}
        >
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4
          className={cn(
            "s-pb-2 s-pt-3",
            forcedTextSize ? forcedTextSize : sizes.h4,
            textColor
          )}
        >
          {children}
        </h4>
      ),
      h5: ({ children }) => (
        <h5
          className={cn(
            "s-pb-1.5 s-pt-2.5",
            forcedTextSize ? forcedTextSize : sizes.h5,
            textColor
          )}
        >
          {children}
        </h5>
      ),
      h6: ({ children }) => (
        <h6
          className={cn(
            "s-pb-1.5 s-pt-2.5",
            forcedTextSize ? forcedTextSize : sizes.h6,
            textColor
          )}
        >
          {children}
        </h6>
      ),
      strong: ({ children }) => (
        <strong className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
          {children}
        </strong>
      ),
      input: Input,
      blockquote: BlockquoteBlock,
      hr: () => (
        <div className="s-my-6 s-border-b s-border-primary-150 dark:s-border-primary-150-night" />
      ),
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
      className={cn(
        "s-break-all s-font-semibold s-transition-all s-duration-200 s-ease-in-out hover:s-underline",
        "s-text-highlight dark:s-text-highlight-night",
        "hover:s-text-highlight-400 dark:hover:s-text-highlight-400-night",
        "active:s-text-highlight-dark dark:active:s-text-highlight-dark-night"
      )}
    >
      {children}
    </a>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "ref"> &
  ReactMarkdownProps & {
    ref?: React.Ref<HTMLInputElement>;
  };

function Input({
  type,
  checked,
  className,
  onChange,
  ref,
  ...props
}: InputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inputRef.current!);

  if (type !== "checkbox") {
    return (
      <input
        ref={inputRef}
        type={type}
        checked={checked}
        className={className}
        {...props}
      />
    );
  }

  const handleCheckedChange = (isChecked: boolean) => {
    onChange?.({
      target: { type: "checkbox", checked: isChecked },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <div className="s-inline-flex s-items-center">
      <Checkbox
        ref={inputRef as React.Ref<HTMLButtonElement>}
        size="xs"
        checked={checked}
        className="s-translate-y-[3px]"
        onCheckedChange={handleCheckedChange}
      />
    </div>
  );
}
