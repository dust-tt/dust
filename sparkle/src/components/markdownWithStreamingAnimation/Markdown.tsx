import React, { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

import { Checkbox, Chip } from "@sparkle/components";
import { MemoBlockquoteBlock } from "@sparkle/components/markdownWithStreamingAnimation/BlockquoteBlock";
import { MemoCodeBlockWithExtendedSupport } from "@sparkle/components/markdownWithStreamingAnimation/CodeBlockWithExtendedSupport";
import {
  MemoLiBlock,
  MemoOlBlock,
  MemoUlBlock,
} from "@sparkle/components/markdownWithStreamingAnimation/List";
import { MarkdownContentContext } from "@sparkle/components/markdownWithStreamingAnimation/MarkdownContentContext";
import { MemoParagraphBlock } from "@sparkle/components/markdownWithStreamingAnimation/ParagraphBlock";
import { MemoPreBlock } from "@sparkle/components/markdownWithStreamingAnimation/PreBlock";
import { safeRehypeKatex } from "@sparkle/components/markdownWithStreamingAnimation/safeRehypeKatex";
import {
  MemoTableBlock,
  MemoTableBodyBlock,
  MemoTableDataBlock,
  MemoTableHeadBlock,
  MemoTableHeaderBlock,
} from "@sparkle/components/markdownWithStreamingAnimation/TableBlock";
import {
  type StreamingState,
  useAnimatedText,
} from "@sparkle/components/markdownWithStreamingAnimation/useAnimatedText";
import {
  preserveLineBreaks,
  sanitizeContent,
} from "@sparkle/components/markdownWithStreamingAnimation/utils";
import {
  sameNodePosition,
  sameTextStyling,
} from "@sparkle/components/markdownWithStreamingAnimation/utils";
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
  p: "s-text-base s-leading-7",
  ...markdownHeaderClasses,
};

interface HeaderBlockProps extends Omit<
  ReactMarkdownProps,
  "children" | "node"
> {
  children: React.ReactNode;
  textColor: string;
  forcedTextSize?: string;
  node?: ReactMarkdownProps["node"];
}

const MemoH1Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h1
        className={cn(
          "s-pb-2 s-pt-4",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h1,
          textColor
        )}
      >
        {children}
      </h1>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH1Block.displayName = "MemoH1Block";

const MemoH2Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h2
        className={cn(
          "s-pb-2 s-pt-4",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h2,
          textColor
        )}
      >
        {children}
      </h2>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH2Block.displayName = "MemoH2Block";

const MemoH3Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h3
        className={cn(
          "s-pb-2 s-pt-4",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h3,
          textColor
        )}
      >
        {children}
      </h3>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH3Block.displayName = "MemoH3Block";

const MemoH4Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h4
        className={cn(
          "s-pb-2 s-pt-3",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h4,
          textColor
        )}
      >
        {children}
      </h4>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH4Block.displayName = "MemoH4Block";

const MemoH5Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h5
        className={cn(
          "s-pb-1.5 s-pt-2.5",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h5,
          textColor
        )}
      >
        {children}
      </h5>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH5Block.displayName = "MemoH5Block";

const MemoH6Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h6
        className={cn(
          "s-pb-1.5 s-pt-2.5",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h6,
          textColor
        )}
      >
        {children}
      </h6>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH6Block.displayName = "MemoH6Block";

interface StrongBlockProps extends Omit<
  ReactMarkdownProps,
  "children" | "node"
> {
  children: React.ReactNode;
  node?: ReactMarkdownProps["node"];
}

const MemoStrongBlock = memo(
  ({ children }: StrongBlockProps) => {
    return (
      <strong className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
        {children}
      </strong>
    );
  },
  (prev, next) => {
    return sameNodePosition(prev.node, next.node);
  }
);

MemoStrongBlock.displayName = "MemoStrongBlock";

interface HrBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  children?: React.ReactNode;
  node?: ReactMarkdownProps["node"];
}

const MemoHrBlock = memo(
  (_props: HrBlockProps) => {
    return (
      <div className="s-my-6 s-border-b s-border-primary-150 dark:s-border-primary-150-night" />
    );
  },
  (prev, next) => {
    return sameNodePosition(prev.node, next.node);
  }
);

MemoHrBlock.displayName = "MemoHrBlock";

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

const defaultDelimiter = "";
const defaultAnimationDuration = 4;

export function StreamingAnimationMarkdown({
  content,
  streamingState = "ended",
  textColor = "s-text-foreground dark:s-text-foreground-night",
  forcedTextSize,
  isLastMessage = false,
  compactSpacing = false,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  canCopyQuotes = true,
  delimiter = defaultDelimiter,
  animationDuration = defaultAnimationDuration,
}: {
  content: string;
  streamingState?: StreamingState;
  textColor?: string;
  isLastMessage?: boolean;
  compactSpacing?: boolean; // When true, removes vertical padding from paragraph blocks for tighter spacing
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  canCopyQuotes?: boolean;
  delimiter?: RegExp | string;
  animationDuration?: number;
}) {
  const processedContent = useMemo(() => {
    let sanitized = sanitizeContent(content);
    if (compactSpacing) {
      sanitized = preserveLineBreaks(sanitized);
    }
    return sanitized;
  }, [content, compactSpacing]);

  const markdownContent = useAnimatedText(
    processedContent,
    streamingState,
    animationDuration,
    delimiter
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

  // Memoize markdown components to avoid unnecessary re-renders that disrupt text selection
  const markdownComponents: Components = useMemo(() => {
    return {
      pre: ({ children, node }) => (
        <MemoPreBlock node={node}>{children}</MemoPreBlock>
      ),
      a: MemoLinkBlock,
      ul: ({ children, node }) => (
        <MemoUlBlock
          node={node}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
          textColor={textColor}
        >
          {children}
        </MemoUlBlock>
      ),
      ol: ({ children, start, node }) => (
        <MemoOlBlock
          node={node}
          start={start}
          textColor={textColor}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
        >
          {children}
        </MemoOlBlock>
      ),
      li: ({ children, node }) => (
        <MemoLiBlock
          node={node}
          textColor={textColor}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
        >
          {children}
        </MemoLiBlock>
      ),
      p: ({ children, node }) => (
        <MemoParagraphBlock
          node={node}
          textColor={textColor}
          textSize={forcedTextSize ? forcedTextSize : sizes.p}
          compactSpacing={compactSpacing}
        >
          {children}
        </MemoParagraphBlock>
      ),
      table: MemoTableBlock,
      thead: MemoTableHeadBlock,
      tbody: MemoTableBodyBlock,
      th: MemoTableHeaderBlock,
      td: MemoTableDataBlock,
      h1: ({ children, node }) => (
        <MemoH1Block
          node={node}
          textColor={textColor}
          forcedTextSize={forcedTextSize}
        >
          {children}
        </MemoH1Block>
      ),
      h2: ({ children, node }) => (
        <MemoH2Block
          node={node}
          textColor={textColor}
          forcedTextSize={forcedTextSize}
        >
          {children}
        </MemoH2Block>
      ),
      h3: ({ children, node }) => (
        <MemoH3Block
          node={node}
          textColor={textColor}
          forcedTextSize={forcedTextSize}
        >
          {children}
        </MemoH3Block>
      ),
      h4: ({ children, node }) => (
        <MemoH4Block
          node={node}
          textColor={textColor}
          forcedTextSize={forcedTextSize}
        >
          {children}
        </MemoH4Block>
      ),
      h5: ({ children, node }) => (
        <MemoH5Block
          node={node}
          textColor={textColor}
          forcedTextSize={forcedTextSize}
        >
          {children}
        </MemoH5Block>
      ),
      h6: ({ children, node }) => (
        <MemoH6Block
          node={node}
          textColor={textColor}
          forcedTextSize={forcedTextSize}
        >
          {children}
        </MemoH6Block>
      ),
      strong: ({ children, node }) => (
        <MemoStrongBlock node={node}>{children}</MemoStrongBlock>
      ),
      input: MemoInput,
      blockquote: ({ children, node }) => (
        <MemoBlockquoteBlock
          node={node}
          buttonDisplay={canCopyQuotes ? "inside" : null}
        >
          {children}
        </MemoBlockquoteBlock>
      ),
      hr: ({ node }) => <MemoHrBlock node={node} />,
      code: MemoCodeBlockWithExtendedSupport,
      ...additionalMarkdownComponents,
    };
  }, [
    textColor,
    forcedTextSize,
    compactSpacing,
    canCopyQuotes,
    additionalMarkdownComponents,
  ]);

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
    [safeRehypeKatex, { output: "mathml" }],
  ] as PluggableList;

  try {
    return (
      <div className="s-w-full">
        <MarkdownContentContext.Provider
          value={{
            content: processedContent,
            isStreaming: streamingState === "streaming",
            isLastMessage,
          }}
        >
          <ReactMarkdown
            linkTarget="_blank"
            components={markdownComponents}
            remarkPlugins={markdownPlugins}
            rehypePlugins={rehypePlugins}
          >
            {markdownContent}
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

interface LinkBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  href?: string;
  children: React.ReactNode;
  node?: ReactMarkdownProps["node"];
}

const MemoLinkBlock = memo(
  ({ href, children }: LinkBlockProps) => {
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
  },
  (prev, next) => {
    return sameNodePosition(prev.node, next.node) && prev.href === next.href;
  }
);

MemoLinkBlock.displayName = "MemoLinkBlock";

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
          ref={inputRef as React.Ref<HTMLButtonElement>}
          size="xs"
          checked={checked}
          className="s-translate-y-[3px]"
          onCheckedChange={handleCheckedChange}
        />
      </div>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) &&
      prev.type === next.type &&
      prev.checked === next.checked &&
      prev.className === next.className
    );
  }
);

MemoInput.displayName = "MemoInput";
