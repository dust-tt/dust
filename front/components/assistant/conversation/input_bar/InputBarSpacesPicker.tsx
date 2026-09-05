import { getSpaceIcon } from "@app/lib/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPanel,
  DropdownMenuPanelRoot,
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

export function getSpacesPickerLabel(selectedSpaceIds: string[]): string {
  if (selectedSpaceIds.length === 0) {
    return "Spaces";
  }

  return `${selectedSpaceIds.length} additional Space${selectedSpaceIds.length > 1 ? "s" : ""}`;
}

interface InputBarSpacesPickerProps {
  canDeselectSelectedSpaces: boolean;
  disabled?: boolean;
  isLoading: boolean;
  onBack?: () => void;
  onOpenChange?: (open: boolean) => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
  type?: "subdropdown" | "panel";
}

export function InputBarSpacesPicker({
  canDeselectSelectedSpaces,
  disabled = false,
  isLoading,
  onBack,
  onOpenChange,
  onSelectedSpaceIdsChange,
  selectedSpaceIds,
  spaces,
  type = "panel",
}: InputBarSpacesPickerProps) {
  const isMobile = useIsMobile();
  const isPanel = type === "panel";
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

  const Wrapper = isPanel ? DropdownMenuPanelRoot : DropdownMenuSub;
  const ContentWrapper = isPanel ? DropdownMenuPanel : DropdownMenuSubContent;

  return (
    <Wrapper
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
        onOpenChange?.(open);
      }}
    >
      {!isPanel && (
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
      )}
      <ContentWrapper
        className={
          isPanel ? "h-80 w-full xs:h-96" : "w-80 max-w-[calc(100vw-1rem)]"
        }
        {...(isPanel ? { title: label, onBack } : { collisionPadding: 8 })}
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus={!isMobile}
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
      </ContentWrapper>
    </Wrapper>
  );
}
