import {
  filterSkillsForSlashSuggestions,
  getSkillSlashCommandItem,
  SELECT_SKILL_SLASH_COMMAND_ACTION,
} from "@app/components/editor/extensions/shared/SlashCommandSkillItems";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { AttachmentIcon } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import { forwardRef, useMemo } from "react";

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

export function buildSkillBuilderSlashCommandItems({
  baseItems,
  currentSkillId,
  includeSkills,
  query,
  skills,
}: {
  baseItems: SlashCommand[];
  currentSkillId?: string | null;
  includeSkills: boolean;
  query: string;
  skills: SkillWithoutInstructionsAndToolsType[];
}): SlashCommand[] {
  if (!includeSkills) {
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
  includeSkills: boolean;
  onClose: () => void;
  owner?: LightWorkspaceType;
}

const SkillBuilderSlashCommandDropdownWithSkills = forwardRef<
  SlashCommandDropdownRef,
  SkillBuilderSlashCommandDropdownProps & { owner: LightWorkspaceType }
>(
  (
    { clientRect, command, currentSkillId, items, onClose, owner, query },
    ref
  ) => {
    const isOpen = Boolean(clientRect);
    const { skills, isSkillsLoading } = useSkills({
      disabled: !isOpen,
      owner,
      status: "active",
    });

    const slashCommandItems = useMemo(
      () =>
        buildSkillBuilderSlashCommandItems({
          baseItems: items,
          currentSkillId,
          includeSkills: true,
          query,
          skills,
        }),
      [currentSkillId, items, query, skills]
    );

    return (
      <SlashCommandDropdown
        key={isSkillsLoading ? "loading" : "loaded"}
        ref={ref}
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
  if (props.includeSkills && props.owner) {
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
  includeSkills: boolean;
  owner?: LightWorkspaceType;
  suggestion: Partial<SuggestionOptions>;
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
      };
    },

    onFocus() {
      this.storage.hasBeenFocused = true;
    },

    addOptions() {
      return {
        currentSkillId: null,
        includeSkills: false,
        owner: undefined,
        suggestion: {
          char: "/",
          pluginKey: slashCommandPluginKey,
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }: { query: string }) => {
            if (!query || query.length === 0) {
              return SLASH_COMMANDS;
            }

            return SLASH_COMMANDS.filter(
              (command) =>
                command.label.toLowerCase().includes(query.toLowerCase()) ||
                command.tooltip?.description
                  .toLowerCase()
                  .includes(query.toLowerCase())
            );
          },
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
                      includeSkills: extensionOptions.includeSkills,
                      onClose: closeSuggestionDropdown,
                      owner: extensionOptions.owner,
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
                  includeSkills: extensionOptions.includeSkills,
                  onClose: closeSuggestionDropdown,
                  owner: extensionOptions.owner,
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
