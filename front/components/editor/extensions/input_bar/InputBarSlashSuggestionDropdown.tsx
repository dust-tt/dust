import { buildInputBarSlashCommandItems } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
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
    slashCommandsRef: RefObject<InputBarSlashCommand[]>;
    includeAttachKnowledgeRef: RefObject<boolean>;
    includeSelectContextFileRef: RefObject<boolean>;
  }
>(
  (
    {
      clientRect,
      command,
      editor,
      query,
      range,
      onClose,
      onDetailsRef,
      slashCommandsRef,
      includeAttachKnowledgeRef,
      includeSelectContextFileRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);

    const commandItems = useMemo(
      () =>
        buildInputBarSlashCommandItems({
          commands: slashCommandsRef.current ?? [],
          includeAttachKnowledge: includeAttachKnowledgeRef.current ?? false,
          includeSelectContextFile:
            includeSelectContextFileRef.current ?? false,
          query,
        }),
      [
        includeAttachKnowledgeRef,
        includeSelectContextFileRef,
        query,
        slashCommandsRef,
      ]
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
