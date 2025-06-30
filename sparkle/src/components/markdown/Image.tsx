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
  const internalPrefix = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  if (!internalPrefix) {
    return false;
  }
  // allow internal paths
  if (src.startsWith(internalPrefix)) {return true;}

  // TODO: allow for internal links, but first have to figure out how to use internal links
  // block everything else
  return false;
}
