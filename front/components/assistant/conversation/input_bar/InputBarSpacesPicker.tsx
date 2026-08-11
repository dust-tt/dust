import { getSpaceIcon } from "@app/lib/spaces";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
  Planet,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface InputBarSpacesPickerProps {
  canDeselectSelectedSpaces: boolean;
  disabled: boolean;
  isLoading: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
}

export function InputBarSpacesPicker({
  canDeselectSelectedSpaces,
  disabled,
  isLoading,
  onOpenChange,
  onSelectedSpaceIdsChange,
  selectedSpaceIds,
  spaces,
}: InputBarSpacesPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  const label =
    selectedSpaceIds.length > 0
      ? `${selectedSpaceIds.length} additional Space${selectedSpaceIds.length > 1 ? "s" : ""}`
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
    <DropdownMenuSub
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
        onOpenChange?.(open);
      }}
    >
      <DropdownMenuSubTrigger
        label={label}
        icon={
          <Icon size="xs" visual={Planet} className="text-muted-foreground" />
        }
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(true);
        }}
      />
      <DropdownMenuSubContent
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
        <DropdownMenuCheckboxItem label="Agent's Spaces" checked disabled />
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Additional Spaces" />
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
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
