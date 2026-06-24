import {
  isSkillSlashCommand,
  isToolSlashCommand,
  type SlashCommandSkillSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { AttachContextSubMenuDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/AttachContextSubMenuDropdown";
import { applyAttachContextSelection } from "@app/components/editor/extensions/shared/slash_suggestion/applyAttachContextSelection";
import { filterSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import { buildSlashCommandSections } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import {
  ATTACH_CONTEXT_SUB_MENU_ID,
  clearSlashSubMenuStack,
  createSlashMenuNavigationStorage,
  enterSlashSubMenu,
  handleSlashSubMenuCommand,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import { createAttachKnowledgeSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/slashStaticCommands";
import { SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { useSkillBuilderSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import { useSlashMenuStack } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashMenuStack";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightWorkspaceType } from "@app/types/user";
import type { ChainedCommands, Editor, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  type RefObject,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

export const slashCommandPluginKey = new PluginKey("slashCommand");

const SLASH_COMMANDS: SlashCommand[] = [createAttachKnowledgeSlashCommand()];

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
    const subMenuRef = useRef<SlashCommandDropdownRef>(null);
    const { activeFrame, pop, storage } = useSlashMenuStack(
      editor,
      "slashCommand"
    );

    const handleAttachContextSelect = useCallback(
      (
        selection: Parameters<
          typeof applyAttachContextSelection
        >[0]["selection"]
      ) => {
        clearSlashSubMenuStack(storage);
        applyAttachContextSelection({
          editor,
          range,
          selection,
          useCase: "skill-builder",
        });
        onClose();
      },
      [editor, onClose, range, storage]
    );

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
          if (activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID) {
            return subMenuRef.current?.onKeyDown({ event }) ?? false;
          }

          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }

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
      [activeFrame?.subMenuId, flatItems.length, onClose, query]
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

    if (activeFrame?.subMenuId === ATTACH_CONTEXT_SUB_MENU_ID) {
      return (
        <AttachContextSubMenuDropdown
          ref={subMenuRef}
          activeFrame={activeFrame}
          clientRect={clientRect}
          editor={editor}
          onBack={() => pop(range)}
          onClose={onClose}
          onSelect={handleAttachContextSelect}
          owner={owner}
          query={query}
          range={range}
          useCase="skill-builder"
        />
      );
    }

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        sections={sections}
        command={command}
        clientRect={clientRect}
        emptyMessage="No commands found"
        isLoading={isLoading}
        loadingMessage={SLASH_COMMAND_CAPABILITIES_LOADING_MESSAGE}
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

interface SkillBuilderSlashSuggestionStorage {
  hasBeenFocused: boolean;
  menuStack: ReturnType<typeof createSlashMenuNavigationStorage>["menuStack"];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    skillBuilderSlashCommand: {
      openAttachKnowledgeSlashCommand: () => ReturnType;
      openSlashCommand: () => ReturnType;
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
    ...createSlashMenuNavigationStorage(),
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
  addCommands: ({ storage, editor }) => ({
    openSlashCommand:
      () =>
      ({ chain }: { chain: () => ChainedCommands }) => {
        storage.hasBeenFocused = true;
        return chain().focus().insertContent("/").run();
      },
    openAttachKnowledgeSlashCommand:
      () =>
      ({ chain }: { chain: () => ChainedCommands }) => {
        storage.hasBeenFocused = true;
        const insertFrom = editor.state.selection.from;
        const result = chain().focus().insertContentAt(insertFrom, "/").run();

        const pluginState = slashCommandPluginKey.getState(editor.state);
        const range =
          pluginState?.active && pluginState.range
            ? pluginState.range
            : { from: insertFrom, to: insertFrom + 1 };

        if (
          pluginState?.active &&
          handleSlashSubMenuCommand({
            command: createAttachKnowledgeSlashCommand(),
            editor,
            range,
            storage,
          })
        ) {
          return result;
        }

        enterSlashSubMenu({
          command: createAttachKnowledgeSlashCommand(),
          editor,
          range,
          storage,
          subMenuId: ATTACH_CONTEXT_SUB_MENU_ID,
        });
        return result;
      },
  }),
  allow: ({ storage }) => storage.hasBeenFocused,
  items: ({ query }) => filterSlashCommandItems(SLASH_COMMANDS, query),
  command: ({ editor, range, props, options, storage }) => {
    if (
      handleSlashSubMenuCommand({
        command: props,
        editor,
        range,
        storage,
      })
    ) {
      return;
    }

    options.onSelectRef.current?.(props, editor, range);
  },
  mapDropdownProps: ({ options }) => ({
    currentSkillIdRef: options.currentSkillIdRef,
    onSkillDetailsRef: options.onSkillDetailsRef,
    onToolDetailsRef: options.onToolDetailsRef,
    owner: options.owner,
  }),
  onDropdownClose: ({ storage }) => {
    clearSlashSubMenuStack(storage);
  },
  preventEscapeDefault: true,
  shouldAppendDropdown: ({ props }) => Boolean(props.clientRect),
});
