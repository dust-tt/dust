import React from "react";

interface ImgProps {
  src?: string;
  alt?: string;
}

export function Img({ src, alt }: ImgProps): JSX.Element {
  if (!src || !isAllowedImageSrc(src)) {
    return <img src="" alt="IMAGE BLOCKED"></img>;
  }

  return <img src={src} alt={alt}></img>;
}

function isAllowedImageSrc(src: string): boolean {
  // Allow internal paths
  if (src.startsWith("https://dust.tt")) {
    return true;
  }

  // Block everything else
  return false;
}
