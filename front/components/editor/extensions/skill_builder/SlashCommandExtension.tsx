import { isAddCapabilitySlashCommand } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { filterSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import {
  createAddCapabilitySlashCommand,
  createAttachKnowledgeSlashCommand,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashStaticCommands";
import type { ChainedCommands, Editor, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, type RefObject, useImperativeHandle, useRef } from "react";

export const slashCommandPluginKey = new PluginKey("slashCommand");

const SLASH_COMMANDS: SlashCommand[] = [
  createAttachKnowledgeSlashCommand(),
  createAddCapabilitySlashCommand("Add a skill or tool to these instructions"),
];

interface SkillBuilderSlashSuggestionStorage {
  hasBeenFocused: boolean;
}

const SkillBuilderSlashCommandDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<SuggestionProps<SlashCommand>, "clientRect" | "command" | "items"> & {
    onClose: () => void;
  }
>(({ clientRect, command, items, onClose }, ref) => {
  const dropdownRef = useRef<SlashCommandDropdownRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (
          (event.key === "Enter" || event.key === "Tab") &&
          items.length === 0
        ) {
          event.preventDefault();
          return true;
        }

        return dropdownRef.current?.onKeyDown({ event }) ?? false;
      },
    }),
    [items.length]
  );

  return (
    <SlashCommandDropdown
      ref={dropdownRef}
      items={items}
      command={command}
      clientRect={clientRect}
      emptyMessage="No commands found"
      onClose={onClose}
      size="wide"
    />
  );
});

SkillBuilderSlashCommandDropdown.displayName =
  "SkillBuilderSlashCommandDropdown";

export interface SlashCommandExtensionOptions {
  onSelectRef: RefObject<
    ((item: SlashCommand, editor: Editor, range: Range) => void) | undefined
  >;
  suggestion: Partial<SuggestionOptions>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillBuilderSlashCommand: {
      openCapabilitiesSlashCommand: () => ReturnType;
    };
  }
}

export const SlashCommandExtension = createSlashSuggestionExtension<
  SlashCommandExtensionOptions,
  SkillBuilderSlashSuggestionStorage,
  SlashCommand
>({
  name: "slashCommand",
  pluginKey: slashCommandPluginKey,
  cleanupPluginKeyName: "skillBuilderSlashCommandCleanup",
  DropdownComponent: SkillBuilderSlashCommandDropdown,
  createStorage: () => ({
    hasBeenFocused: false,
  }),
  defaultOptions: {
    onSelectRef: { current: undefined },
    suggestion: {
      char: "/",
      pluginKey: slashCommandPluginKey,
      allowSpaces: true,
      startOfLine: false,
    },
  },
  addCommands: ({ storage }) => ({
    openCapabilitiesSlashCommand:
      () =>
      ({ chain }: { chain: () => ChainedCommands }) => {
        storage.hasBeenFocused = true;
        return chain().focus().insertCapabilitySearchNode().run();
      },
  }),
  allow: ({ storage }) => storage.hasBeenFocused,
  items: ({ query }) => filterSlashCommandItems(SLASH_COMMANDS, query),
  command: ({ editor, range, props, options }) => {
    if (isAddCapabilitySlashCommand(props)) {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertCapabilitySearchNode()
        .run();
      return;
    }

    options.onSelectRef.current?.(props, editor, range);
  },
  mapDropdownProps: () => ({}),
  shouldAppendDropdown: ({ props }) => Boolean(props.clientRect),
});
