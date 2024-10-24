import { IconButton, SparklesIcon, WrenchIcon } from "@dust-tt/sparkle";
import mermaid from "mermaid";
import dynamic from "next/dynamic";
import { useContext, useEffect, useRef, useState } from "react";
import {
  amber,
  blue,
  emerald,
  pink,
  slate,
  violet,
  yellow,
} from "tailwindcss/colors";

import { MarkDownContentContext } from "@app/components/assistant/markdown/RenderMessageMarkdown";
import { classNames } from "@app/lib/utils";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

const MermaidGraph: React.FC<{ chart: string }> = ({ chart }) => {
  const graphRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (graphRef.current) {
      mermaid.initialize({ startOnLoad: false });
      graphRef.current.innerHTML = chart;
      void mermaid.init(undefined, graphRef.current);
    }
  }, [chart]);

  return <div ref={graphRef} className="mermaid"></div>;
};

export function CodeBlockWithExtendedSupport({
  children,
  className,
  inline,
}: {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  //   const { isValidMermaid, showMermaid } = useMermaidDisplay();
  const validChildrenContent = String(children).trim();

  const [showMermaid, setShowMermaid] = useState<boolean>(false);
  const [isValidMermaid, setIsValidMermaid] = useState<boolean>(false);
  const { isStreaming } = useContext(MarkDownContentContext);

  useEffect(() => {
    if (isStreaming || !validChildrenContent || isValidMermaid || showMermaid) {
      return;
    }

    void mermaid
      .parse(validChildrenContent)
      .then(() => {
        setIsValidMermaid(true);
        setShowMermaid(true);
      })
      .catch(() => {
        setIsValidMermaid(false);
        setShowMermaid(false);
      });
  }, [
    isStreaming,
    isValidMermaid,
    showMermaid,
    setIsValidMermaid,
    setShowMermaid,
    validChildrenContent,
  ]);

  if (!inline && isValidMermaid) {
    return (
      <div className="w-full gap-2 bg-slate-100 align-bottom">
        <>
          <div className="absolute left-2 top-2 mx-2 flex gap-2">
            <div
              className={classNames(
                "text-xs",
                showMermaid ? "text-slate-400" : "text-slate-300"
              )}
            >
              <a
                onClick={() => setShowMermaid(!showMermaid)}
                className="cursor-pointer"
              >
                {showMermaid ? "See Markdown" : "See Graph"}
              </a>
            </div>
            <IconButton
              variant="ghost"
              size="xs"
              icon={showMermaid ? WrenchIcon : SparklesIcon}
              onClick={() => setShowMermaid(!showMermaid)}
            />
          </div>
          {showMermaid ? (
            <MermaidGraph chart={validChildrenContent} />
          ) : (
            <CodeBlock className={className} inline={inline}>
              {children}
            </CodeBlock>
          )}
        </>
      </div>
    );
  }

  return (
    <CodeBlock className={className} inline={inline}>
      {children}
    </CodeBlock>
  );
}

export function CodeBlock({
  children,
  className,
  inline,
  wrapLongLines = false,
}: {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
  wrapLongLines?: boolean;
}): JSX.Element {
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

  console.log("codeblock");

  return !inline && language ? (
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
  ) : (
    <code className="rounded-lg border-structure-200 bg-structure-100 px-1.5 py-1 text-sm text-amber-600 dark:border-structure-200-dark dark:bg-structure-100-dark dark:text-amber-400">
      {children}
    </code>
  );
}
