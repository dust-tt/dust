"use client";

import type { DistributiveOmit, RegularButtonProps } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { appendUTMParams } from "@marketing/lib/utils/utm";

type UTMButtonProps = DistributiveOmit<RegularButtonProps, "href"> & {
  href?: string;
};

const UTMButton = ({ href, ...props }: UTMButtonProps) => {
  const finalHref =
    href && !href.startsWith("http") && !href.startsWith("mailto:")
      ? appendUTMParams(href)
      : href;

  return <Button href={finalHref} {...props} />;
};

export default UTMButton;
