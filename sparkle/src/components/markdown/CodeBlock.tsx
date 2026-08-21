import { customColors } from "@sparkle/lib/colors";
import { safeLazy } from "@sparkle/lib/safeLazy";
import { cva } from "class-variance-authority";
import React, { Suspense } from "react";
import colors from "tailwindcss/colors";

const violet = colors.violet;

const SyntaxHighlighter = safeLazy(
  () => import("react-syntax-highlighter/dist/esm/default-highlight")
);

export const codeInlineVariants = cva(
  [
    "mx-0.5 my-0.5 cursor-text rounded-md border px-0.5 py-0",
    "border-border",
    "text-[0.90em]",
    "text-info-700",
  ],
  {
    variants: {
      variant: {
        surface: ["bg-muted/70"],
      },
    },
    defaultVariants: {
      variant: "surface",
    },
  }
);

export const codeBlockVariants = cva(
  [
    "mx-0.5 my-0.5 cursor-text rounded-md border p-2",
    "border-border",
    "text-[0.90em]",
  ],
  {
    variants: {
      variant: {
        surface: ["bg-muted/70"],
      },
    },
    defaultVariants: {
      variant: "surface",
    },
  }
);

const codeStyle = {
  hljs: {
    display: "block",
    overflowX: "auto",
    padding: "1em",
    color: "var(--color-foreground)",
    backgroundColor: "transparent",
    fontSize: "0.875rem",
  },
  "hljs-ln": {
    color: "var(--color-muted-foreground)",
    fontSize: "0.75rem",
    paddingRight: "1em",
    textAlign: "right",
    userSelect: "none",
  },
  "hljs-keyword": {
    // function, const, let, if, return
    color: violet[500],
  },
  "hljs-function": {
    color: customColors.blue[600],
  },
  "hljs-title": {
    // Function names
    color: customColors.blue[600],
  },
  "hljs-built_in": {
    // document, console, Date
    color: customColors.golden[500],
  },
  "hljs-string": {
    // Regular strings
    color: customColors.green[500],
  },
  "hljs-variable": {
    // Regular variables
    color: "var(--color-foreground)",
  },
  "hljs-literal": {
    // true, false, null
    color: customColors.golden[500],
  },
  "hljs-number": {
    // Numeric values
    color: customColors.golden[500],
  },
  "hljs-comment": {
    // Comments
    color: customColors.golden[700],
  },
  "hljs-template-variable": {
    // Template literal variables ${...}
    color: customColors.rose[500],
  },
  "hljs-property": {
    // Object properties
    color: "var(--color-foreground)",
  },
  "hljs-punctuation": {
    // Brackets, dots, etc
    color: "var(--color-foreground)",
  },
  "hljs-operator": {
    // =, +, -, etc
    color: violet[500],
  },
  "hljs-method": {
    // Method calls
    color: customColors.blue[600],
  },
  "hljs-tag": {
    // HTML tags
    color: customColors.rose[500],
  },
  "hljs-name": {
    // Tag names
    color: customColors.rose[500],
  },
  "hljs-attr": {
    // HTML attributes
    color: customColors.golden[500],
  },
  "hljs-params": {
    // Function parameters
    color: "var(--color-foreground)",
  },
  // Typography styles
  "hljs-emphasis": {
    fontStyle: "italic",
  },
  "hljs-strong": {
    fontWeight: "bold",
  },
};

interface CodeBlockProps {
  children?: React.ReactNode;
  /** CSS class; the language is derived from a `language-<lang>` token (e.g. "language-typescript"). */
  className?: string;
  /** When true, renders a short in-sentence snippet instead of a multi-line block. */
  inline?: boolean;
  /** Visual variant; only "surface" is currently supported. */
  variant?: "surface";
  /** Wraps long lines instead of scrolling horizontally — useful in narrow containers. */
  wrapLongLines?: boolean;
  /** Shows a line-number gutter on the left side of block code. */
  showLineNumber?: boolean;
}

/**
 * Renders syntax-highlighted code from an agent message, either as an `inline`
 * snippet or a full block, with the language derived from a `language-*`
 * className. Backs the fenced-code rendering inside Markdown output.
 * @summary Syntax-highlighted code renderer for Markdown.
 */
export function CodeBlock({
  children,
  className,
  inline,
  variant = "surface",
  wrapLongLines = false,
  showLineNumber = false,
}: CodeBlockProps): JSX.Element {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "text";

  const languageOverrides: { [key: string]: string } = {
    jsx: "javascript",
    tsx: "typescript",
    py: "python",
  };
  const languageToUse = languageOverrides[language] || language;

  return !inline ? (
    <Suspense fallback={<div />}>
      <div className="text-foreground">
        <SyntaxHighlighter
          wrapLongLines={wrapLongLines}
          showLineNumbers={showLineNumber}
          style={codeStyle}
          language={languageToUse}
          PreTag="div"
          className="cursor-text"
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    </Suspense>
  ) : (
    <code className={codeInlineVariants({ variant })}>{children}</code>
  );
}
