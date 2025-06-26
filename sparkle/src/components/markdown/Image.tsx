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
  if (src.startsWith("https://dust.tt")) return true;

  // block everything else
  return false;
}
