import {
  filterSkillsForSlashSuggestions,
  getSkillSlashCommandItem,
  SELECT_SKILL_SLASH_COMMAND_ACTION,
  type SlashCommandSkillSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandSkillItems";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { AttachmentIcon } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

const slashCommandPluginKey = new PluginKey("slashCommand");

const INSERT_KNOWLEDGE_NODE_ACTION = "insert-knowledge-node";

// Define available slash commands.
const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "add-knowledge",
    action: INSERT_KNOWLEDGE_NODE_ACTION,
    icon: AttachmentIcon,
    label: "Attach knowledge",
    tooltip: {
      description: "Use company knowledge for context.",
      media: (
        <img
          alt="Knowledge Search Interface"
          className="aspect-[4/3] w-full rounded object-cover"
          src="/static/landing/product/Knowledge_Tooltips.jpg"
        />
      ),
    },
  },
];

function filterSlashCommands(query: string): SlashCommand[] {
  if (!query || query.length === 0) {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter(
    (command) =>
      command.label.toLowerCase().includes(query.toLowerCase()) ||
      command.tooltip?.description.toLowerCase().includes(query.toLowerCase())
  );
}

export function buildSkillBuilderSlashCommandItems({
  baseItems,
  currentSkillId,
  includeSkillSuggestions,
  query,
  skills,
}: {
  baseItems: SlashCommand[];
  currentSkillId?: string | null;
  includeSkillSuggestions: boolean;
  query: string;
  skills: SlashCommandSkillSuggestion[];
}): SlashCommand[] {
  if (!includeSkillSuggestions) {
    return baseItems;
  }

  const skillItems = filterSkillsForSlashSuggestions({ query, skills })
    .filter((skill) => skill.sId !== currentSkillId)
    .map((skill, index) =>
      getSkillSlashCommandItem(skill, {
        sectionLabel: index === 0 ? "Capabilities" : undefined,
      })
    );

  return [...baseItems, ...skillItems];
}

interface SkillBuilderSlashCommandDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "items" | "query"
  > {
  currentSkillId?: string | null;
  includeSkillSuggestions: boolean;
  onClose: () => void;
  owner?: LightWorkspaceType;
  showCapabilitiesOnly: boolean;
}

interface SkillBuilderSlashCommandDropdownWithSkillsProps
  extends SkillBuilderSlashCommandDropdownProps {
  owner: LightWorkspaceType;
}

const SkillBuilderSlashCommandDropdownWithSkills = forwardRef<
  SlashCommandDropdownRef,
  SkillBuilderSlashCommandDropdownWithSkillsProps
>(
  (
    {
      clientRect,
      command,
      currentSkillId,
      items,
      onClose,
      owner,
      query,
      showCapabilitiesOnly,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const isOpen = Boolean(clientRect);
    const { skills, isSkillsLoading } = useSkills({
      disabled: !isOpen,
      owner,
      status: "active",
    });

    const slashCommandItems = useMemo(
      () =>
        buildSkillBuilderSlashCommandItems({
          baseItems: showCapabilitiesOnly ? [] : items,
          currentSkillId,
          includeSkillSuggestions: true,
          query,
          skills,
        }),
      [currentSkillId, items, query, showCapabilitiesOnly, skills]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            (isSkillsLoading || slashCommandItems.length === 0)
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [isSkillsLoading, slashCommandItems.length]
    );

    return (
      <SlashCommandDropdown
        key={isSkillsLoading ? "loading" : "loaded"}
        ref={dropdownRef}
        items={slashCommandItems}
        command={command}
        clientRect={clientRect}
        emptyMessage={
          isSkillsLoading ? "Loading capabilities…" : "No commands found"
        }
        onClose={onClose}
        size="wide"
      />
    );
  }
);

SkillBuilderSlashCommandDropdownWithSkills.displayName =
  "SkillBuilderSlashCommandDropdownWithSkills";

const SkillBuilderSlashCommandDropdown = forwardRef<
  SlashCommandDropdownRef,
  SkillBuilderSlashCommandDropdownProps
>((props, ref) => {
  if (props.includeSkillSuggestions && props.owner) {
    return (
      <SkillBuilderSlashCommandDropdownWithSkills
        {...props}
        owner={props.owner}
        ref={ref}
      />
    );
  }

  return (
    <SlashCommandDropdown
      ref={ref}
      items={props.items}
      command={props.command}
      clientRect={props.clientRect}
      onClose={props.onClose}
    />
  );
});

SkillBuilderSlashCommandDropdown.displayName =
  "SkillBuilderSlashCommandDropdown";

export interface SlashCommandExtensionOptions {
  currentSkillId?: string | null;
  includeSkillSuggestions: boolean;
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

export const SlashCommandExtension =
  Extension.create<SlashCommandExtensionOptions>({
    name: "slashCommand",

    addStorage() {
      return {
        // Tracks whether the editor has been focused at least once by the user.
        // This prevents the slash command dropdown from triggering when content
        // ending with "/" is loaded programmatically via setContent on mount.
        hasBeenFocused: false,
        showCapabilitiesOnly: false,
      };
    },

    onFocus() {
      this.storage.hasBeenFocused = true;
    },

    addOptions() {
      return {
        currentSkillId: null,
        includeSkillSuggestions: false,
        owner: undefined,
        suggestion: {
          char: "/",
          pluginKey: slashCommandPluginKey,
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }: { query: string }) => filterSlashCommands(query),
        },
      };
    },

    addCommands() {
      return {
        openCapabilitiesSlashCommand:
          () =>
          ({ chain }) => {
            this.storage.showCapabilitiesOnly = true;

            const inserted = chain().focus().insertContent("/").run();
            if (!inserted) {
              this.storage.showCapabilitiesOnly = false;
            }

            return inserted;
          },
      };
    },

    addProseMirrorPlugins() {
      const extensionOptions = this.options;
      const extensionStorage = this.storage;

      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          items: ({ query }) =>
            extensionStorage.showCapabilitiesOnly
              ? []
              : filterSlashCommands(query),
          allow: () => extensionStorage.hasBeenFocused,
          command: ({ editor, range, props }) => {
            if (props.action === INSERT_KNOWLEDGE_NODE_ACTION) {
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertKnowledgeNode()
                .run();
            } else if (props.action === SELECT_SKILL_SLASH_COMMAND_ACTION) {
              const skill = props.data?.skill;
              if (skill) {
                editor
                  .chain()
                  .focus()
                  .deleteRange(range)
                  .insertSkillNode({
                    skillId: skill.id,
                    skillIcon: skill.icon,
                    skillName: skill.name,
                  })
                  .run();
              }
            }
          },
          render: () => {
            let component: ReactRenderer<SlashCommandDropdownRef> | null = null;
            let activeEditorView: EditorView | null = null;

            const closeSuggestionDropdown = () => {
              if (!activeEditorView) {
                return;
              }

              exitSuggestion(activeEditorView, slashCommandPluginKey);
            };

            return {
              onStart: (props: SuggestionProps) => {
                activeEditorView = props.editor.view;
                component = new ReactRenderer(
                  SkillBuilderSlashCommandDropdown,
                  {
                    props: {
                      ...props,
                      currentSkillId: extensionOptions.currentSkillId,
                      includeSkillSuggestions:
                        extensionOptions.includeSkillSuggestions,
                      onClose: closeSuggestionDropdown,
                      owner: extensionOptions.owner,
                      showCapabilitiesOnly:
                        extensionStorage.showCapabilitiesOnly,
                    },
                    editor: props.editor,
                  }
                );

                if (!props.clientRect) {
                  return;
                }

                document.body.appendChild(component.element);
              },

              onUpdate(props: SuggestionProps) {
                activeEditorView = props.editor.view;
                component?.updateProps({
                  ...props,
                  currentSkillId: extensionOptions.currentSkillId,
                  includeSkillSuggestions:
                    extensionOptions.includeSkillSuggestions,
                  onClose: closeSuggestionDropdown,
                  owner: extensionOptions.owner,
                  showCapabilitiesOnly: extensionStorage.showCapabilitiesOnly,
                });

                if (!props.clientRect) {
                  return;
                }
              },

              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === "Escape") {
                  closeSuggestionDropdown();
                  return true;
                }

                return component?.ref?.onKeyDown?.(props) ?? false;
              },

              onExit() {
                extensionStorage.showCapabilitiesOnly = false;
                activeEditorView = null;
                component?.element?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        }),
      ];
    },
  });
