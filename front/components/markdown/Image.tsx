import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import { FilePreviewBlock } from "@app/components/markdown/FilePreviewBlock";
import type { MarkdownImageSource } from "@app/components/markdown/image_source";
import { resolveMarkdownImageSource } from "@app/components/markdown/image_source";
import config from "@app/lib/api/config";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import {
  getFilePathDownloadUrl,
  getProcessedFileDownloadUrl,
  useFileMetadata,
  useFileMetadataFromPath,
} from "@app/lib/swr/files";
import { isSupportedImageContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Citation, CitationImage } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { visit } from "unist-util-visit";

interface ImgProps {
  src: string;
  alt: string;
  owner: LightWorkspaceType;
}

interface LoadingImgProps {
  imgSrc: string;
  downloadUrl: string;
  title: string;
}

function LoadingImg({ imgSrc, downloadUrl, title }: LoadingImgProps) {
  return (
    <Citation containerClassName="aspect-square w-48">
      <CitationImage
        imgSrc={imgSrc}
        downloadUrl={downloadUrl}
        title={title}
        isLoading={true}
      />
    </Citation>
  );
}

// CitationImage renders no image while loading, so the image is fetched ahead to know when it has loaded.
function useIsImageLoading(url: string): boolean {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    const image = new window.Image();
    const markLoaded = () => setLoadedUrl(url);
    image.addEventListener("load", markLoaded);
    image.addEventListener("error", markLoaded);
    image.src = url;
    return () => {
      image.removeEventListener("load", markLoaded);
      image.removeEventListener("error", markLoaded);
    };
  }, [url]);

  return loadedUrl !== url;
}

interface ImageCitationProps {
  contentType: string;
  downloadUrl: string;
  fileId?: string;
  filePath?: string;
  thumbnailUrl: string;
  title: string;
}

function ImageCitation({
  contentType,
  downloadUrl,
  fileId,
  filePath,
  thumbnailUrl,
  title,
}: ImageCitationProps) {
  const isImageLoading = useIsImageLoading(thumbnailUrl);

  return (
    <PreviewableCitation
      fileId={fileId}
      filePath={filePath}
      contentType={contentType}
      title={title}
      thumbnailUrl={thumbnailUrl}
      downloadUrl={downloadUrl}
      isLoading={isImageLoading}
      containerClassName="aspect-square w-48"
    />
  );
}

interface PathImgProps {
  source: Extract<MarkdownImageSource, { kind: "file_path" }>;
  alt: string;
  owner: LightWorkspaceType;
}

function PathImg({ source, alt, owner }: PathImgProps) {
  const { t } = useLingui();
  const { metadata, isFileMetadataLoading } = useFileMetadataFromPath({
    owner,
    filePath: source.filePath,
  });
  const downloadUrl = getFilePathDownloadUrl(owner, source.filePath);

  if (isFileMetadataLoading) {
    return (
      <LoadingImg
        imgSrc={source.url}
        downloadUrl={downloadUrl}
        title={alt || t`Loading...`}
      />
    );
  }

  if (!metadata) {
    return null;
  }

  if (!isSupportedImageContentType(metadata.contentType)) {
    return <FilePreviewBlock path={source.filePath} title={alt || undefined} />;
  }

  return (
    <ImageCitation
      filePath={source.filePath}
      contentType={metadata.contentType}
      title={alt || getFileNameFromScopedPath(source.filePath)}
      thumbnailUrl={source.url}
      downloadUrl={downloadUrl}
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
      <LoadingImg
        imgSrc={viewURL.toString()}
        downloadUrl={downloadURL.toString()}
        title={alt || t`Loading...`}
      />
    );
  }

  // Check content type from file metadata instead of filename extension.
  if (!fileMetadata || !isSupportedImageContentType(fileMetadata.contentType)) {
    return null;
  }

  return (
    <ImageCitation
      fileId={source.fileId}
      contentType={fileMetadata.contentType}
      title={fileMetadata.fileName}
      thumbnailUrl={viewURL.toString()}
      downloadUrl={downloadURL.toString()}
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
