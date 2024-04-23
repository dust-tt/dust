import React, { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";

import { ClipboardCheckIcon, ClipboardIcon, IconButton } from "@sparkle/index";

function useCopyToClipboard(
  resetInterval = 2000
): [isCopied: boolean, copy: (d: ClipboardItem) => Promise<boolean>] {
  const [isCopied, setCopied] = useState(false);

  const copy = useCallback(
    async (d: ClipboardItem) => {
      if (!navigator?.clipboard) {
        return false;
      }
      try {
        await navigator.clipboard.write([d]);
        setCopied(true);
        setTimeout(() => setCopied(false), resetInterval);
        return true;
      } catch (error) {
        setCopied(false);
        return false;
      }
    },
    [resetInterval]
  );

  return [isCopied, copy];
}

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
        p: ({ children }) => (
          <div className="s-first:pt-0 s-last:pb-0 s-whitespace-pre-wrap s-py-2 s-text-base s-text-element-900">
            {children}
          </div>
        ),
        strong: ({ children }) => (
          <strong className="s-font-semibold s-text-element-900">
            {children}
          </strong>
        ),
        ul: ({ children }) => (
          <ul className="s-list-disc s-py-1 s-pl-8 s-text-element-800 first:s-pt-0 last:s-pb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="s-list-decimal s-py-1 s-pl-8 s-text-element-800 first:s-pt-0 last:s-pb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className=" s-text-element-800 first:s-pt-0 last:s-pb-0">
            {children}
          </li>
        ),
        blockquote: ({ children }) => {
          const [isCopied, copyToClipboard] = useCopyToClipboard();

          const childrenContent =
            Array.isArray(children) && children[1]
              ? children[1].props.children
              : null;

          const handleCopy = async () => {
            void copyToClipboard(
              new ClipboardItem({
                "text/plain": new Blob([childrenContent ?? ""], {
                  type: "text/plain",
                }),
              })
            );
          };

          return (
            <div className="s-relative">
              <div className="s-dark:border-structure-200-dark s-relative s-w-auto s-overflow-x-auto s-rounded-lg s-border s-border-structure-200">
                <blockquote className="s-md:pl-8 s-md:mx-10 s-mx-4 s-my-8 s-border-l-4 s-border-gray-500 s-py-4 s-pl-4 s-italic">
                  <div className="s-text-lg s-font-medium">{children}</div>
                </blockquote>
              </div>
              {childrenContent && (
                <div className="s-absolute s-right-2 s-top-2 s-mx-2 s-rounded-xl s-bg-structure-50">
                  <IconButton
                    variant="tertiary"
                    size="xs"
                    icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                    onClick={async (e) => {
                      e.preventDefault();
                      await handleCopy();
                    }}
                  />
                </div>
              )}
            </div>
          );
        },
      }}
      className={className}
    >
      {content}
    </ReactMarkdown>
  );
}
