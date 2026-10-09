import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import { FilePreviewBlock } from "@app/components/markdown/FilePreviewBlock";
import type { MarkdownImageSource } from "@app/components/markdown/image_source";
import { resolveMarkdownImageSource } from "@app/components/markdown/image_source";
import config from "@app/lib/api/config";
import {
  getFileNameFromScopedPath,
  getFilePreviewContentType,
} from "@app/lib/markdown/file_preview";
import {
  getFilePathDownloadUrl,
  getProcessedFileDownloadUrl,
  useFileMetadata,
} from "@app/lib/swr/files";
import { isSupportedImageContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Citation, CitationImage } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { visit } from "unist-util-visit";

interface ImgProps {
  src: string;
  alt: string;
  owner: LightWorkspaceType;
}

interface PathImgProps {
  source: Extract<MarkdownImageSource, { kind: "file_path" }>;
  alt: string;
  owner: LightWorkspaceType;
}

function PathImg({ source, alt, owner }: PathImgProps) {
  const fileName = getFileNameFromScopedPath(source.filePath);
  const contentType = getFilePreviewContentType({ fileName });

  if (!isSupportedImageContentType(contentType)) {
    return <FilePreviewBlock path={source.filePath} title={alt || undefined} />;
  }

  return (
    <PreviewableCitation
      filePath={source.filePath}
      contentType={contentType}
      title={alt || fileName}
      thumbnailUrl={source.url}
      downloadUrl={getFilePathDownloadUrl(owner, source.filePath)}
      containerClassName="aspect-square w-48"
    />
  );
}

function Img({ src, alt, owner }: ImgProps) {
  const { t } = useLingui();
  const source = src ? resolveMarkdownImageSource(owner, src) : null;
  const fileId = source?.kind === "file_id" ? source.fileId : null;

  const { fileMetadata, isFileMetadataLoading } = useFileMetadata({
    fileId,
    owner,
  });

  if (!source) {
    return null;
  }

  if (source.kind === "file_path") {
    return <PathImg source={source} alt={alt} owner={owner} />;
  }

  const baseUrl = config.getApiBaseUrl();

  const downloadSuffix = getProcessedFileDownloadUrl(owner, source.fileId);
  const viewURL = new URL(source.url, baseUrl);
  const downloadURL = new URL(downloadSuffix, baseUrl);

  // Loading state while fetching metadata: render a CitationImage placeholder.
  if (isFileMetadataLoading) {
    return (
      <Citation containerClassName="aspect-square w-48">
        <CitationImage
          imgSrc={viewURL.toString()}
          downloadUrl={downloadURL.toString()}
          title={alt || t`Loading...`}
          isLoading={true}
        />
      </Citation>
    );
  }

  // Check content type from file metadata instead of filename extension.
  if (!fileMetadata || !isSupportedImageContentType(fileMetadata.contentType)) {
    return null;
  }

  return (
    <PreviewableCitation
      fileId={source.fileId}
      contentType={fileMetadata.contentType}
      title={fileMetadata.fileName}
      thumbnailUrl={viewURL.toString()}
      downloadUrl={downloadURL.toString()}
      containerClassName="aspect-square w-48"
    />
  );
}

export function imgDirective() {
  return (tree: any) => {
    visit(tree, ["image"], (node) => {
      const data = node.data || (node.data = {});
      data.hName = "dustimg";
      data.hProperties = {
        src: node.url,
        alt: node.alt,
      };
    });
  };
}

export function getImgPlugin(owner: LightWorkspaceType) {
  const ImagePlugin = ({ src, alt }: { src: string; alt: string }) => {
    return <Img src={src} alt={alt} owner={owner} />;
  };

  return ImagePlugin;
}
