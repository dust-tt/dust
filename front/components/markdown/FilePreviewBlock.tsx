import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import { useInteractiveFileResolution } from "@app/hooks/conversations/useInteractiveFileResolution";
import {
  FILE_PREVIEW_COMPONENT_NAME,
  FILE_PREVIEW_DIRECTIVE_NAME,
  getFileNameFromScopedPath,
  getFilePreviewContentType,
  getFilePreviewTypeLabel,
} from "@app/lib/markdown/file_preview";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { createContext, useContext } from "react";
import { visit } from "unist-util-visit";

export interface FilePreviewLookupContextValue {
  owner: LightWorkspaceType;
  conversationId: string | null;
  generatedFiles: LightAgentMessageType["generatedFiles"];
}

// Message-scoped data used to resolve inline file references to their
// FileResource, so interactive files (Frames) open in the side panel instead of
// the preview dialog (which cannot render them). Mirrors CitationsContext: the
// provider lives in AgentMessage. Null outside conversation messages, where
// inline previews keep the plain dialog behavior.
export const FilePreviewLookupContext =
  createContext<FilePreviewLookupContextValue | null>(null);

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
  const lookup = useContext(FilePreviewLookupContext);

  if (!path) {
    return null;
  }

  const fileName = title || getFileNameFromScopedPath(path);
  const fileContentType = getFilePreviewContentType({
    contentType,
    fileName,
  });

  if (lookup) {
    return (
      <ResolvedFilePreviewBlock
        contentType={fileContentType}
        fileName={fileName}
        lookup={lookup}
        path={path}
      />
    );
  }

  return (
    <FilePreviewCitation
      contentType={fileContentType}
      fileName={fileName}
      path={path}
    />
  );
}

interface ResolvedFilePreviewBlockProps {
  contentType: string;
  fileName: string;
  lookup: FilePreviewLookupContextValue;
  path: string;
}

function ResolvedFilePreviewBlock({
  contentType,
  fileName,
  lookup,
  path,
}: ResolvedFilePreviewBlockProps) {
  const resolved = useInteractiveFileResolution({
    contentType,
    conversationId: lookup.conversationId,
    fileName,
    generatedFiles: lookup.generatedFiles,
    owner: lookup.owner,
    path,
  });

  return (
    <FilePreviewCitation
      // The resolved content type is authoritative: the directive may omit it,
      // in which case the filename-derived type is not the interactive one.
      contentType={resolved?.contentType ?? contentType}
      fileId={resolved?.fileId}
      fileName={fileName}
      path={path}
    />
  );
}

interface FilePreviewCitationProps {
  contentType: string;
  fileId?: string;
  fileName: string;
  path: string;
}

function FilePreviewCitation({
  contentType,
  fileId,
  fileName,
  path,
}: FilePreviewCitationProps) {
  const typeLabel = getFilePreviewTypeLabel({
    contentType,
    fileName,
  });

  return (
    <PreviewableCitation
      fileId={fileId}
      filePath={path}
      contentType={contentType}
      title={fileName}
      description={typeLabel}
      variant="inline"
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
