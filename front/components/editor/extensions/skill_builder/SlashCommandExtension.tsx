import {
  getSkillSlashCommandItem,
  matchesSlashCommandQuery,
  SELECT_SKILL_SLASH_COMMAND_ACTION,
  type SlashCommandSkillSuggestion,
  sortSlashCommandMatches,
} from "@app/components/editor/extensions/shared/SlashCommandSkillItems";
import {
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  SELECT_TOOL_SLASH_COMMAND_ACTION,
  type SlashCommandToolSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandToolItems";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { Attachment01 } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

export const slashCommandPluginKey = new PluginKey("slashCommand");
const capabilitiesOnlySlashCommandMetaKey =
  "skillBuilderCapabilitiesOnlySlashCommand";

const INSERT_KNOWLEDGE_NODE_ACTION = "insert-knowledge-node";

function hasSlashCharacterAtPosition(state: EditorState, position: number) {
  const docSize = state.doc.content.size;

  if (position < 1 || position > docSize) {
    return false;
  }

  return (
    state.doc.textBetween(
      position,
      Math.min(position + 1, docSize + 1),
      undefined,
      "\ufffc"
    ) === "/"
  );
}

function shouldInsertSlashBoundarySpace(state: EditorState) {
  const textBefore = state.selection.$from.nodeBefore?.isText
    ? state.selection.$from.nodeBefore.text
    : null;

  return !!textBefore && !textBefore.endsWith(" ");
}

// Define available slash commands.
const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "add-knowledge",
    action: INSERT_KNOWLEDGE_NODE_ACTION,
    icon: Attachment01,
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

type SkillBuilderSlashCommandCapability =
  | {
      kind: "skill";
      skill: SlashCommandSkillSuggestion;
      sortName: string;
    }
  | {
      kind: "tool";
      tool: SlashCommandToolSuggestion;
      sortName: string;
    };

function filterSkillBuilderSlashCommandCapabilities({
  currentSkillId,
  query,
  skills,
  tools,
}: {
  currentSkillId?: string | null;
  query: string;
  skills: SlashCommandSkillSuggestion[];
  tools: SlashCommandToolSuggestion[];
}): SkillBuilderSlashCommandCapability[] {
  const normalizedQuery = query.trim().toLowerCase();

  return sortSlashCommandMatches({
    normalizedQuery,
    items: [
      ...skills
        .filter((skill) => skill.sId !== currentSkillId)
        .filter((skill) =>
          matchesSlashCommandQuery({
            label: skill.name,
            query: normalizedQuery,
          })
        )
        .map((skill) => ({
          kind: "skill" as const,
          skill,
          sortName: skill.name.toLowerCase(),
        })),
      ...tools
        .filter((tool) =>
          matchesSlashCommandQuery({
            label: getToolSlashCommandLabel(tool),
            query: normalizedQuery,
          })
        )
        .map((tool) => ({
          kind: "tool" as const,
          tool,
          sortName: getToolSlashCommandLabel(tool).toLowerCase(),
        })),
    ],
  });
}

export function buildSkillBuilderSlashCommandItems({
  baseItems,
  currentSkillId,
  includeSkillSuggestions,
  query,
  skills,
  tools = [],
}: {
  baseItems: SlashCommand[];
  currentSkillId?: string | null;
  includeSkillSuggestions: boolean;
  query: string;
  skills: SlashCommandSkillSuggestion[];
  tools?: SlashCommandToolSuggestion[];
}): SlashCommand[] {
  if (!includeSkillSuggestions) {
    return baseItems;
  }

  const capabilityItems = filterSkillBuilderSlashCommandCapabilities({
    currentSkillId,
    query,
    skills,
    tools,
  }).map((capability, index) => {
    const sectionLabel = index === 0 ? "Capabilities" : undefined;

    return capability.kind === "skill"
      ? getSkillSlashCommandItem(capability.skill, { sectionLabel })
      : getToolSlashCommandItem(capability.tool, { sectionLabel });
  });

  return [...baseItems, ...capabilityItems];
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
    const mcpServerViewsContext = useMCPServerViewsContext();
    const { skills, isSkillsLoading } = useSkills({
      disabled: !isOpen,
      owner,
      status: "active",
    });
    const tools = useMemo(() => {
      if (mcpServerViewsContext.isMCPServerViewsError) {
        return [];
      }

      return mcpServerViewsContext.mcpServerViewsWithoutKnowledge.filter(
        (view) => getMCPServerRequirements(view).noRequirement
      );
    }, [mcpServerViewsContext]);
    const isCapabilitiesLoading =
      isSkillsLoading || mcpServerViewsContext.isMCPServerViewsLoading;

    const slashCommandItems = useMemo(
      () =>
        buildSkillBuilderSlashCommandItems({
          baseItems: showCapabilitiesOnly ? [] : items,
          currentSkillId,
          includeSkillSuggestions: true,
          query,
          skills,
          tools,
        }),
      [currentSkillId, items, query, showCapabilitiesOnly, skills, tools]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            (isCapabilitiesLoading || slashCommandItems.length === 0)
          ) {
            event.preventDefault();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [isCapabilitiesLoading, slashCommandItems.length]
    );

    return (
      <SlashCommandDropdown
        key={isCapabilitiesLoading ? "loading" : "loaded"}
        ref={dropdownRef}
        items={slashCommandItems}
        command={command}
        clientRect={clientRect}
        emptyMessage={
          isCapabilitiesLoading ? "Loading capabilities…" : "No commands found"
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
      items={props.showCapabilitiesOnly ? [] : props.items}
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
  onSelectSkill?: (skill: SlashCommandSkillSuggestion) => void;
  onSelectTool?: (tool: MCPServerViewType) => void;
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
        capabilitiesOnlyTriggerStart: null as number | null,
      };
    },

    onFocus() {
      this.storage.hasBeenFocused = true;
    },

    addOptions() {
      return {
        currentSkillId: null,
        includeSkillSuggestions: false,
        onSelectSkill: undefined,
        onSelectTool: undefined,
        owner: undefined,
        suggestion: {
          char: "/",
          pluginKey: slashCommandPluginKey,
          allowSpaces: true,
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
            this.storage.hasBeenFocused = true;
            const triggerText = shouldInsertSlashBoundarySpace(
              this.editor.state
            )
              ? " /"
              : "/";

            const inserted = chain()
              .focus()
              .command(({ tr }) => {
                tr.setMeta(capabilitiesOnlySlashCommandMetaKey, true);
                return true;
              })
              .insertContent(triggerText)
              .run();

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
          items: ({ editor, query }) => {
            const state = slashCommandPluginKey.getState(editor.state);

            return state?.range.from ===
              extensionStorage.capabilitiesOnlyTriggerStart
              ? []
              : filterSlashCommands(query);
          },
          shouldShow: ({ range, transaction }) => {
            if (transaction.getMeta(capabilitiesOnlySlashCommandMetaKey)) {
              extensionStorage.capabilitiesOnlyTriggerStart = range.from;
            }

            return true;
          },
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
                    skillId: skill.sId,
                    skillIcon: skill.icon,
                    skillName: skill.name,
                  })
                  .run();
                extensionOptions.onSelectSkill?.(skill);
              }
            } else if (props.action === SELECT_TOOL_SLASH_COMMAND_ACTION) {
              const tool = props.data?.tool;
              if (tool) {
                editor
                  .chain()
                  .focus()
                  .deleteRange(range)
                  .insertToolNode({
                    mcpServerViewId: tool.id,
                    toolIcon: tool.icon,
                    toolName: tool.name,
                  })
                  .run();
                extensionOptions.onSelectTool?.(tool.view);
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
                        props.range.from ===
                        extensionStorage.capabilitiesOnlyTriggerStart,
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
                  showCapabilitiesOnly:
                    props.range.from ===
                    extensionStorage.capabilitiesOnlyTriggerStart,
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
        new Plugin({
          key: new PluginKey("skillBuilderSlashCommandCleanup"),
          view: () => ({
            update: (view) => {
              const triggerStart =
                extensionStorage.capabilitiesOnlyTriggerStart;

              if (
                triggerStart !== null &&
                !hasSlashCharacterAtPosition(view.state, triggerStart)
              ) {
                extensionStorage.capabilitiesOnlyTriggerStart = null;
              }
            },
          }),
        }),
      ];
    },
  });
