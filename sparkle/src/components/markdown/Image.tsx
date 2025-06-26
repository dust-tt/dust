import React from "react";

export function Img({
  src,
  alt,
}: {
  src?: string | undefined;
  alt?: string | undefined;
}) {
  if (!src || !isAllowedImageSrc(src)) {
    return <img src="" alt="IMAGE BLOCKED"></img>;
  }

  return <img src={src} alt={alt}></img>;
}

function isAllowedImageSrc(src: string): boolean {
  // allow internal paths
  if (src.startsWith("/")) return true;

  // TODO: allow for internal links, but first have to figure out how to use internal links
  // block everything else
  return false;
}
