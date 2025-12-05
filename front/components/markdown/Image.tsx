import { InteractiveImageGrid } from "@dust-tt/sparkle";
import React from "react";
import { visit } from "unist-util-visit";

import {
  getFileProcessedUrl,
  getProcessedFileDownloadUrl,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types";
import { FILE_FORMATS } from "@app/types/files";

const IMAGE_EXTENSIONS = Array.from(
  new Set(
    Object.values(FILE_FORMATS)
      .filter((format) => format.cat === "image")
      .flatMap((format) => format.exts)
  )
);

interface ImgProps {
  src: string;
  alt: string;
  owner: LightWorkspaceType;
}
function Img({ src, alt, owner }: ImgProps) {
  if (!src) {
    return null;
  }

  const matches = src.match(/\bfil_[A-Za-z0-9]{10,}\b/g);
  if (!matches || matches.length !== 1) {
    return null;
  }

  // Check if this is actually an image file by checking the extension in the alt text.
  // Default is true for backward compatibility when no alt text is provided.
  if (alt) {
    const altLower = alt.toLowerCase();
    const isImageFile = IMAGE_EXTENSIONS.some((ext) => altLower.endsWith(ext));
    if (!isImageFile) {
      return null;
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  if (!baseUrl) {
    return null;
  }

  const viewSuffix = getFileProcessedUrl(owner, matches[0]);
  const downloadSuffix = getProcessedFileDownloadUrl(owner, matches[0]);
  const viewURL = new URL(viewSuffix, baseUrl);
  const downloadURL = new URL(downloadSuffix, baseUrl);

  return (
    <InteractiveImageGrid
      images={[
        {
          imageUrl: viewURL.toString(),
          downloadUrl: downloadURL.toString(),
          alt: alt ? alt : "",
          title: alt ? alt : "",
          isLoading: false,
        },
      ]}
    />
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
