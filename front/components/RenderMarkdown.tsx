import {
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";

export function RenderMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      linkTarget="_blank"
      components={{
        pre: PreBlock,
        code: CodeBlock,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function PreBlock({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState<boolean>(false);

  const handleClick = async () => {
    if (!children || !Array.isArray(children)) return;
    const text = children[0].props.children[0];

    await navigator.clipboard.writeText(text || "");
    setConfirmed(true);
    void setTimeout(() => {
      setConfirmed(false);
    }, 1000);
  };

  return (
    <pre>
      <div className="relative">
        <div className="absolute right-2 top-2 text-white">
          <IconButton
            variant="tertiary"
            icon={confirmed ? ClipboardCheckIcon : ClipboardIcon}
            onClick={handleClick}
          />
        </div>
        {children}
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
  return !inline && match ? (
    <SyntaxHighlighter
      className="rounded-md"
      style={a11yDark}
      language={match[1]}
      PreTag="div"
    >
      {String(children).replace(/\n$/, "")}
    </SyntaxHighlighter>
  ) : (
    <code className="bg-action-50">{children}</code>
  );
}
