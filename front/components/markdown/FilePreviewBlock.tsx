import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import {
  FILE_PREVIEW_COMPONENT_NAME,
  FILE_PREVIEW_DIRECTIVE_NAME,
  getFileNameFromScopedPath,
  getFilePreviewContentType,
  getFilePreviewTypeLabel,
} from "@app/lib/markdown/file_preview";
import { isString } from "@app/types/shared/utils/general";
import { visit } from "unist-util-visit";

interface FilePreviewBlockProps {
  contentType?: string;
  path: string;
  title?: string;
}

function getDirectiveLabelText(children: unknown): string | undefined {
  if (!Array.isArray(children)) {
    return undefined;
  }

  const label = children
    .map((child) => {
      if (
        typeof child === "object" &&
        child !== null &&
        "value" in child &&
        isString(child.value)
      ) {
        return child.value;
      }

      return "";
    })
    .join("");

  return label.length > 0 ? label : undefined;
}

export function FilePreviewBlock({
  contentType,
  path,
  title,
}: FilePreviewBlockProps) {
  if (!path) {
    return null;
  }

  const fileName = title || getFileNameFromScopedPath(path);
  const fileContentType = getFilePreviewContentType({
    contentType,
    fileName,
  });
  const typeLabel = getFilePreviewTypeLabel({
    contentType: fileContentType,
    fileName,
  });

  return (
    <PreviewableCitation
      filePath={path}
      contentType={fileContentType}
      title={fileName}
      description={typeLabel}
      size="xs"
    />
  );
}

export function getFilePreviewPlugin() {
  return FilePreviewBlock;
}

export function filePreviewDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name !== FILE_PREVIEW_DIRECTIVE_NAME) {
        return;
      }

      const path = node.attributes?.path;
      if (!isString(path) || path.length === 0) {
        return;
      }

      const titleFromLabel = getDirectiveLabelText(node.children);
      const titleFromAttribute = node.attributes?.title;
      const contentType =
        node.attributes?.contentType ??
        node.attributes?.content_type ??
        node.attributes?.mimeType;
      let title: string | undefined;
      if (isString(titleFromLabel)) {
        title = titleFromLabel;
      } else if (isString(titleFromAttribute)) {
        title = titleFromAttribute;
      }

      const data = node.data ?? (node.data = {});
      data.hName = FILE_PREVIEW_COMPONENT_NAME;
      data.hProperties = {
        path,
        title,
        contentType: isString(contentType) ? contentType : undefined,
      };
    });
  };
}
