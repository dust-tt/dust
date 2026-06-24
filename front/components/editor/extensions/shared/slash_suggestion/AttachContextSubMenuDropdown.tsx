import { AttachContextSlashMenuItemIcon } from "@app/components/editor/extensions/shared/slash_suggestion/AttachContextSlashMenuItemIcon";
import {
  type AttachContextSlashCommand,
  isAttachContextSlashCommand,
  SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import type {
  ContextSlashSearchSelection,
  ContextSlashSearchUseCase,
} from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import type { AttachContextSlashMenuItem } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSlashMenuItems";
import { useAttachContextSlashMenuItems } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSlashMenuItems";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

export { SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";

function toSlashCommandItem(
  item: AttachContextSlashMenuItem
): AttachContextSlashCommand {
  return {
    action: SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
    data: { selection: item.selection },
    description: item.description,
    icon: () => <AttachContextSlashMenuItemIcon item={item} />,
    id: item.id,
    label: item.label,
  };
}

export interface AttachContextSubMenuDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "editor" | "query" | "range"
  > {
  activeFrame: SlashMenuStackFrame;
  conversationId?: string | null;
  isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
  onBack: () => void;
  onClose: () => void;
  onSelect: (selection: ContextSlashSearchSelection) => void;
  owner: LightWorkspaceType;
  spaceId?: string | null;
  useCase: ContextSlashSearchUseCase;
}

export interface AttachContextSubMenuDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const AttachContextSubMenuDropdown = forwardRef<
  AttachContextSubMenuDropdownRef,
  AttachContextSubMenuDropdownProps
>(
  (
    {
      activeFrame,
      clientRect,
      conversationId = null,
      isNodeAttached,
      onBack,
      onClose,
      onSelect,
      owner,
      query,
      spaceId = null,
      useCase,
    },
    ref
  ) => {
    const dropdownRef = useRef<{
      onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    }>(null);

    const { emptyMessage, isLoading, items, loadingMessage } =
      useAttachContextSlashMenuItems({
        conversationId,
        isNodeAttached,
        owner,
        query,
        spaceId,
        useCase,
      });

    const slashItems = useMemo(() => items.map(toSlashCommandItem), [items]);

    const handleSelect = (item: SlashCommand) => {
      if (isAttachContextSlashCommand(item)) {
        onSelect(item.data.selection);
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
        emptyMessage={emptyMessage}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
        items={slashItems}
        subMenuNavigation={{
          label: activeFrame.command.label,
          onBack,
        }}
        size="wide"
      />
    );
  }
);

AttachContextSubMenuDropdown.displayName = "AttachContextSubMenuDropdown";
