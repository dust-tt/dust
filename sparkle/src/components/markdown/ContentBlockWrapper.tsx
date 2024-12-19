import React, { useCallback, useContext } from "react";

import { IconButton } from "@sparkle/components/IconButton";
import { useCopyToClipboard } from "@sparkle/hooks";
import {
  ArrowDownOnSquareIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
} from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

type SupportedContentType = "application/json" | "text/csv";

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
  content?: ClipboardContent | string;
  getContentToDownload?: GetContentToDownloadFunction;
}

export const ContentBlockWrapperContext = React.createContext<{
  setIsDarkMode: (v: boolean) => void;
  isDarkMode: boolean;
}>({
  setIsDarkMode: () => {},
  isDarkMode: false,
});

export function ContentBlockWrapper({
  children,
  className,
  content,
  getContentToDownload,
}: ContentBlockWrapperProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const { isDarkMode } = useContext(ContentBlockWrapperContext);
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
    <div className="s-relative">
      <div
        className={cn(
          "s-relative s-w-auto s-overflow-x-auto s-rounded-lg",
          className ?? ""
        )}
      >
        <div className="s-w-full s-table-auto">{children}</div>
      </div>

      <div className="s-absolute s-right-1 s-top-1 s-flex s-gap-1 s-rounded-xl">
        {getContentToDownload && (
          <IconButton
            variant={isDarkMode ? "ghost" : "outline"}
            size="xs"
            icon={ArrowDownOnSquareIcon}
            onClick={handleDownload}
          />
        )}
        {content && (
          <IconButton
            variant={isDarkMode ? "ghost" : "outline"}
            size="xs"
            icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
            onClick={handleCopyToClipboard}
          />
        )}
      </div>
    </div>
  );
}
