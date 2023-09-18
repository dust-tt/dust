import {
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import {
  amber,
  blue,
  emerald,
  pink,
  slate,
  violet,
  yellow,
} from "tailwindcss/colors";
import { visit } from "unist-util-visit";

function customDirectivesPlugin() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention") {
        const data = node.data || (node.data = {});
        data.hName = "span";
        data.hProperties = {
          className: "inline-block font-medium text-brand",
        };
        node.children.unshift({ type: "text", value: "@" });
      }
    });
  };
}

function addClosingBackticks(str: string): string {
  // Regular expression to find either a single backtick or triple backticks
  const regex = /(`{1,3})/g;
  let singleBackticks = 0;
  let tripleBackticks = 0;

  // Search for all backticks in the string and update counts
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (match[1] === "```") {
      tripleBackticks++;
    } else if (match[1] === "`") {
      singleBackticks++;
    }
  }
  // Append closing backticks if needed
  if (tripleBackticks % 2 !== 0) {
    if (str.endsWith("`")) {
      str += "``";
    } else if (str.endsWith("``")) {
      str += "`";
    } else {
      str += str.includes("\n") ? "\n```" : "```";
    }
  } else if (singleBackticks % 2 !== 0) {
    str += "`";
  }
  return str;
}

export function RenderMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      linkTarget="_blank"
      components={{
        pre: PreBlock,
        code: CodeBlock,
        a: LinkBlock,
        ul: UlBlock,
        ol: OlBlock,
        li: LiBlock,
        p: ParagraphBlock,
      }}
      remarkPlugins={[remarkDirective, customDirectivesPlugin, remarkGfm]}
    >
      {addClosingBackticks(content)}
    </ReactMarkdown>
  );
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
      className="break-all text-blue-500 hover:underline"
    >
      {children}
    </a>
  );
}

function PreBlock({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState<boolean>(false);

  const validChildrenContent =
    Array.isArray(children) && children[0]
      ? children[0].props.children[0]
      : null;

  // Sometimes the children are not valid, but the meta data is
  let fallbackData: string | null = null;
  if (!validChildrenContent) {
    fallbackData =
      Array.isArray(children) && children[0]
        ? children[0].props?.node.data?.meta
        : null;
  }

  const handleClick = async () => {
    await navigator.clipboard.writeText(
      validChildrenContent || fallbackData || ""
    );
    setConfirmed(true);
    void setTimeout(() => {
      setConfirmed(false);
    }, 1000);
  };

  return (
    <pre className="my-2 max-w-3xl break-all rounded-md bg-slate-800">
      {/** should not need class max-w-3xl */}
      <div className="relative">
        <div className="absolute right-2 top-2">
          {(validChildrenContent || fallbackData) && (
            <div className="flex gap-2 align-bottom">
              <div className="text-xs text-slate-300">
                <a onClick={handleClick} className="cursor-pointer">
                  {confirmed ? "Copied!" : "Copy"}
                </a>
              </div>
              <IconButton
                variant="tertiary"
                size="xs"
                icon={confirmed ? ClipboardCheckIcon : ClipboardIcon}
                onClick={handleClick}
              />
            </div>
          )}
        </div>
        <div className="overflow-auto pt-8">
          {validChildrenContent ? children : fallbackData || children}
        </div>
      </div>
    </pre>
  );
}

function UlBlock({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc py-2 first:pt-0 last:pb-0">{children}</ul>;
}
function OlBlock({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal py-3 first:pt-0 last:pb-0">{children}</ol>;
}
function LiBlock({ children }: { children: React.ReactNode }) {
  return <li className="py-2 first:pt-0 last:pb-0">{children}</li>;
}
function ParagraphBlock({ children }: { children: React.ReactNode }) {
  return <p className="py-2 first:pt-0 last:pb-0">{children}</p>;
}

function CodeBlock({
  inline,
  className,
  children,
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
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

  return !inline && language ? (
    <SyntaxHighlighter
      className="rounded-md"
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
      language={language}
      PreTag="div"
    >
      {String(children).replace(/\n$/, "")}
    </SyntaxHighlighter>
  ) : (
    <code className="rounded-md border-structure-100 bg-slate-200 p-1">
      {children}
    </code>
  );
}
