import { DropdownPanelContent } from "@app/components/assistant/conversation/input_bar/DropdownPanel";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export function getSpacesPickerLabel(selectedSpaceIds: string[]): string {
  if (selectedSpaceIds.length === 0) {
    return "Spaces";
  }

  return `${selectedSpaceIds.length} additional Space${selectedSpaceIds.length > 1 ? "s" : ""}`;
}

interface InputBarSpacesPickerProps {
  canDeselectSelectedSpaces: boolean;
  isLoading: boolean;
  onBack: () => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
}

export function InputBarSpacesPicker({
  canDeselectSelectedSpaces,
  isLoading,
  onBack,
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

  const label = getSpacesPickerLabel(selectedSpaceIds);

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
    <DropdownPanelContent
      className="h-80 w-full xs:h-96"
      title={label}
      onBack={onBack}
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
    </DropdownPanelContent>
  );
}
