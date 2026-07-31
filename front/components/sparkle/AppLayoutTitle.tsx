import { BarHeader, cn } from "@dust-tt/sparkle";
import type React from "react";

interface AppLayoutTitleProps {
  children?: React.ReactNode;
  className?: string;
}

export function AppLayoutTitle({ children, className }: AppLayoutTitleProps) {
  return (
    <div
      className={cn(
        "h-title",
        "flex w-full shrink-0 flex-col border-b border-separator px-4 pl-14 md:pl-3",
        "bg-panel-background",
        "",
        // When no children, only show on mobile for hamburger menu alignment.
        !children && "block md:hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AppLayoutSimpleCloseTitle({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <AppLayoutTitle>
      <BarHeader
        title={title}
        rightActions={<BarHeader.ButtonBar variant="close" onClose={onClose} />}
        className="ml-10 lg:ml-0"
      />
    </AppLayoutTitle>
  );
}
