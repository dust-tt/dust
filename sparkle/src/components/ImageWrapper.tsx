import { SparkleContext } from "@sparkle/context";
import React, { type ImgHTMLAttributes } from "react";

export const ImageWrapper = React.forwardRef<
  HTMLImageElement,
  ImgHTMLAttributes<HTMLImageElement>
>((props, ref) => {
  const { components } = React.useContext(SparkleContext);
  const Image = components.image;

  if (Image) {
    return <Image ref={ref} {...props} />;
  }

  return <img ref={ref} {...props} />;
});
