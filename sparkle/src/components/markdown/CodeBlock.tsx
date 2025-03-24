import { cva } from "class-variance-authority";
import React, { Suspense } from "react";
import { violet } from "tailwindcss/colors";

import { customColors } from "@sparkle/lib/colors";

const SyntaxHighlighter = React.lazy(
  () => import("react-syntax-highlighter/dist/esm/default-highlight")
);

export const codeBlockVariants = cva(
  [
    "s-mx-0.5 s-cursor-text s-rounded-lg s-border s-px-1.5 s-py-1",
    "s-border-border dark:s-border-border-night",
  ],
  {
    variants: {
      variant: {
        surface: [
          "s-bg-muted dark:s-bg-muted-night",
          "s-text-golden-600 dark:s-text-golden-600-night",
        ],
      },
    },
    defaultVariants: {
      variant: "surface",
    },
  }
);

type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
  variant?: "surface";
  wrapLongLines?: boolean;
};

export function CodeBlock({
  children,
  className,
  inline,
  variant = "surface",
  wrapLongLines = false,
}: CodeBlockProps): JSX.Element {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "text";

  const languageOverrides: { [key: string]: string } = {
    jsx: "javascript",
    tsx: "typescript",
    py: "python",
  };

  const languageToUse = languageOverrides[language] || language;

  const codeStyle = {
    hljs: {
      display: "block",
      overflowX: "auto",
      padding: "1em",
      color: "var(--s-foreground)",
      backgroundColor: "transparent",
      fontSize: "0.875rem",
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
      color: "var(--s-foreground)",
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
      color: "var(--s-foreground)",
    },
    "hljs-punctuation": {
      // Brackets, dots, etc
      color: "var(--s-foreground)",
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
      color: "var(--s-foreground)",
    },
    // Typography styles
    "hljs-emphasis": {
      fontStyle: "italic",
    },
    "hljs-strong": {
      fontWeight: "bold",
    },
  };

  return !inline && language ? (
    <Suspense fallback={<div />}>
      <div className="s-text-foreground dark:s-text-foreground-night">
        <SyntaxHighlighter
          wrapLongLines={wrapLongLines}
          style={codeStyle}
          language={languageToUse}
          PreTag="div"
          className="s-cursor-text"
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    </Suspense>
  ) : (
    <code className={codeBlockVariants({ variant })}>{children}</code>
  );
}
