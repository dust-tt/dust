import { Button } from "@sparkle/components/Button";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  Clipboard,
  ClipboardCheck,
  Download01,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { useCallback } from "react";

export type SupportedContentType = "application/json" | "text/csv";

const contentTypeExtensions: Record<SupportedContentType, string> = {
  "application/json": ".json",
  "text/csv": ".csv",
};

const wrapperVariants = cva(
  "group relative w-full max-w-full min-w-0 overflow-visible",
  {
    variants: {
      buttonDisplay: {
        inside: "mt-0",
        outside: "mt-11",
      },
    },
    defaultVariants: {
      buttonDisplay: "outside",
    },
  }
);

const actionsVariants = cva("absolute right-2 flex items-center gap-1 py-2", {
  variants: {
    buttonDisplay: {
      inside: "",
      outside: "bottom-0 h-11",
    },
    displayActions: {
      hover:
        "opacity-0 transition-opacity duration-200 group-hover:opacity-100",
      always: "",
    },
  },
  defaultVariants: {
    buttonDisplay: "outside",
    displayActions: "always",
  },
});

export interface ContentToDownload {
  content: string;
  filename: string;
  type: SupportedContentType;
}

export type GetContentToDownloadFunction = () => Promise<ContentToDownload>;

type ClipboardContent = {
  "text/plain"?: string;
  "text/html"?: string;
};

interface ContentBlockWrapperProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  /** What the copy button puts on the clipboard: a plain string or a map of mime types to content. Omit to hide the copy button. */
  content?: ClipboardContent | string;
  /** Async provider of downloadable content; when set, a download button is shown. */
  getContentToDownload?: GetContentToDownloadFunction;
  /** Extra action elements rendered before the download/copy buttons. */
  actions?: React.ReactNode[] | React.ReactNode;
  /** Whether the action buttons are always visible or only on hover. */
  displayActions?: "hover" | "always";
  buttonDisplay?: "inside" | "outside" | null; // null to hide buttons
}

/**
 * Shared chrome for Markdown content blocks (code, tables, quotes): wraps its
 * children with an action bar providing copy-to-clipboard, optional download,
 * and any custom actions, positioned inside or above the block.
 * @summary Copy/download action wrapper for Markdown blocks.
 */
export function ContentBlockWrapper({
  children,
  className,
  innerClassName,
  content,
  actions,
  displayActions = "always",
  getContentToDownload,
  buttonDisplay = "outside",
}: ContentBlockWrapperProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopyToClipboard = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!content) {
        return;
      }
      const rawContent: ClipboardContent =
        typeof content === "string" ? { "text/plain": content } : content;

      // Replace invisible non-breaking spaces with regular spaces.
      if (rawContent["text/plain"]) {
        rawContent["text/plain"] = rawContent["text/plain"]
          .replaceAll("\xa0", " ")
          .trim();
      }

      const data = new ClipboardItem(
        Object.entries(rawContent).reduce(
          (acc, [type, data]) => {
            acc[type] = new Blob([data], { type });
            return acc;
          },
          {} as Record<string, Blob>
        )
      );
      void copyToClipboard(data);
    },
    [content, copyToClipboard]
  );

  const handleDownload = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!getContentToDownload) {
        return;
      }
      const { content, filename, type } = await getContentToDownload();
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.${contentTypeExtensions[type]}`;
      a.click();
    },
    [getContentToDownload]
  );

  return (
    <div className={cn(wrapperVariants({ buttonDisplay }), className)}>
      {buttonDisplay !== null && (
        <div className="relative z-[1] h-0">
          <div
            id="BlockActions"
            className={actionsVariants({ buttonDisplay, displayActions })}
          >
            {actions && actions}
            {getContentToDownload && (
              <Button
                variant={"outline"}
                size="xs"
                icon={Download01}
                onClick={handleDownload}
                tooltip="Download"
              />
            )}
            {content && (
              <Button
                variant={"outline"}
                size="xs"
                icon={isCopied ? ClipboardCheck : Clipboard}
                onClick={handleCopyToClipboard}
                tooltip="Copy"
              />
            )}
          </div>
        </div>
      )}
      <div className={cn("z-0 w-full min-w-0", innerClassName)}>{children}</div>
    </div>
  );
}
