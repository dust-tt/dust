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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type React from "react";
import { useMemo, useState } from "react";

export function getSpacesPickerLabel(
  selectedSpaceIds: string[]
): MessageDescriptor {
  const count = selectedSpaceIds.length;
  if (count === 0) {
    return msg`Spaces`;
  }

  return msg`${plural(count, {
    one: "# additional Space",
    other: "# additional Spaces",
  })}`;
}

interface InputBarSpacesPickerProps {
  canDeselectSelectedSpaces: boolean;
  isLoading: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
  type?: "dropdown" | "subdropdown";
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function InputBarSpacesPicker({
  canDeselectSelectedSpaces,
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
  const { t } = useLingui();
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

  const label = t(getSpacesPickerLabel(selectedSpaceIds));

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
              placeholder={t`Search Spaces`}
              value={searchText}
              onChange={setSearchText}
              disabled={isLoading}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        <DropdownMenuCheckboxItem label={t`Agent's Spaces`} checked disabled />
        <DropdownMenuSeparator />
        <DropdownMenuLabel label={t`Additional Spaces`} />
        {isLoading ? (
          <DropdownMenuItem
            label={t`Loading`}
            disabled
            endComponent={<Spinner size="xs" />}
          />
        ) : spaces.length === 0 ? (
          <DropdownMenuItem label={t`No Spaces available`} disabled />
        ) : filteredSpaces.length === 0 ? (
          <DropdownMenuItem label={t`No matching Spaces`} disabled />
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
