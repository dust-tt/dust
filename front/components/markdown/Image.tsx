import React from "react";
import { visit } from "unist-util-visit";

import { getFileProcessedUrl } from "@app/lib/swr/file";
import type { LightWorkspaceType } from "@app/types";

export function Img({
  src,
  alt,
  title,
  owner,
}: {
  src: string | undefined;
  alt: string | undefined;
  title?: string | undefined;
  owner: LightWorkspaceType;
}) {
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

  const url = getFileProcessedUrl(owner, matches[0]);
  const processedSrc = new URL(url, baseUrl);

  return <img src={processedSrc.toString()} alt={alt} title={title} />;
}

export function imgDirective() {
  return (tree: any) => {
    visit(tree, ["image"], (node) => {
      const data = node.data || (node.data = {});
      data.hName = "dustimg";
      data.hProperties = {
        src: node.url,
        alt: node.alt,
        title: node.title,
      };
    });
  };
}

export function getImgPlugin(owner: LightWorkspaceType) {
  const ImagePlugin = ({
    src,
    alt,
    title,
  }: {
    src: string;
    alt: string;
    title?: string;
  }) => {
    return <Img src={src} alt={alt} title={title} owner={owner} />;
  };

  return ImagePlugin;
}
