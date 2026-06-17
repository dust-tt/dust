import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  FILE_DOWNLOAD_COMPONENT_NAME,
  FILE_DOWNLOAD_DIRECTIVE_NAME,
  getDownloadContentType,
  getFileDownloadTypeLabel,
  getFileNameFromScopedPath,
} from "@app/lib/markdown/file_download";
import { isString } from "@app/types/shared/utils/general";
import { Icon } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

interface FileDownloadBlockProps {
  contentType?: string;
  path: string;
  title?: string;
}

interface FileDownloadPluginProps {
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

export function FileDownloadBlock({
  contentType,
  path,
  title,
}: FileDownloadBlockProps) {
  if (!path) {
    return null;
  }

  const fileName = title || getFileNameFromScopedPath(path);
  const downloadContentType = getDownloadContentType({
    contentType,
    fileName,
  });
  const typeLabel = getFileDownloadTypeLabel({
    contentType: downloadContentType,
    fileName,
  });
  const FileIcon = getFileTypeIcon(downloadContentType, fileName);

  return (
    <PreviewableCitation
      filePath={path}
      contentType={downloadContentType}
      title={fileName}
      description={typeLabel}
      icon={<Icon visual={FileIcon} size="xs" />}
    />
  );
}

export function getFileDownloadPlugin() {
  function FileDownloadPlugin({
    contentType,
    path,
    title,
  }: FileDownloadPluginProps) {
    return (
      <FileDownloadBlock contentType={contentType} path={path} title={title} />
    );
  }

  return FileDownloadPlugin;
}

export function fileDownloadDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
      if (node.name !== FILE_DOWNLOAD_DIRECTIVE_NAME) {
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
      data.hName = FILE_DOWNLOAD_COMPONENT_NAME;
      data.hProperties = {
        path,
        title,
        contentType: isString(contentType) ? contentType : undefined,
      };
    });
  };
}
