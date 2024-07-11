import {
  ArrowDownOnSquareIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import { useCopyToClipboard } from "@app/components/assistant/RenderMessageMarkdown";

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

interface CodeBlockBannerProps {
  children: React.ReactNode;
  content: string;
  getContentToDownload?: GetContentToDownloadFunction;
}

export function CodeBlockBanner({
  children,
  content,
  getContentToDownload,
}: CodeBlockBannerProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopyToClipboard = useCallback(() => {
    const data = new ClipboardItem({
      "text/plain": new Blob([content], {
        type: "text/plain",
      }),
    });
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
      <div className="relative w-auto overflow-x-auto rounded-lg">
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
        <IconButton
          variant="tertiary"
          size="xs"
          icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
          onClick={handleCopyToClipboard}
        />
      </div>
    </div>
  );
}
