import React, { ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

type FrameProps = {
  autoLayout?: "vertical" | "horizontal" | "wrap";
  gap?: number | "auto";
  padding?: number | number[];
  width?: string;
  height?: string;
  maxWidth?: string;
  maxHeight?: string;
  children?: ReactNode;
};

const Frame: React.FC<FrameProps> = ({
  autoLayout,
  gap = "auto",
  padding = 0,
  width = "auto",
  height = "auto",
  maxWidth = "none",
  maxHeight = "none",
  children,
}) => {
  let flexDirection = "s-flex-col";
  let flexWrap = "s-flex-no-wrap";

  if (autoLayout === "horizontal") {
    flexDirection = "s-flex-row";
  }
  if (autoLayout === "wrap") {
    flexWrap = "s-flex-wrap";
  }

  const paddingClasses = Array.isArray(padding)
    ? padding.map((p, i) => `s-p-${["l", "t", "r", "b"][i]}-${p}`).join(" ")
    : `s-p-${padding}`;

  return (
    <div
      className={classNames(
        "s-flex",
        flexDirection,
        flexWrap,
        `s-gap-${gap}`,
        paddingClasses,
        `s-w-${width}`,
        `s-h-${height}`,
        `s-max-w-${maxWidth}`,
        `s-max-h-${maxHeight}`
      )}
    >
      {children}
    </div>
  );
};

export default Frame;
