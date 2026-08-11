import { DropdownAnchorTrigger } from "@app/components/assistant/conversation/input_bar/DropdownAnchorTrigger";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import type React from "react";
import { useMemo, useState } from "react";

interface InputBarSpacesPickerProps {
  canDeselectSelectedSpaces: boolean;
  disabled: boolean;
  isLoading: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
  type?: "dropdown" | "subdropdown";
  // See DropdownAnchorTrigger: on mobile the "+" menu owns the open state and
  // this picker renders as a top-level dropdown anchored to the "+" button.
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function InputBarSpacesPicker({
  canDeselectSelectedSpaces,
  disabled,
  isLoading,
  onOpenChange,
  onSelectedSpaceIdsChange,
  selectedSpaceIds,
  spaces,
  type = "subdropdown",
  externalOpen,
  onExternalOpenChange,
  anchorRef,
}: InputBarSpacesPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isExternallyControlled = externalOpen !== undefined;
  const isOpen = isExternallyControlled ? externalOpen : internalOpen;
  const setIsOpen = isExternallyControlled
    ? (open: boolean) => onExternalOpenChange?.(open)
    : setInternalOpen;

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

  const Wrapper = type === "dropdown" ? DropdownMenu : DropdownMenuSub;
  const ContentWrapper =
    type === "dropdown" ? DropdownMenuContent : DropdownMenuSubContent;

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
      {type === "dropdown" ? (
        <DropdownAnchorTrigger anchorRef={anchorRef} />
      ) : (
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
        className="w-80 max-w-[calc(100vw-1rem)]"
        collisionPadding={8}
        {...(type === "dropdown"
          ? {
              align: "end" as const,
              onInteractOutside: () => setIsOpen(false),
            }
          : {})}
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
      </ContentWrapper>
    </Wrapper>
  );
}
