import {
  ClipboardCheckIcon,
  ClipboardIcon,
  IconButton,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import { useCopyToClipboard } from "@app/components/assistant/RenderMessageMarkdown";

interface ClipboardBannerProps {
  children: React.ReactNode;
  content: string;
}

export function ClipboardBanner({ children, content }: ClipboardBannerProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  const handleCopyToClipboard = useCallback(() => {
    const data = new ClipboardItem({
      "text/plain": new Blob([content], {
        type: "text/plain",
      }),
    });
    void copyToClipboard(data);
  }, [content, copyToClipboard]);

  return (
    <div className="relative">
      <div className="relative w-auto overflow-x-auto rounded-lg border border-structure-200 dark:border-structure-200-dark">
        <div className="w-full table-auto">{children}</div>
      </div>

      <div className="absolute right-2 top-2 mx-2 rounded-xl">
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
