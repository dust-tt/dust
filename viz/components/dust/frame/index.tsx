"use client";

import { cn } from "@viz/lib/utils";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type FrameTheme = Partial<Record<`--${string}`, string | number>>;

type FrameStyle = CSSProperties & FrameTheme;

export interface FrameRootProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  children: ReactNode;
  theme?: FrameTheme;
  style?: FrameStyle;
}

/**
 * @cc [owner:flvndvd,label:product] frame-theme-inheritance
 * Frame themes MUST override CSS variables within their subtree only.
 * Omitted variables MUST inherit from the parent, including the host defaults.
 * Explicit style values MUST override the theme.
 */
export const FrameRoot = ({
  children,
  className,
  theme,
  style,
  ...props
}: FrameRootProps) => (
  <div
    {...props}
    className={cn("bg-background font-sans text-foreground", className)}
    style={{ ...theme, ...style }}
  >
    {children}
  </div>
);
