"use client";

import { appendUTMParams } from "@app/lib/utils/utm";
import type { NewButtonProps } from "@dust-tt/sparkle";
import { NewButton } from "@dust-tt/sparkle";

interface UTMButtonProps extends Omit<NewButtonProps, "href"> {
  href?: string;
}

const UTMButton = ({ href, ...props }: UTMButtonProps) => {
  const finalHref =
    href && !href.startsWith("http") && !href.startsWith("mailto:")
      ? appendUTMParams(href)
      : href;

  return <NewButton href={finalHref} {...props} />;
};

export default UTMButton;
