import { buildInputBarSlashCommandItems } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionItems";
import type { InputBarSlashCommand } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import { buildSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { useInputBarSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
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
    selectedMCPServerViewIdsRef: RefObject<Set<string>>;
    slashCommandsRef: RefObject<InputBarSlashCommand[]>;
    includeAttachKnowledgeRef: RefObject<boolean>;
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
      owner,
      selectedMCPServerViewIdsRef,
      slashCommandsRef,
      includeAttachKnowledgeRef,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);

    const commandItems = useMemo(
      () =>
        buildInputBarSlashCommandItems({
          commands: slashCommandsRef.current ?? [],
          includeAttachKnowledge: includeAttachKnowledgeRef.current ?? false,
          query,
        }),
      [includeAttachKnowledgeRef, query, slashCommandsRef]
    );

    const { capabilityItems, isLoading } = useInputBarSlashCommandCapabilities({
      owner,
      query,
      selectedMCPServerViewIdsRef,
    });

    const sections = useMemo(
      () =>
        buildSlashCommandSections({
          commandItems,
          capabilityItems,
        }),
      [capabilityItems, commandItems]
    );

    const flatItems = useMemo(
      () => sections.flatMap((section) => section.items),
      [sections]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            flatItems.length === 0
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [flatItems.length]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        sections={sections}
        command={command}
        clientRect={clientRect}
        emptyMessage="No commands found"
        isLoadingCapabilities={isLoading}
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
