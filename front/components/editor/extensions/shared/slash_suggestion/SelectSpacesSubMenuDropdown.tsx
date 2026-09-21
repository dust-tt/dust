import { buildSelectSpacesSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSelectSpacesSlashCommandItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { isSelectSpaceSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/selectSpacesSlashCommand";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { useSelectableConversationSpaces } from "@app/lib/swr/conversation_selected_spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

interface SelectSpacesSubMenuDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "editor" | "query" | "range"
  > {
  activeFrame: SlashMenuStackFrame;
  conversationId: string | null;
  onBack: () => void;
  onClose: () => void;
  onSelect: (space: SelectableConversationSpaceType) => void;
  owner: LightWorkspaceType;
  selectedSpaceIds: string[];
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
      conversationId,
      onBack,
      onClose,
      onSelect,
      owner,
      query,
      selectedSpaceIds,
    },
    ref
  ) => {
    const dropdownRef = useRef<{
      onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    }>(null);

    // The sub-menu only mounts while open, so these fetch on open. Within a conversation the
    // server knows which spaces are selectable; for a draft we offer all regular spaces.
    const { spaces: conversationSpaces, isSelectableSpacesLoading } =
      useSelectableConversationSpaces({
        conversationId,
        disabled: !conversationId,
        owner,
      });
    const { spaces: workspaceSpaces, isSpacesLoading } = useSpaces({
      workspaceId: owner.sId,
      kinds: ["regular"],
      disabled: !!conversationId,
    });

    const spaces: SelectableConversationSpaceType[] = useMemo(() => {
      if (conversationId) {
        return conversationSpaces;
      }

      const selectedSpaceIdSet = new Set(selectedSpaceIds);
      return workspaceSpaces
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((space) => ({
          ...space,
          selected: selectedSpaceIdSet.has(space.sId),
        }));
    }, [conversationId, conversationSpaces, selectedSpaceIds, workspaceSpaces]);

    const isLoading = conversationId
      ? isSelectableSpacesLoading
      : isSpacesLoading;

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
