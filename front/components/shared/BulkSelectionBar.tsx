import { pluralize } from "@app/types/shared/utils/string_utils";
import { Button, cn, Hoverable, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface BulkSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  itemLabel: string;
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  // Action buttons, rendered after "Clear all". Use `size="sm"`.
  children: ReactNode;
}

export function BulkSelectionBar({
  selectedCount,
  totalCount,
  itemLabel,
  canSelectAll,
  onSelectAll,
  onClear,
  disabled = false,
  isLoading = false,
  children,
}: BulkSelectionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  // `dark` pins the bar dark in both themes; it must stay on the wrapper so the
  // `.dark .bg-modal-background` elevation shadow still matches a descendant.
  return (
    <div className="dark pointer-events-none sticky bottom-4 z-20 flex justify-center pt-4">
      <div
        className={cn(
          "pointer-events-auto bg-modal-background text-foreground rounded-xl",
          "flex flex-wrap items-center justify-between min-w-[80%] max-w-full gap-x-4 gap-y-2 p-4",
          "animate-in motion-reduce:animate-none duration-200 ease-out fade-in slide-in-from-bottom-4"
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span>{selectedCount} selected.</span>
          {canSelectAll && (
            <Hoverable variant="highlight" onClick={onSelectAll}>
              Select all {totalCount} {itemLabel}
              {pluralize(totalCount)}
            </Hoverable>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Spinner size="xs" />}
          <Button
            size="sm"
            variant="ghost-secondary"
            className="text-xs"
            label="Clear all"
            onClick={onClear}
            disabled={disabled}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
