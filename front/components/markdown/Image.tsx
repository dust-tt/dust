import React from "react";
import { visit } from "unist-util-visit";

import { getFileProcessedUrl } from "@app/lib/swr/file";
import type { WorkspaceType } from "@app/types";

export function Img({
  src,
  alt,
  title,
  owner,
}: {
  src?: string | undefined;
  alt?: string | undefined;
  title?: string | undefined;
  owner: WorkspaceType;
}) {
  if (!src) {
    return null;
  }

  const matches = src.match(/\bfil_[A-Za-z0-9]{10,}\b/g);
  if (!matches || matches.length !== 1) {
    return null;
  }

  const internalPrefix = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  if (!internalPrefix) {
    return null;
  }

  const relativeSuffix = getFileProcessedUrl(owner, matches[0]);
  const processedSrc = internalPrefix + relativeSuffix;

  return <img src={processedSrc} alt={alt} title={title}></img>;
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

export function getImgPlugin(owner: WorkspaceType) {
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
