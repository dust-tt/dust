import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import React from "react";

interface TruncatedTextProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string | React.ReactNode;
  /** Number of lines to clamp the text to (defaults to 2). */
  lineClamp?: number;
  /** Forwarded to the Tooltip: renders its content in a portal (defaults to true). */
  mountPortal?: boolean;
  /** Forwarded to the Tooltip: element to portal the content into. */
  mountPortalContainer?: HTMLElement;
}

/**
 * Clamps text to a number of lines and, only when the text is actually cut off, wraps it
 * in a `Tooltip` revealing the full content on hover. Use it for labels or descriptions
 * that may overflow their container; for collapsing tall rich content behind a
 * show-more toggle, use `TruncatedContent` instead.
 *
 * @summary Line-clamped text with overflow tooltip.
 */
export const TruncatedText: React.FC<TruncatedTextProps> = ({
  children,
  className,
  lineClamp = 2,
  mountPortal,
  mountPortalContainer,
  ...props
}) => {
  const [isTruncated, setIsTruncated] = React.useState(false);
  const textRef = React.useRef<HTMLDivElement>(null);

  // Check if content is actually truncated by comparing scroll height to
  // client height
  // This ensures we only show the tooltip when text is cut off by line-clamp-
  React.useLayoutEffect(() => {
    const element = textRef.current;
    if (element) {
      const isOverflowing = element.scrollHeight > element.clientHeight;
      setIsTruncated(isOverflowing);
    }
  });

  const textElement = (
    <div
      ref={textRef}
      className={cn(
        `line-clamp-${lineClamp} cursor-pointer select-none`,
        className
      )}
      style={{ maxHeight: `calc(1lh * ${lineClamp})` }}
      {...props}
    >
      {children}
    </div>
  );

  if (isTruncated) {
    return (
      <Tooltip
        trigger={textElement}
        label={children}
        tooltipTriggerAsChild={true}
        mountPortal={mountPortal}
        mountPortalContainer={mountPortalContainer}
      />
    );
  }

  return textElement;
};
