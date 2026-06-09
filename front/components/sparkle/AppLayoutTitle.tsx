import { BarHeader, cn } from "@dust-tt/sparkle";
import type React from "react";

interface AppLayoutTitleProps {
  children?: React.ReactNode;
  className?: string;
}

export const HEADER_HEIGHT_CLASSNAME = `h-[3rem]`;

export function AppLayoutTitle({ children, className }: AppLayoutTitleProps) {
  return (
    <div
      className={cn(
        HEADER_HEIGHT_CLASSNAME,
        "flex w-full shrink-0 flex-col border-b border-separator px-4 pl-14 lg:pl-4",
        "bg-content-background dark:bg-content-background-night",
        "dark:border-separator-night",
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

export function AppLayoutSimpleSaveCancelTitle({
  title,
  onSave,
  onCancel,
  isSaving,
  saveTooltip,
}: {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  saveTooltip?: string;
}) {
  return (
    <AppLayoutTitle>
      <BarHeader
        title={title}
        rightActions={
          <BarHeader.ButtonBar
            variant="validate"
            cancelButtonProps={{
              size: "sm",
              label: "Cancel",
              variant: "ghost",
              onClick: onCancel,
            }}
            saveButtonProps={
              onSave
                ? {
                    size: "sm",
                    label: isSaving ? "Saving..." : "Save",
                    variant: "primary",
                    onClick: onSave,
                    disabled: isSaving,
                    tooltip: saveTooltip,
                  }
                : undefined
            }
          />
        }
        className="ml-10 lg:ml-0"
      />
    </AppLayoutTitle>
  );
}
