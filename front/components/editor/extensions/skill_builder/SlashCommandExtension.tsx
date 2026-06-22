import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  isSkillSlashCommand,
  isToolSlashCommand,
  matchesSlashCommandCapabilityQuery,
  type SlashCommandSkillSuggestion,
  type SlashCommandToolSuggestion,
  sortSlashCommandCapabilityMatches,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { createSlashSuggestionExtension } from "@app/components/editor/extensions/shared/slash_suggestion/SlashSuggestionExtension";
import { shouldInsertSlashBoundarySpace } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import { Attachment01 } from "@dust-tt/sparkle";
import type { ChainedCommands } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

export const slashCommandPluginKey = new PluginKey("slashCommand");
const capabilitiesOnlySlashCommandMetaKey =
  "skillBuilderCapabilitiesOnlySlashCommand";

const INSERT_KNOWLEDGE_NODE_ACTION = "insert-knowledge-node";

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

  return sortSlashCommandCapabilityMatches({
    normalizedQuery,
    items: [
      ...skills
        .filter((skill) => skill.sId !== currentSkillId)
        .filter((skill) =>
          matchesSlashCommandCapabilityQuery({
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
          matchesSlashCommandCapabilityQuery({
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

  const visibleBaseItems = query.trim().length === 0 ? baseItems : [];
  const capabilityItems = filterSkillBuilderSlashCommandCapabilities({
    currentSkillId,
    query,
    skills,
    tools,
  }).map((capability) =>
    capability.kind === "skill"
      ? getSkillSlashCommandItem(capability.skill)
      : getToolSlashCommandItem(capability.tool)
  );

  return [...visibleBaseItems, ...capabilityItems];
}

interface SkillBuilderSlashCommandDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "editor" | "items" | "query" | "range"
  > {
  currentSkillId?: string | null;
  includeSkillSuggestions: boolean;
  onClose: () => void;
  onSkillDetails?: (skill: SlashCommandSkillSuggestion) => void;
  onToolDetails?: (tool: MCPServerViewType) => void;
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
      editor,
      items,
      onClose,
      onSkillDetails,
      onToolDetails,
      owner,
      query,
      range,
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
        onItemDetails={
          onSkillDetails || onToolDetails
            ? (item) => {
                if (isSkillSlashCommand(item)) {
                  editor.chain().focus().deleteRange(range).run();
                  onSkillDetails?.(item.data.skill);
                  onClose();
                  return;
                }

                if (isToolSlashCommand(item)) {
                  editor.chain().focus().deleteRange(range).run();
                  onToolDetails?.(item.data.tool.view);
                  onClose();
                }
              }
            : undefined
        }
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
  onSkillDetails?: (skill: SlashCommandSkillSuggestion) => void;
  onSelectSkill?: (skill: SlashCommandSkillSuggestion) => void;
  onSelectTool?: (tool: MCPServerViewType) => void;
  onToolDetails?: (tool: MCPServerViewType) => void;
  owner?: LightWorkspaceType;
  suggestion: Partial<SuggestionOptions>;
}

interface SkillBuilderSlashSuggestionStorage {
  capabilitiesOnlyTriggerStart: number | null;
  hasBeenFocused: boolean;
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
  triggerCleanupStorageKey: "capabilitiesOnlyTriggerStart",
  DropdownComponent: SkillBuilderSlashCommandDropdown,
  createStorage: () => ({
    hasBeenFocused: false,
    capabilitiesOnlyTriggerStart: null,
  }),
  defaultOptions: {
    currentSkillId: null,
    includeSkillSuggestions: false,
    onSkillDetails: undefined,
    onSelectSkill: undefined,
    onSelectTool: undefined,
    onToolDetails: undefined,
    owner: undefined,
    suggestion: {
      char: "/",
      pluginKey: slashCommandPluginKey,
      allowSpaces: true,
      startOfLine: false,
    },
  },
  addCommands: ({ editor, storage }) => ({
    openCapabilitiesSlashCommand:
      () =>
      ({ chain }: { chain: () => ChainedCommands }) => {
        storage.hasBeenFocused = true;
        const triggerText = shouldInsertSlashBoundarySpace(editor.state)
          ? " /"
          : "/";

        return chain()
          .focus()
          .command(({ tr }: { tr: Transaction }) => {
            tr.setMeta(capabilitiesOnlySlashCommandMetaKey, true);
            return true;
          })
          .insertContent(triggerText)
          .run();
      },
  }),
  allow: ({ storage }) => storage.hasBeenFocused,
  shouldShow: ({ range, transaction, storage }) => {
    if (transaction.getMeta(capabilitiesOnlySlashCommandMetaKey)) {
      storage.capabilitiesOnlyTriggerStart = range.from;
    }

    return true;
  },
  items: ({ editor, query, storage }) => {
    const state = slashCommandPluginKey.getState(editor.state);

    return state?.range.from === storage.capabilitiesOnlyTriggerStart
      ? []
      : filterSlashCommands(query);
  },
  command: ({ editor, range, props, options }) => {
    if (props.action === INSERT_KNOWLEDGE_NODE_ACTION) {
      editor.chain().focus().deleteRange(range).insertKnowledgeNode().run();
    } else if (isSkillSlashCommand(props)) {
      const { skill } = props.data;
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
      options.onSelectSkill?.(skill);
    } else if (isToolSlashCommand(props)) {
      const { tool } = props.data;
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
      options.onSelectTool?.(tool.view);
    }
  },
  mapDropdownProps: ({ options, props, storage }) => ({
    currentSkillId: options.currentSkillId,
    includeSkillSuggestions: options.includeSkillSuggestions,
    onSkillDetails: options.onSkillDetails,
    onToolDetails: options.onToolDetails,
    owner: options.owner,
    showCapabilitiesOnly:
      props.range.from === storage.capabilitiesOnlyTriggerStart,
  }),
  shouldAppendDropdown: ({ props }) => Boolean(props.clientRect),
});
