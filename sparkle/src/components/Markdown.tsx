import React, { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Button, ClipboardCheckIcon, ClipboardIcon } from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

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

const textColor = "s-text-element-900";
const paragraphSize = "s-text-base";

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
          <h1
            className={classNames(
              "s-pb-2 s-pt-4 s-text-5xl s-font-semibold",
              textColor
            )}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className={classNames(
              "s-pb-2 s-pt-4 s-text-4xl s-font-semibold",
              textColor
            )}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className={classNames(
              "s-pb-2 s-pt-4 s-text-2xl s-font-semibold",
              textColor
            )}
          >
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <div
            className={classNames(
              "s-first:pt-0 s-last:pb-0 s-whitespace-pre-wrap s-py-2 s-text-base",
              textColor,
              paragraphSize
            )}
          >
            {children}
          </div>
        ),
        strong: ({ children }) => (
          <strong className="s-font-semibold">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul
            className={classNames(
              "s-list-disc s-py-1 s-pl-8 first:s-pt-0 last:s-pb-0",
              textColor,
              paragraphSize
            )}
          >
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol
            className={classNames(
              "s-list-decimal s-py-1 s-pl-8 first:s-pt-0 last:s-pb-0",
              textColor,
              paragraphSize
            )}
          >
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li
            className={classNames(
              "first:s-pt-0 last:s-pb-0",
              textColor,
              paragraphSize
            )}
          >
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
            <div className="s-flex s-w-auto s-flex-row s-rounded-3xl s-border s-border-structure-100 s-bg-structure-0 s-py-2 s-pl-5 s-pr-2">
              <blockquote
                className={classNames("s-italic", paragraphSize, textColor)}
              >
                {children}
              </blockquote>
              {childrenContent && (
                <Button
                  size="xs"
                  variant="tertiary"
                  onClick={async (e) => {
                    e.preventDefault();
                    await handleCopy();
                  }}
                  label="Copy"
                  labelVisible={false}
                  icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                />
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
