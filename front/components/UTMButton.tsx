"use client";

import type { ButtonProps } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";

import { appendUTMParams } from "@app/lib/utils/utm";

interface UTMButtonProps extends Omit<ButtonProps, "href"> {
  href?: string;
}

const UTMButton = ({ href, ...props }: UTMButtonProps) => {
  const finalHref =
    href && !href.startsWith("http") && !href.startsWith("mailto:")
      ? appendUTMParams(href)
      : href;

  return <Button href={finalHref} {...props} />;
};

export default UTMButton;
