import {
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import remarkGfm from "remark-gfm";

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
        p: React.Fragment,
      }}
      remarkPlugins={[remarkGfm]}
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
    <pre className="max-w-3xl break-all rounded-md bg-slate-900 p-2 text-white">
      {/** should not need class max-w-3xl */}
      <div className="relative">
        <div className="absolute right-1 top-1 text-white">
          {(validChildrenContent || fallbackData) && (
            <IconButton
              variant="tertiary"
              icon={confirmed ? ClipboardCheckIcon : ClipboardIcon}
              onClick={handleClick}
            />
          )}
        </div>
        <div className="overflow-auto pt-8">
          {validChildrenContent ? children : fallbackData || children}
        </div>
      </div>
    </pre>
  );
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
  let language = match ? match[1] : "text";
  const supportedLanguages = ["js", "ts", "tsx", "json", "text", "python"];
  if (!supportedLanguages.includes(language)) {
    language = "text";
  }

  return !inline && language ? (
    <SyntaxHighlighter
      className="rounded-md"
      style={a11yDark}
      language={language}
      PreTag="div"
    >
      {String(children).replace(/\n$/, "")}
    </SyntaxHighlighter>
  ) : (
    <code className="rounded-md bg-action-50 p-1">{children}</code>
  );
}
