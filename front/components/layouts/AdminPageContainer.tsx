import { cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface AdminPageContainerProps {
  children: ReactNode;
  className?: string;
}

export function AdminPageContainer({
  children,
  className,
}: AdminPageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-4 sm:px-10 sm:py-8",
        className
      )}
    >
      {children}
    </div>
  );
}
