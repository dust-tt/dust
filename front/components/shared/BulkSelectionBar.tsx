import { Avatar, Button, cn, Hoverable, Spinner } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ComponentProps, ReactNode } from "react";

interface BulkSelectionBarProps {
  selectedCount: number;
  selectedLabel?: string;
  selectAllLabel: string;
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  selectedAvatars?: ComponentProps<typeof Avatar>[];
  // Action buttons, rendered after "Clear all". Use `size="sm"`.
  children: ReactNode;
}

export function BulkSelectionBar({
  selectedCount,
  selectedLabel,
  selectAllLabel,
  canSelectAll,
  onSelectAll,
  onClear,
  disabled = false,
  isLoading = false,
  selectedAvatars,
  children,
}: BulkSelectionBarProps) {
  const { t } = useLingui();

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
          {selectedAvatars && selectedAvatars.length > 0 && (
            <Avatar.Stack avatars={selectedAvatars} size="xs" />
          )}
          <span>
            {selectedLabel ??
              t`${plural(selectedCount, { one: "# selected", other: "# selected" })}`}
          </span>
          {canSelectAll && (
            <Hoverable variant="highlight" onClick={onSelectAll}>
              {selectAllLabel}
            </Hoverable>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Spinner size="xs" />}
          <Button
            size="sm"
            variant="ghost-secondary"
            className="text-xs"
            label={t({ message: "Clear all", context: "clear the selection" })}
            onClick={onClear}
            disabled={disabled}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
