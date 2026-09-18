import { buildSelectSpacesSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSelectSpacesSlashCommandItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { isSelectSpaceSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/selectSpacesSlashCommand";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import type { SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

interface SelectSpacesSubMenuDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "editor" | "query" | "range"
  > {
  activeFrame: SlashMenuStackFrame;
  isLoading: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelect: (space: SelectableConversationSpaceType) => void;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
}

interface SelectSpacesSubMenuDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SelectSpacesSubMenuDropdown = forwardRef<
  SelectSpacesSubMenuDropdownRef,
  SelectSpacesSubMenuDropdownProps
>(
  (
    {
      activeFrame,
      clientRect,
      isLoading,
      onBack,
      onClose,
      onSelect,
      query,
      selectedSpaceIds,
      spaces,
    },
    ref
  ) => {
    const dropdownRef = useRef<{
      onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    }>(null);

    const items = useMemo(
      () =>
        buildSelectSpacesSlashCommandItems({
          query,
          selectedSpaceIds,
          spaces,
        }),
      [query, selectedSpaceIds, spaces]
    );

    const handleSelect = (item: SlashCommand) => {
      if (isSelectSpaceSlashCommand(item)) {
        onSelect(item.data.space);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [onClose, query]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        clientRect={clientRect}
        command={handleSelect}
        emptyMessage="No Spaces found"
        isLoading={isLoading}
        loadingMessage="Loading Spaces…"
        items={items}
        subMenuNavigation={{
          label: activeFrame.command.label,
          onBack,
        }}
        size="wide"
      />
    );
  }
);

SelectSpacesSubMenuDropdown.displayName = "SelectSpacesSubMenuDropdown";
