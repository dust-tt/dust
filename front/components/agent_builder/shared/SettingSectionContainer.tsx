import { cn, Label } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface SettingSectionContainerProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SettingSectionContainer({
  title,
  children,
  className,
}: SettingSectionContainerProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
        {title}
      </Label>
      {children}
    </div>
  );
}
