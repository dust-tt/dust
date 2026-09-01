import {
  Button,
  ChevronLeft,
  cn,
  DropdownMenuSeparator,
  ScrollArea,
} from "@dust-tt/sparkle";
import type React from "react";

interface DropdownPanelRootProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownPanelRoot({ children }: DropdownPanelRootProps) {
  return <>{children}</>;
}

interface DropdownPanelContentProps {
  children: React.ReactNode;
  className?: string;
  dropdownHeaders?: React.ReactNode;
  onBack?: () => void;
  title?: string;
}

export function DropdownPanelContent({
  children,
  className,
  dropdownHeaders,
  onBack,
  title,
}: DropdownPanelContentProps) {
  return (
    <div className={cn("flex flex-col p-1", className)}>
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center gap-1.5 px-1 py-1">
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={ChevronLeft}
            isRounded
            tooltip="Back"
            onClick={onBack}
          />
          <span className="heading-sm text-foreground dark:text-foreground-night">
            {title}
          </span>
        </div>
        <DropdownMenuSeparator />
        {dropdownHeaders}
      </div>
      <ScrollArea
        className="w-full flex-1"
        hideScrollBar={false}
        orientation="vertical"
        viewportClassName="flex-1"
      >
        {children}
      </ScrollArea>
    </div>
  );
}
