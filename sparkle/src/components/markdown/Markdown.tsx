import { Checkbox } from "@sparkle/components/Checkbox";
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
import { LiBlock, OlBlock, UlBlock } from "@sparkle/components/markdown/List";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { MarkdownStyleContext } from "@sparkle/components/markdown/MarkdownStyleContext";
import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { PreBlock } from "@sparkle/components/markdown/PreBlock";
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
import { cn } from "@sparkle/lib/utils";
import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";
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

export function Markdown({
  content,
  isStreaming = false,
  textColor = "s-text-foreground dark:s-text-foreground-night",
  forcedTextSize,
  isLastMessage = false,
  compactSpacing = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  canCopyQuotes = true,
}: {
  content: string;
  isStreaming?: boolean;
  textColor?: string;
  isLastMessage?: boolean;
  compactSpacing?: boolean; // When true, removes vertical padding from paragraph blocks for tighter spacing
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  canCopyQuotes?: boolean;
}) {
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

  // Style props flow through MarkdownStyleContext so base component references stay stable
  // across re-renders. ReactMarkdown compares component types by reference — a new function
  // would remount the entire subtree, destroying stateful children.
  const baseMarkdownComponents: Components = useMemo(() => {
    return {
      pre: ({ children }) => <PreBlock>{children}</PreBlock>,
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
    };
  }, []);

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
      title={href}
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
        ref={inputRef as unknown as React.Ref<HTMLButtonElement>}
        size="xs"
        checked={checked}
        className="s-translate-y-[3px]"
        onCheckedChange={handleCheckedChange}
      />
    </div>
  );
}
