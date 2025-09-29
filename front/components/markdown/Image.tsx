import { InteractiveImageGrid } from "@dust-tt/sparkle";
import React from "react";
import { visit } from "unist-util-visit";

import {
  getFileProcessedUrl,
  getProcessedFileDownloadUrl,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types";

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
