import {
  isSkillSlashCommand,
  isToolSlashCommand,
  type SlashCommandSkillSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { filterSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import { buildSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import { createAttachKnowledgeSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/slashStaticCommands";
import { useSkillBuilderSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightWorkspaceType } from "@app/types/user";
import type { ChainedCommands, Editor, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  type RefObject,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

export const slashCommandPluginKey = new PluginKey("slashCommand");

const SLASH_COMMANDS: SlashCommand[] = [createAttachKnowledgeSlashCommand()];

interface SkillBuilderSlashSuggestionStorage {
  hasBeenFocused: boolean;
}

const SkillBuilderSlashCommandDropdownInner = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "editor" | "query" | "range"
  > & {
    currentSkillIdRef?: RefObject<string | null>;
    onClose: () => void;
    onSkillDetailsRef?: RefObject<
      ((skill: SlashCommandSkillSuggestion) => void) | undefined
    >;
    onToolDetailsRef?: RefObject<
      ((tool: MCPServerViewType) => void) | undefined
    >;
    owner: LightWorkspaceType;
  }
>(
  (
    {
      clientRect,
      command,
      editor,
      query,
      range,
      currentSkillIdRef,
      onClose,
      onSkillDetailsRef,
      onToolDetailsRef,
      owner,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);

    const commandItems = useMemo(
      () => filterSlashCommandItems(SLASH_COMMANDS, query),
      [query]
    );

    const { capabilityItems, isLoading } =
      useSkillBuilderSlashCommandCapabilities({
        excludeSkillId: currentSkillIdRef?.current ?? null,
        owner,
        query,
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

    const handleItemDetails =
      onSkillDetailsRef || onToolDetailsRef
        ? (item: SlashCommand) => {
            editor.chain().focus().deleteRange(range).run();
            if (isSkillSlashCommand(item)) {
              onSkillDetailsRef?.current?.(item.data.skill);
            } else if (isToolSlashCommand(item)) {
              onToolDetailsRef?.current?.(item.data.tool.view);
            }
            onClose();
          }
        : undefined;

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        sections={sections}
        command={command}
        clientRect={clientRect}
        emptyMessage="No commands found"
        isLoadingCapabilities={isLoading}
        onClose={onClose}
        onItemDetails={handleItemDetails}
        size="wide"
      />
    );
  }
);

SkillBuilderSlashCommandDropdownInner.displayName =
  "SkillBuilderSlashCommandDropdownInner";

const SkillBuilderSlashCommandDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "editor" | "query" | "range"
  > & {
    currentSkillIdRef?: RefObject<string | null>;
    onClose: () => void;
    onSkillDetailsRef?: RefObject<
      ((skill: SlashCommandSkillSuggestion) => void) | undefined
    >;
    onToolDetailsRef?: RefObject<
      ((tool: MCPServerViewType) => void) | undefined
    >;
    owner?: LightWorkspaceType;
  }
>(({ owner, ...props }, ref) => {
  if (!owner) {
    return null;
  }

  return (
    <SkillBuilderSlashCommandDropdownInner ref={ref} owner={owner} {...props} />
  );
});

SkillBuilderSlashCommandDropdown.displayName =
  "SkillBuilderSlashCommandDropdown";

export interface SlashCommandExtensionOptions {
  currentSkillIdRef?: RefObject<string | null>;
  onSelectRef: RefObject<
    ((item: SlashCommand, editor: Editor, range: Range) => void) | undefined
  >;
  onSkillDetailsRef?: RefObject<
    ((skill: SlashCommandSkillSuggestion) => void) | undefined
  >;
  onToolDetailsRef?: RefObject<((tool: MCPServerViewType) => void) | undefined>;
  owner?: LightWorkspaceType;
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
    currentSkillIdRef: { current: null },
    onSelectRef: { current: undefined },
    onSkillDetailsRef: { current: undefined },
    onToolDetailsRef: { current: undefined },
    owner: undefined,
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
    options.onSelectRef.current?.(props, editor, range);
  },
  mapDropdownProps: ({ options }) => ({
    currentSkillIdRef: options.currentSkillIdRef,
    onSkillDetailsRef: options.onSkillDetailsRef,
    onToolDetailsRef: options.onToolDetailsRef,
    owner: options.owner,
  }),
  shouldAppendDropdown: ({ props }) => Boolean(props.clientRect),
});
