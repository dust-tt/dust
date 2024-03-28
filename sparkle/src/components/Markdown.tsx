import React from "react";
import ReactMarkdown from "react-markdown";

export function Markdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="s-pb-2 s-pt-4 s-text-5xl s-font-semibold s-text-element-900">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="s-pb-2 s-pt-4 s-text-4xl s-font-semibold s-text-element-900">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="s-pb-2 s-pt-4 s-text-2xl s-font-semibold s-text-element-900">
            {children}
          </h3>
        ),
        strong: ({ children }) => (
          <strong className="s-font-semibold s-text-element-900">
            {children}
          </strong>
        ),
        ul: ({ children }) => (
          <ul className="s-list-disc s-py-2 s-pl-8 s-text-element-800 first:s-pt-0 last:s-pb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="s-list-decimal s-py-3 s-pl-8 s-text-element-800 first:s-pt-0 last:s-pb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="s-py-2 s-text-element-800 first:s-pt-0 last:s-pb-0">
            {children}
          </li>
        ),
      }}
      className={className}
    >
      {content}
    </ReactMarkdown>
  );
}
