import type { ReactNode } from "react";

interface ManagePageLayoutProps {
  children: ReactNode;
}

/**
 * Mirrors front's AppContentLayout with `contentWidth: "wide"`: a scrollable
 * full-height column, content stretched to the viewport with the same
 * horizontal padding.
 */
export function ManagePageLayout({ children }: ManagePageLayoutProps) {
  return (
    <div className="h-screen w-full bg-background">
      <div className="flex h-full w-full flex-col items-center overflow-y-auto pt-8 [scrollbar-gutter:stable]">
        <div className="flex w-full grow flex-col px-4 md:px-8">{children}</div>
      </div>
    </div>
  );
}
