import React from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@sparkle/components/Button";
import { ClipboardCheckIcon, ClipboardIcon } from "@sparkle/icons";
import { classNames } from "@sparkle/lib/utils";
import { useCopyToClipboard } from "@sparkle/lib/utils";

const textColor = "s-text-element-900";
const paragraphSize = "s-text-base";
const headingSize = {
  sm: {
    h1: "s-text-xl s-font-bold",
    h2: "s-text-xl s-font-regular",
    h3: "s-text-lg s-font-bold",
  },
  md: {
    h1: "s-text-5xl s-font-semibold",
    h2: "s-text-4xl s-font-semibold",
    h3: "s-text-2xl s-font-semibold",
  },
};

export function Markdown({
  content,
  size = "sm",
  className = "",
}: {
  content: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1
            className={classNames(
              "s-pb-2 s-pt-4",
              headingSize[size].h1,
              textColor
            )}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className={classNames(
              "s-pb-2 s-pt-4",
              headingSize[size].h2,
              textColor
            )}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className={classNames(
              "s-pb-2 s-pt-4",
              headingSize[size].h3,
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
              "s-list-disc s-py-1 s-pl-7 first:s-pt-0 last:s-pb-0",
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
              "s-list-decimal s-py-1 s-pl-6 first:s-pt-0 last:s-pb-0",
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
              "s-py-1 s-pl-1 first:s-pt-0 last:s-pb-0",
              textColor,
              paragraphSize
            )}
          >
            {children}
          </li>
        ),
        hr: () => <div className="s-my-6 s-border-b s-border-structure-200" />,
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
            <div className="s-my-2 s-flex s-w-auto s-flex-row s-rounded-3xl s-border s-border-structure-100 s-bg-structure-0 s-py-2 s-pl-5 s-pr-2">
              <blockquote
                className={classNames(
                  "s-w-full s-italic",
                  paragraphSize,
                  "s-text-element-800"
                )}
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
