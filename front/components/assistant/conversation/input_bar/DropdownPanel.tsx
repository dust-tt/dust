import {
  ChevronLeft,
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Icon,
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
    <div
      className={cn(
        "flex flex-col p-1",
        "max-h-[var(--radix-dropdown-menu-content-available-height)]",
        className
      )}
    >
      <div className="flex shrink-0 flex-col">
        {title !== undefined && (
          <DropdownMenuItem
            label={title}
            icon={
              <Icon
                size="xs"
                visual={ChevronLeft}
                className="text-muted-foreground"
              />
            }
            onSelect={(event) => event.preventDefault()}
            onClick={onBack}
          />
        )}
        <DropdownMenuSeparator />
        {dropdownHeaders}
      </div>
      <ScrollArea
        className="w-full flex-1"
        hideScrollBar={false}
        orientation="vertical"
        viewportClassName="flex-1 overscroll-contain"
      >
        {children}
      </ScrollArea>
    </div>
  );
}
