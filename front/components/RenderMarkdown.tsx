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
        p: React.Fragment,
        code: CodeBlock,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}): JSX.Element {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "text";
  const [confirmed, setConfirmed] = useState<boolean>(false);

  const handleClick = async () => {
    await navigator.clipboard.writeText(children as string);
    setConfirmed(true);
    void setTimeout(() => {
      setConfirmed(false);
    }, 1000);
  };

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 text-white">
        <IconButton
          variant="tertiary"
          icon={confirmed ? ClipboardCheckIcon : ClipboardIcon}
          onClick={handleClick}
        />
      </div>
      <SyntaxHighlighter
        className="rounded-md"
        style={a11yDark}
        language={language}
        PreTag="div"
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    </div>
  );
}
