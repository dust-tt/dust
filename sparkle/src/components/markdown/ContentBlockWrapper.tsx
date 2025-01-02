import React, { useCallback } from "react";

import { Button } from "@sparkle/components/";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDownOnSquareIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
} from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

export type SupportedContentType = "application/json" | "text/csv";

const contentTypeExtensions: Record<SupportedContentType, string> = {
  "application/json": ".json",
  "text/csv": ".csv",
};

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
}

export function ContentBlockWrapper({
  children,
  className,
  innerClassName,
  content,
  actions,
  getContentToDownload,
}: ContentBlockWrapperProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const handleCopyToClipboard = useCallback(() => {
    if (!content) {
      return;
    }

    const rawContent: ClipboardContent =
      typeof content === "string" ? { "text/plain": content } : content;

    // Replace invisible non-breaking spaces with regular spaces.
    if (rawContent["text/plain"]) {
      rawContent["text/plain"] = rawContent["text/plain"].replaceAll(
        "\xa0",
        " "
      );
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
  }, [content, copyToClipboard]);

  const handleDownload = useCallback(async () => {
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
  }, [getContentToDownload]);

  return (
    <div
      id="BlockWrapper"
      className={cn(
        "s-relative s-w-full !s-overflow-visible s-rounded-2xl",
        className
      )}
    >
      <div
        id="BlockActions"
        className="s-absolute s-right-2 s-top-2 s-z-50"
        style={{ pointerEvents: "none" }}
      >
        <div className="s-flex s-flex-row s-space-x-2">
          {actions && <div style={{ pointerEvents: "auto" }}>{actions}</div>}
          {getContentToDownload && (
            <div style={{ pointerEvents: "auto" }}>
              <Button
                variant={"outline"}
                size="xs"
                icon={ArrowDownOnSquareIcon}
                onClick={handleDownload}
                tooltip="Download"
              />
            </div>
          )}
          {content && (
            <div style={{ pointerEvents: "auto" }}>
              <Button
                variant={"outline"}
                size="xs"
                icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                onClick={handleCopyToClipboard}
                tooltip="Copy"
              />
            </div>
          )}
        </div>
      </div>
      <div
        className={cn("s-w-full", innerClassName)}
        style={{ cursor: "text" }}
      >
        {children}
      </div>
    </div>
  );
}
