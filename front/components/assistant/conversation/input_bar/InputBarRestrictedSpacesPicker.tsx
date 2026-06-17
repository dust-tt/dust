import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Lock01,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

interface InputBarRestrictedSpacesPickerProps {
  buttonSize: "xs" | "sm";
  canDeselectSelectedSpaces: boolean;
  disabled: boolean;
  isLoading: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
}

export function InputBarRestrictedSpacesPicker({
  buttonSize,
  canDeselectSelectedSpaces,
  disabled,
  isLoading,
  onOpenChange,
  onSelectedSpaceIdsChange,
  selectedSpaceIds,
  spaces,
}: InputBarRestrictedSpacesPickerProps) {
  const selectedSpaceIdsSet = useMemo(
    () => new Set(selectedSpaceIds),
    [selectedSpaceIds]
  );

  const label =
    selectedSpaceIds.length > 0
      ? `${selectedSpaceIds.length} Space${selectedSpaceIds.length > 1 ? "s" : ""}`
      : "Spaces";

  const handleSpaceCheckedChange = (spaceId: string, checked: boolean) => {
    if (!checked && !canDeselectSelectedSpaces) {
      return;
    }

    if (checked) {
      onSelectedSpaceIdsChange(
        selectedSpaceIdsSet.has(spaceId)
          ? selectedSpaceIds
          : [...selectedSpaceIds, spaceId]
      );
      return;
    }

    onSelectedSpaceIdsChange(selectedSpaceIds.filter((id) => id !== spaceId));
  };

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size={buttonSize}
          icon={Lock01}
          label={label}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuLabel>Restricted Spaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem
            label="Loading"
            disabled
            endComponent={<Spinner size="xs" />}
          />
        ) : spaces.length === 0 ? (
          <DropdownMenuItem label="No restricted Spaces" disabled />
        ) : (
          <div className="max-h-64 overflow-auto">
            {spaces.map((space) => {
              const checked = selectedSpaceIdsSet.has(space.sId);

              return (
                <DropdownMenuCheckboxItem
                  key={space.sId}
                  label={space.name}
                  checked={checked}
                  disabled={checked && !canDeselectSelectedSpaces}
                  onCheckedChange={(nextChecked) =>
                    handleSpaceCheckedChange(space.sId, nextChecked === true)
                  }
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                />
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
