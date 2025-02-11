import React, { Suspense } from "react";
import { amber, emerald, pink, sky, slate, violet } from "tailwindcss/colors";

import { cn } from "@sparkle/lib";

const SyntaxHighlighter = React.lazy(
  () => import("react-syntax-highlighter/dist/esm/default-highlight")
);

type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
  wrapLongLines?: boolean;
};

export function CodeBlock({
  children,
  className,
  inline,
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
      color: sky[600],
    },
    "hljs-title": {
      // Function names
      color: sky[600],
    },
    "hljs-built_in": {
      // document, console, Date
      color: amber[500],
    },
    "hljs-string": {
      // Regular strings
      color: emerald[500],
    },
    "hljs-variable": {
      // Regular variables
      color: slate[900],
    },
    "hljs-literal": {
      // true, false, null
      color: amber[500],
    },
    "hljs-number": {
      // Numeric values
      color: amber[500],
    },
    "hljs-comment": {
      // Comments
      color: amber[700],
    },
    "hljs-template-variable": {
      // Template literal variables ${...}
      color: pink[500],
    },
    "hljs-property": {
      // Object properties
      color: slate[900],
    },
    "hljs-punctuation": {
      // Brackets, dots, etc
      color: slate[900],
    },
    "hljs-operator": {
      // =, +, -, etc
      color: violet[500],
    },
    "hljs-method": {
      // Method calls
      color: sky[600],
    },
    "hljs-tag": {
      // HTML tags
      color: pink[500],
    },
    "hljs-name": {
      // Tag names
      color: pink[500],
    },
    "hljs-attr": {
      // HTML attributes
      color: amber[500],
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
      <div className="s-text-slate-900 dark:s-text-blue-200">
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
    <code
      className={cn(
        "s-mx-0.5 s-cursor-text s-rounded-lg s-border s-px-1.5 s-py-1",
        "s-border-border-dark dark:s-border-border-dark-night",
        "s-bg-muted dark:s-bg-muted-night",
        "s-text-amber-600 dark:s-text-amber-600-night"
      )}
    >
      {children}
    </code>
  );
}
