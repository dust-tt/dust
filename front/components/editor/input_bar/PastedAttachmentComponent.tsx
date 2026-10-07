import { AttachmentChip, DoubleQuotes } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { NodeViewWrapper } from "@tiptap/react";

interface PastedAttachmentComponentProps {
  node: { attrs: { title?: string; fileId?: string; textContent?: string } };
  extension: {
    options: {
      onInlineText?: (fileId: string, textContent: string) => void;
    };
  };
}

export function PastedAttachmentComponent({
  node,
  extension,
}: PastedAttachmentComponentProps) {
  const { t } = useLingui();
  const { title, fileId, textContent } = node.attrs;
  const { onInlineText } = extension.options;

  const handleClick = () => {
    if (fileId && onInlineText && textContent) {
      onInlineText(fileId, textContent);
    }
  };

  const displayTitle =
    title !== undefined && title !== null
      ? t`${title} (click to inline)`
      : t`Pasted attachment (click to inline)`;
  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <div
        onClick={handleClick}
        className={
          fileId && onInlineText && textContent ? "cursor-pointer" : undefined
        }
      >
        <AttachmentChip
          label={displayTitle}
          icon={{ visual: DoubleQuotes }}
          color="highlight"
        />
      </div>
    </NodeViewWrapper>
  );
}
