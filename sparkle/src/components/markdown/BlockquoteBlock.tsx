import React from "react";

import { Button } from "@sparkle/components/Button";
import { useCopyToClipboard } from "@sparkle/hooks";
import { ClipboardCheckIcon, ClipboardIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

type BlockquoteBlockProps = { children: React.ReactNode };

export function BlockquoteBlock({ children }: BlockquoteBlockProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const elementAt1 = React.Children.toArray(children)[1];

  const childrenContent =
    elementAt1 && React.isValidElement(elementAt1)
      ? elementAt1.props.children
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
    <div className="s-my-2 s-flex s-w-auto s-flex-row s-rounded-2xl s-border s-border-border s-bg-white s-p-3">
      <blockquote
        className={cn("s-w-full s-italic", "s-text-base", "s-text-foreground")}
      >
        {children}
      </blockquote>
      {childrenContent && (
        <Button
          size="xs"
          variant="outline"
          onClick={async (e) => {
            e.preventDefault();
            await handleCopy();
          }}
          tooltip="Copy"
          icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
        />
      )}
    </div>
  );
}
