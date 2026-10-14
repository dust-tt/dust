"use client";

import type { RegularButtonProps } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { appendUTMParams } from "@marketing/lib/utils/utm";

const UTMButton = ({ href, ...props }: RegularButtonProps) => {
  const finalHref =
    href && !href.startsWith("http") && !href.startsWith("mailto:")
      ? appendUTMParams(href)
      : href;

  return <Button href={finalHref} {...props} />;
};

export default UTMButton;
