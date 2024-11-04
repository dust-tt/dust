import React, { Suspense } from "react";
import {
  amber,
  blue,
  emerald,
  pink,
  slate,
  violet,
  yellow,
} from "tailwindcss/colors";

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
  const slate900 = slate["900"];
  const slate50 = slate["50"];
  const emerald500 = emerald["500"];
  const amber400 = amber["400"];
  const amber200 = amber["200"];
  const pink400 = pink["400"];
  const yellow300 = yellow["300"];
  const blue400 = blue["400"];
  const violet400 = violet["400"];

  const languageOverrides: { [key: string]: string } = {
    jsx: "javascript",
    tsx: "typescript",
  };

  const languageToUse = languageOverrides[language] || language;

  return !inline && language ? (
    <Suspense fallback={<div />}>
      <SyntaxHighlighter
        wrapLongLines={wrapLongLines}
        style={{
          "hljs-comment": {
            color: amber200,
          },
          "hljs-quote": {
            color: amber200,
          },
          "hljs-variable": {
            color: emerald500,
          },
          "hljs-template-variable": {
            color: pink400,
          },
          "hljs-tag": {
            color: pink400,
          },
          "hljs-name": {
            color: pink400,
          },
          "hljs-selector-id": {
            color: pink400,
          },
          "hljs-selector-class": {
            color: pink400,
          },
          "hljs-regexp": {
            color: pink400,
          },
          "hljs-deletion": {
            color: pink400,
          },
          "hljs-number": {
            color: amber400,
          },
          "hljs-built_in": {
            color: amber400,
          },
          "hljs-builtin-name": {
            color: amber400,
          },
          "hljs-literal": {
            color: amber400,
          },
          "hljs-type": {
            color: amber400,
          },
          "hljs-params": {
            color: amber400,
          },
          "hljs-meta": {
            color: amber400,
          },
          "hljs-link": {
            color: amber400,
          },
          "hljs-attribute": {
            color: yellow300,
          },
          "hljs-string": {
            color: emerald500,
          },
          "hljs-symbol": {
            color: emerald500,
          },
          "hljs-bullet": {
            color: emerald500,
          },
          "hljs-addition": {
            color: emerald500,
          },
          "hljs-title": {
            color: blue400,
          },
          "hljs-section": {
            color: blue400,
          },
          "hljs-keyword": {
            color: violet400,
          },
          "hljs-selector-tag": {
            color: violet400,
          },
          hljs: {
            display: "block",
            overflowX: "auto",
            background: slate900,
            color: slate50,
            padding: "1em",
          },
          "hljs-emphasis": {
            fontStyle: "italic",
          },
          "hljs-strong": {
            fontWeight: "bold",
          },
        }}
        language={languageToUse}
        PreTag="div"
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    </Suspense>
  ) : (
    <code className="s-rounded-lg s-border-structure-200 s-bg-structure-100 s-px-1.5 s-py-1 s-text-sm s-text-amber-600 dark:s-border-structure-200-dark dark:s-bg-structure-100-dark dark:s-text-amber-400">
      {children}
    </code>
  );
}
