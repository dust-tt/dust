import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileNameFromScopedPath,
  getFilePreviewContentType,
  getFilePreviewTypeLabel,
} from "@app/lib/markdown/file_preview";
import { NodeViewWrapper } from "@tiptap/react";

interface FilePreviewComponentProps {
  node: {
    attrs: {
      contentType?: string | null;
      path?: string | null;
      title?: string | null;
    };
  };
}

export function FilePreviewComponent({ node }: FilePreviewComponentProps) {
  const { contentType, path, title } = node.attrs;
  if (!path) {
    return null;
  }

  const fileName = title || getFileNameFromScopedPath(path);
  const fileContentType = getFilePreviewContentType({
    contentType: contentType ?? undefined,
    fileName,
  });
  const typeLabel = getFilePreviewTypeLabel({
    contentType: fileContentType,
    fileName,
  });
  const FileIcon = getFileTypeIcon(fileContentType, fileName);

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <FileCitationCard
        size="xs"
        description={typeLabel}
        icon={FileIcon}
        title={fileName}
        tooltipLabel={fileName}
      />
    </NodeViewWrapper>
  );
}
