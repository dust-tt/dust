import { FILE_ID_REGEX } from "@app/lib/files";
import {
  getFileProcessedUrl,
  getProcessedFileDownloadUrl,
  useFileMetadata,
} from "@app/lib/swr/files";
import { isSupportedImageContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Citation, CitationImage } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";
import { visit } from "unist-util-visit";

interface ImgProps {
  src: string;
  alt: string;
  owner: LightWorkspaceType;
}
export function Img({ src, alt, owner }: ImgProps) {
  const matches = src?.match(FILE_ID_REGEX);
  const fileId = matches?.length === 1 ? matches[0] : null;

  const { fileMetadata, isFileMetadataLoading } = useFileMetadata({
    fileId,
    owner,
  });

  if (!src || !fileId) {
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  if (!baseUrl) {
    return null;
  }

  const viewSuffix = getFileProcessedUrl(owner, fileId);
  const downloadSuffix = getProcessedFileDownloadUrl(owner, fileId);
  const viewURL = new URL(viewSuffix, baseUrl);
  const downloadURL = new URL(downloadSuffix, baseUrl);

  // Show loading state while fetching metadata.
  if (isFileMetadataLoading) {
    return (
      <Citation containerClassName="s-aspect-square s-w-48">
        <CitationImage
          imgSrc={viewURL.toString()}
          downloadUrl={downloadURL.toString()}
          title={alt || "Loading..."}
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
    <Citation containerClassName="s-aspect-square s-w-48">
      <CitationImage
        imgSrc={viewURL.toString()}
        downloadUrl={downloadURL.toString()}
        title={fileMetadata.fileName}
        alt={alt || fileMetadata.fileName}
      />
    </Citation>
  );
}

export function imgDirective() {
  return (tree: any) => {
    visit(tree, ["image"], (node) => {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
