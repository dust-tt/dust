import {
  ArrowDownOnSquareIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

import { classNames } from "@app/lib/utils";

type SupportedContentType = "application/json" | "text/csv";

const contentTypeExtensions: Record<SupportedContentType, string> = {
  "application/json": ".json",
  "text/csv": ".csv",
};

export interface ContentToDownload {
  content: string;
  filename: string;
  type: "text/csv" | "application/json";
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

export function ContentBlockWrapper({
  children,
  className,
  content,
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
    <div className="relative">
      <div
        className={classNames(
          "relative w-auto overflow-x-auto rounded-lg",
          className ?? ""
        )}
      >
        <div className="w-full table-auto">{children}</div>
      </div>

      <div className="absolute right-2 top-2 mx-2 flex gap-3 rounded-xl">
        {getContentToDownload && (
          <IconButton
            variant="tertiary"
            size="xs"
            icon={ArrowDownOnSquareIcon}
            onClick={handleDownload}
          />
        )}
        {content && (
          <IconButton
            variant="tertiary"
            size="xs"
            icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
            onClick={handleCopyToClipboard}
          />
        )}
      </div>
    </div>
  );
}

function useCopyToClipboard(
  resetInterval = 2000
): [isCopied: boolean, copy: (d: ClipboardItem) => Promise<boolean>] {
  const [isCopied, setCopied] = useState(false);

  const copy = useCallback(
    async (d: ClipboardItem) => {
      if (!navigator?.clipboard) {
        console.warn("Clipboard not supported");
        return false;
      }
      try {
        await navigator.clipboard.write([d]);
        setCopied(true);
        setTimeout(() => setCopied(false), resetInterval);
        return true;
      } catch (error) {
        console.warn("Copy failed", error);
        setCopied(false);
        return false;
      }
    },
    [resetInterval]
  );

  return [isCopied, copy];
}
