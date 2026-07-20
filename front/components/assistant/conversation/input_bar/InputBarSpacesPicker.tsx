import { getSpaceIcon } from "@app/lib/spaces";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Planet,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface InputBarSpacesPickerProps {
  buttonSize: "xs" | "sm";
  canDeselectSelectedSpaces: boolean;
  disabled: boolean;
  isLoading: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
}

export function InputBarSpacesPicker({
  buttonSize,
  canDeselectSelectedSpaces,
  disabled,
  isLoading,
  onOpenChange,
  onSelectedSpaceIdsChange,
  selectedSpaceIds,
  spaces,
}: InputBarSpacesPickerProps) {
  const selectedSpaceIdsSet = useMemo(
    () => new Set(selectedSpaceIds),
    [selectedSpaceIds]
  );
  const [searchText, setSearchText] = useState("");
  const filteredSpaces = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();
    if (!normalizedSearchText) {
      return spaces;
    }

    return spaces.filter((space) =>
      space.name.toLowerCase().includes(normalizedSearchText)
    );
  }, [searchText, spaces]);

  const tooltip =
    selectedSpaceIds.length > 0
      ? `${selectedSpaceIds.length} Space${selectedSpaceIds.length > 1 ? "s" : ""} selected`
      : "Select Spaces";

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
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          setSearchText("");
        }
        onOpenChange?.(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size={buttonSize}
          icon={Planet}
          tooltip={tooltip}
          aria-label={tooltip}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80"
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-spaces"
              placeholder="Search Spaces"
              value={searchText}
              onChange={setSearchText}
              disabled={isLoading}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {isLoading ? (
          <DropdownMenuItem
            label="Loading"
            disabled
            endComponent={<Spinner size="xs" />}
          />
        ) : spaces.length === 0 ? (
          <DropdownMenuItem label="No Spaces available" disabled />
        ) : filteredSpaces.length === 0 ? (
          <DropdownMenuItem label="No matching Spaces" disabled />
        ) : (
          <div>
            {filteredSpaces.map((space) => {
              const checked = selectedSpaceIdsSet.has(space.sId);

              return (
                <DropdownMenuCheckboxItem
                  key={space.sId}
                  label={space.name}
                  icon={getSpaceIcon(space)}
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
