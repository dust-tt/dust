import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import React from "react";

interface CoEditionCopyButtonProps {
  editor: Editor | null;
}

export function CoEditionCopyButton({ editor }: CoEditionCopyButtonProps) {
  const [isCopied, copy] = useCopyToClipboard();

  const handleCopy = React.useCallback(async () => {
    const htmlContent = editor?.getHTML();
    const rawTextContent = editor?.getText();

    if (!rawTextContent || !htmlContent) {
      return;
    }

    await copy(
      new ClipboardItem({
        "text/plain": new Blob([rawTextContent], {
          type: "text/plain",
        }),
        "text/html": new Blob([htmlContent], { type: "text/html" }),
      })
    );
  }, [copy, editor]);

  return (
    <Button
      key="copy-msg-button"
      tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
      className="text-muted-foreground"
    />
  );
}
