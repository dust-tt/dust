import React from "react";

import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";

interface TruncatedTextProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string | React.ReactNode;
  lineClamp?: number;
}

export const TruncatedText: React.FC<TruncatedTextProps> = ({
  children,
  className,
  lineClamp = 2,
  ...props
}) => {
  const [isTruncated, setIsTruncated] = React.useState(false);
  const textRef = React.useRef<HTMLDivElement>(null);

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
        `s-line-clamp-${lineClamp} s-cursor-pointer s-select-none`,
        className
      )}
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
      />
    );
  }

  return textElement;
};
