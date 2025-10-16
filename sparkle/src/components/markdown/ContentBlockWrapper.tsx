import { cva } from "class-variance-authority";
import React, { useCallback } from "react";

import { Button } from "@sparkle/components/";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDownOnSquareIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

export type SupportedContentType = "application/json" | "text/csv";

const contentTypeExtensions: Record<SupportedContentType, string> = {
  "application/json": ".json",
  "text/csv": ".csv",
};

const wrapperVariants = cva("s-group s-relative s-w-full !s-overflow-visible", {
  variants: {
    buttonDisplay: {
      inside: "s-mt-0",
      outside: "s-mt-11",
    },
  },
  defaultVariants: {
    buttonDisplay: "outside",
  },
});

const stickyContainerVariants = cva("s-sticky s-z-[1] s-h-0", {
  variants: {
    buttonDisplay: {
      inside: "s-top-0",
      outside: "s-top-11",
    },
  },
  defaultVariants: {
    buttonDisplay: "outside",
  },
});

const actionsVariants = cva(
  "s-absolute s-right-2 s-flex s-items-center s-gap-1 s-py-2",
  {
    variants: {
      buttonDisplay: {
        inside: "",
        outside: "s-bottom-0 s-h-11",
      },
      displayActions: {
        hover:
          "s-opacity-0 s-transition-opacity s-duration-200 group-hover:s-opacity-100",
        always: "",
      },
    },
    defaultVariants: {
      buttonDisplay: "outside",
      displayActions: "always",
    },
  }
);

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
  content?: ClipboardContent | string;
  getContentToDownload?: GetContentToDownloadFunction;
  actions?: React.ReactNode[] | React.ReactNode;
  displayActions?: "hover" | "always";
  buttonDisplay?: "inside" | "outside";
}

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
    <div
      id="BlockWrapper"
      className={cn(wrapperVariants({ buttonDisplay }), className)}
    >
      <div className={stickyContainerVariants({ buttonDisplay })}>
        <div
          id="BlockActions"
          className={actionsVariants({ buttonDisplay, displayActions })}
        >
          {actions && actions}
          {getContentToDownload && (
            <Button
              variant={"outline"}
              size="xs"
              icon={ArrowDownOnSquareIcon}
              onClick={handleDownload}
              tooltip="Download"
            />
          )}
          {content && (
            <Button
              variant={"outline"}
              size="xs"
              icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
              onClick={handleCopyToClipboard}
              tooltip="Copy"
            />
          )}
        </div>
      </div>
      <div className={cn("s-z-0 s-w-full", innerClassName)}>{children}</div>
    </div>
  );
}
