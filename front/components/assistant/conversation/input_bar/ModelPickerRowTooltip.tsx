import { DropdownTooltipTrigger } from "@dust-tt/sparkle";
import type { ReactElement, ReactNode } from "react";

interface ModelPickerRowTooltipProps {
  description: string;
  media?: ReactNode;
  // On mobile there is no hover, so we skip the tooltip entirely and render the
  // row as-is.
  isMobile: boolean;
  children: ReactElement;
}

// Wraps a dropdown row in its hover tooltip on desktop. When used inside a
// `.map`, apply the React `key` to this component so it is valid regardless of
// whether the tooltip is rendered.
export function ModelPickerRowTooltip({
  description,
  media,
  isMobile,
  children,
}: ModelPickerRowTooltipProps) {
  if (isMobile) {
    return children;
  }
  return (
    <DropdownTooltipTrigger description={description} media={media}>
      {children}
    </DropdownTooltipTrigger>
  );
}
