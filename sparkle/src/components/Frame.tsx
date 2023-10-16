import React from "react";

import { classNames, Responsive, responsiveProp } from "@sparkle/lib/utils";

type Direction = "horizontal" | "vertical" | "fluid";
type Sizing = "shrink" | "grow";
type Align = "stretch" | "left" | "center" | "right";
type Gap = "xs" | "sm" | "md" | "lg" | "xl" | "none";

interface FrameProps {
  children: React.ReactNode;
  direction?: Direction | Responsive<Direction>;
  sizing?: Sizing | Responsive<Sizing>;
  align?: Align | Responsive<Align>;
  gap?: Gap | Responsive<Gap>;
}

const directionMap: Record<Direction, string> = {
  horizontal: "s-flex-row",
  vertical: "s-flex-col",
  fluid: "s-flex-wrap",
};

const sizingMap: Record<Sizing, string> = {
  shrink: "s-flex-shrink",
  grow: "s-flex-grow",
};

const alignMap: Record<Align, string> = {
  stretch: "s-items-stretch",
  left: "s-items-start",
  center: "s-items-center",
  right: "s-items-end",
};

const gapMap: Record<Gap, string> = {
  xs: "s-gap-1",
  sm: "s-gap-2",
  md: "s-gap-3",
  lg: "s-gap-5",
  xl: "s-gap-8",
  none: "",
};

export function Frame({
  children,
  direction = "vertical",
  sizing = "shrink",
  align = "left",
  gap = "lg",
}: FrameProps) {
  const classes = classNames(
    "s-flex",
    responsiveProp(direction, directionMap),
    responsiveProp(sizing, sizingMap),
    responsiveProp(align, alignMap),
    responsiveProp(gap, gapMap)
  );

  return <div className={classes}>{children}</div>;
}
