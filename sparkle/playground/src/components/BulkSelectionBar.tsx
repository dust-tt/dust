import { Button, cn, Hoverable } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface BulkSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  itemLabel: string;
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  /** Action buttons, rendered after "Clear all". Use `size="sm"`. */
  children: ReactNode;
}

/**
 * The bar that takes over the bottom of a table once rows are ticked, and the
 * only place the batch actions live. It counts what is selected, offers the
 * rest of the list, and hosts whatever the caller can do to the lot.
 */
export function BulkSelectionBar({
  selectedCount,
  totalCount,
  itemLabel,
  canSelectAll,
  onSelectAll,
  onClear,
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
          "pointer-events-auto rounded-xl bg-modal-background text-foreground",
          "flex min-w-[80%] max-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4",
          "animate-in fade-in slide-in-from-bottom-4 duration-200 ease-out motion-reduce:animate-none"
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span>{selectedCount} selected.</span>
          {canSelectAll && (
            <Hoverable variant="highlight" onClick={onSelectAll}>
              Select all {totalCount} {itemLabel}
              {totalCount === 1 ? "" : "s"}
            </Hoverable>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost-secondary"
            className="text-xs"
            label="Clear all"
            onClick={onClear}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
