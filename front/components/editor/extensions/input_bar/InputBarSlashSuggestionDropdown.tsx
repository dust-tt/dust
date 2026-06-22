import { buildInputBarSlashCommandItems } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import { INPUT_BAR_SLASH_COMMANDS } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  type RefObject,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

export const InputBarSlashSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "editor" | "query" | "range"
  > & {
    conversationIdRef?: RefObject<string | null>;
    onClose: () => void;
    onDetailsRef?: RefObject<((item: SlashCommand) => void) | undefined>;
    owner: LightWorkspaceType;
  }
>(
  (
    {
      clientRect,
      command,
      conversationIdRef,
      editor,
      query,
      range,
      onClose,
      onDetailsRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const hasConversation = Boolean(conversationIdRef?.current);

    const commandItems = useMemo(
      () =>
        buildInputBarSlashCommandItems({
          commands: hasConversation ? INPUT_BAR_SLASH_COMMANDS : [],
          query,
        }),
      [hasConversation, query]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            commandItems.length === 0
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [commandItems.length]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        items={commandItems}
        command={command}
        clientRect={clientRect}
        emptyMessage="No commands found"
        onClose={onClose}
        onItemDetails={
          onDetailsRef
            ? (item) => {
                editor.chain().focus().deleteRange(range).run();
                onDetailsRef.current?.(item);
                onClose();
              }
            : undefined
        }
        size="wide"
      />
    );
  }
);

InputBarSlashSuggestionDropdown.displayName = "InputBarSlashSuggestionDropdown";
