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
  type StreamingState,
  useAnimatedText,
} from "@sparkle/components/markdown/useAnimatedText";
import {
  type MarkdownNode,
  preserveLineBreaks,
  sameNodePosition,
  sanitizeContent,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib/utils";
import React, { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

// Re-export for backward compatibility (used by front/components/editor/extensions/HeadingExtension.ts).
export { markdownHeaderClasses } from "@sparkle/components/markdown/markdownSizes";

// Module-level memo'd components that don't need context.

const StrongBlock = memo(
  ({ children }: { children?: React.ReactNode; node?: MarkdownNode }) => (
    <strong className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
      {children}
    </strong>
  ),
  (prev, next) => sameNodePosition(prev.node, next.node)
);
StrongBlock.displayName = "StrongBlock";

const HrBlock = memo(
  (_props: { node?: MarkdownNode }) => (
    <div className="s-my-6 s-border-b s-border-primary-150 dark:s-border-primary-150-night" />
  ),
  (prev, next) => sameNodePosition(prev.node, next.node)
);
HrBlock.displayName = "HrBlock";

const LinkBlock = memo(
  ({
    href,
    children,
  }: {
    href?: string;
    children: React.ReactNode;
    node?: MarkdownNode;
  }) => (
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
  ),
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.href === next.href
);
LinkBlock.displayName = "LinkBlock";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "ref"> &
  ReactMarkdownProps & {
    ref?: React.Ref<HTMLInputElement>;
  };

const MemoInput = memo(
  ({ type, checked, className, onChange, ref, ...props }: InputProps) => {
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
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.type === next.type &&
    prev.checked === next.checked &&
    prev.className === next.className
);
MemoInput.displayName = "MemoInput";

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

const DEFAULT_ANIMATION_DURATION = 1;
const DEFAULT_DELIMITER = "";

export function Markdown({
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
  animationDuration = DEFAULT_ANIMATION_DURATION,
  delimiter = DEFAULT_DELIMITER,
}: {
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
  animationDuration?: number;
  delimiter?: string;
}) {
  // Derive streaming state: explicit prop takes priority, otherwise derive from isStreaming boolean.
  const effectiveStreamingState: StreamingState =
    streamingState ?? (isStreaming ? "streaming" : "ended");

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
    effectiveStreamingState,
    animationDuration,
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
              isStreaming: effectiveStreamingState === "streaming",
              isLastMessage,
            }}
          >
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
}
