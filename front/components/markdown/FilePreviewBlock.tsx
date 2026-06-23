import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  FILE_PREVIEW_COMPONENT_NAME,
  FILE_PREVIEW_DIRECTIVE_NAME,
  getFileNameFromScopedPath,
  getFilePreviewContentType,
  getFilePreviewTypeLabel,
} from "@app/lib/markdown/file_preview";
import { isString } from "@app/types/shared/utils/general";
import { Icon } from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
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
  const { getFilePreviewUrl, openFilePreview } = useFilePreviewContext();

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
  const FileIcon = getFileTypeIcon(fileContentType, fileName);
  const previewFile = {
    filePath: path,
    title: fileName,
    contentType: fileContentType,
  };
  const href = getFilePreviewUrl(previewFile) ?? undefined;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    openFilePreview(previewFile);
  };

  return (
    <a
      href={href}
      title={`${fileName} (${typeLabel})`}
      aria-label={`Open preview for ${fileName}`}
      onClick={handleClick}
      className="inline-flex max-w-full items-center gap-1 align-baseline font-semibold text-highlight transition-colors duration-200 hover:text-highlight-400 hover:underline hover:underline-offset-2 active:text-highlight-700 dark:text-highlight-night dark:hover:text-highlight-400-night dark:active:text-highlight-700-night"
    >
      <Icon visual={FileIcon} size="xs" className="shrink-0" />
      <span className="min-w-0 truncate">{fileName}</span>
      <span className="shrink-0 text-xs font-normal text-muted-foreground dark:text-muted-foreground-night">
        {typeLabel}
      </span>
    </a>
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
