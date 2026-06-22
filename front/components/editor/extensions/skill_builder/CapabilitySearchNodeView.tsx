import {
  getToolSlashCommandLabel,
  isSkillSlashCommand,
  isToolSlashCommand,
  type SlashCommandSkillSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { buildCapabilitySlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandItems";
import { InlineSlashSearch } from "@app/components/editor/extensions/shared/slash_suggestion/InlineSlashSearch";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import { useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { isNumber } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  DotsHorizontal,
  DropdownMenuItem,
  Spinner,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { RefObject } from "react";
import { useCallback, useMemo, useState } from "react";

export interface CapabilitySearchNodeOptions {
  currentSkillId?: string | null;
  onSelectSkillRef?: RefObject<
    ((skill: SlashCommandSkillSuggestion) => void) | undefined
  >;
  onSelectToolRef?: RefObject<((tool: MCPServerViewType) => void) | undefined>;
  onSkillDetailsRef?: RefObject<
    ((skill: SlashCommandSkillSuggestion) => void) | undefined
  >;
  onToolDetailsRef?: RefObject<((tool: MCPServerViewType) => void) | undefined>;
  owner?: LightWorkspaceType;
  selectedMCPServerViewIdsRef?: RefObject<Set<string>>;
  variant?: "input-bar" | "skill-builder";
}

interface CapabilitySearchNodeViewProps extends NodeViewProps {
  options: CapabilitySearchNodeOptions;
}

function getCapabilityItemDetailsHandler(
  options: CapabilitySearchNodeOptions
): ((item: SlashCommand) => void) | undefined {
  if (!options.onSkillDetailsRef && !options.onToolDetailsRef) {
    return undefined;
  }

  return (item) => {
    if (isSkillSlashCommand(item)) {
      options.onSkillDetailsRef?.current?.(item.data.skill);
      return;
    }

    if (isToolSlashCommand(item)) {
      options.onToolDetailsRef?.current?.(item.data.tool.view);
    }
  };
}

function replaceNodeWithSkill({
  editor,
  getPos,
  nodeSize,
  onSelectSkill,
  skill,
}: {
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  nodeSize: number;
  onSelectSkill?: (skill: SlashCommandSkillSuggestion) => void;
  skill: SlashCommandSkillSuggestion;
}) {
  const pos = getPos();
  if (!isNumber(pos)) {
    return;
  }

  editor
    .chain()
    .focus()
    .deleteRange({ from: pos, to: pos + nodeSize })
    .insertSkillNode({
      skillId: skill.sId,
      skillIcon: skill.icon,
      skillName: skill.name,
    })
    .insertContent(" ")
    .run();

  onSelectSkill?.(skill);
}

function replaceNodeWithTool({
  editor,
  getPos,
  insertToolNode,
  nodeSize,
  onSelectTool,
  tool,
}: {
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  insertToolNode: boolean;
  nodeSize: number;
  onSelectTool?: (tool: MCPServerViewType) => void;
  tool: MCPServerViewType;
}) {
  const pos = getPos();
  if (!isNumber(pos)) {
    return;
  }

  const chain = editor
    .chain()
    .focus()
    .deleteRange({ from: pos, to: pos + nodeSize });

  if (insertToolNode) {
    chain
      .insertToolNode({
        mcpServerViewId: tool.sId,
        toolIcon: tool.server.icon,
        toolName: getToolSlashCommandLabel(tool),
      })
      .insertContent(" ");
  }

  chain.run();
  onSelectTool?.(tool);

  if (!insertToolNode) {
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
  }
}

function CapabilitySearchNodeViewInner({
  capabilityItems,
  deleteNode,
  editor,
  getPos,
  insertToolNode,
  isLoading,
  node,
  onItemDetails,
  options,
  searchQuery,
  selectedIndex,
  onSearchQueryChange,
  onSelectedIndexChange,
}: {
  capabilityItems: SlashCommand[];
  deleteNode: () => void;
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  insertToolNode: boolean;
  isLoading: boolean;
  node: NodeViewProps["node"];
  onItemDetails?: (item: SlashCommand) => void;
  options: CapabilitySearchNodeOptions;
  searchQuery: string;
  selectedIndex: number;
  onSearchQueryChange: (query: string) => void;
  onSelectedIndexChange: (index: number) => void;
}) {
  const handleCancel = useCallback(() => {
    deleteNode();
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.chain().focus().run();
      }
    });
  }, [deleteNode, editor]);

  const handleSelectItem = useCallback(
    (item: SlashCommand) => {
      if (isSkillSlashCommand(item)) {
        replaceNodeWithSkill({
          editor,
          getPos,
          nodeSize: node.nodeSize,
          onSelectSkill: options.onSelectSkillRef?.current ?? undefined,
          skill: item.data.skill,
        });
        return;
      }

      if (isToolSlashCommand(item)) {
        replaceNodeWithTool({
          editor,
          getPos,
          insertToolNode,
          nodeSize: node.nodeSize,
          onSelectTool: options.onSelectToolRef?.current ?? undefined,
          tool: item.data.tool.view,
        });
      }
    },
    [
      editor,
      getPos,
      insertToolNode,
      node.nodeSize,
      options.onSelectSkillRef,
      options.onSelectToolRef,
    ]
  );

  const handleSelectIndex = useCallback(
    (index: number) => {
      const item = capabilityItems[index];
      if (item) {
        handleSelectItem(item);
      }
    },
    [capabilityItems, handleSelectItem]
  );

  const dropdownContent =
    isLoading && capabilityItems.length === 0 ? (
      <div className="flex h-14 items-center justify-center">
        <Spinner size="sm" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
          Loading capabilities…
        </span>
      </div>
    ) : capabilityItems.length === 0 ? (
      <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-500-night">
        No matches found
      </div>
    ) : (
      <div className="max-h-96">
        {capabilityItems.map((item, index) => {
          const canShowDetails = !!item.hasDetails && !!onItemDetails;

          return (
            <DropdownMenuItem
              key={item.id}
              icon={item.icon}
              itemId={item.id}
              label={item.label}
              description={item.description}
              truncateText
              endComponent={
                canShowDetails ? (
                  <Button
                    icon={DotsHorizontal}
                    variant="outline"
                    size="mini"
                    className={cn(
                      "opacity-0 group-focus-within:opacity-100",
                      index === selectedIndex && "opacity-100"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onItemDetails(item);
                    }}
                  />
                ) : undefined
              }
              onClick={() => handleSelectIndex(index)}
              onPointerMove={(event) => {
                event.preventDefault();
                onSelectedIndexChange(index);
              }}
              onPointerLeave={(event) => event.preventDefault()}
              className={cn(
                "group",
                index === selectedIndex &&
                  "bg-muted-background dark:bg-muted-night [transition-duration:0ms]"
              )}
            />
          );
        })}
      </div>
    );

  return (
    <NodeViewWrapper className="inline">
      <InlineSlashSearch
        deferDropdownUntilFocus
        dropdownContent={dropdownContent}
        isDropdownOpen={capabilityItems.length > 0 || isLoading}
        itemCount={capabilityItems.length}
        onCancel={handleCancel}
        onSearchQueryChange={(query) => {
          onSearchQueryChange(query);
          onSelectedIndexChange(0);
        }}
        onSelectIndex={handleSelectIndex}
        onSelectedIndexChange={onSelectedIndexChange}
        placeholder="Search capabilities..."
        searchQuery={searchQuery}
        selectedIndex={selectedIndex}
      />
    </NodeViewWrapper>
  );
}

function InputBarCapabilitySearchNodeView(
  props: CapabilitySearchNodeViewProps & { owner: LightWorkspaceType }
) {
  const { deleteNode, editor, getPos, node, options, owner } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { spaces: globalSpaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
  });
  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
    globalSpaceOnly: true,
  });
  const { serverViews, isLoading: isServerViewsLoading } =
    useMCPServerViewsFromSpaces(owner, globalSpaces);

  const capabilityItems = useMemo(
    () =>
      buildCapabilitySlashCommandItems({
        excludeSkillId: options.currentSkillId,
        query: searchQuery,
        skills,
        tools: serverViews,
        toolFilter: (serverView) =>
          isJITMCPServerView(serverView) &&
          !(options.selectedMCPServerViewIdsRef?.current ?? new Set()).has(
            serverView.sId
          ),
      }),
    [
      options.currentSkillId,
      options.selectedMCPServerViewIdsRef,
      searchQuery,
      serverViews,
      skills,
    ]
  );

  return (
    <CapabilitySearchNodeViewInner
      capabilityItems={capabilityItems}
      deleteNode={deleteNode}
      editor={editor}
      getPos={getPos}
      insertToolNode={false}
      isLoading={isSkillsLoading || isSpacesLoading || isServerViewsLoading}
      node={node}
      onItemDetails={getCapabilityItemDetailsHandler(options)}
      options={options}
      searchQuery={searchQuery}
      selectedIndex={selectedIndex}
      onSearchQueryChange={setSearchQuery}
      onSelectedIndexChange={setSelectedIndex}
    />
  );
}

function SkillBuilderCapabilitySearchNodeView(
  props: CapabilitySearchNodeViewProps & { owner: LightWorkspaceType }
) {
  const { deleteNode, editor, getPos, node, options, owner } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mcpServerViewsContext = useMCPServerViewsContext();

  const { skills, isSkillsLoading } = useSkills({
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

  const capabilityItems = useMemo(
    () =>
      buildCapabilitySlashCommandItems({
        excludeSkillId: options.currentSkillId,
        query: searchQuery,
        skills,
        tools,
        toolFilter: (serverView) =>
          getMCPServerRequirements(serverView).noRequirement,
      }),
    [options.currentSkillId, searchQuery, skills, tools]
  );

  return (
    <CapabilitySearchNodeViewInner
      capabilityItems={capabilityItems}
      deleteNode={deleteNode}
      editor={editor}
      getPos={getPos}
      insertToolNode={true}
      isLoading={
        isSkillsLoading || mcpServerViewsContext.isMCPServerViewsLoading
      }
      node={node}
      onItemDetails={getCapabilityItemDetailsHandler(options)}
      options={options}
      searchQuery={searchQuery}
      selectedIndex={selectedIndex}
      onSearchQueryChange={setSearchQuery}
      onSelectedIndexChange={setSelectedIndex}
    />
  );
}

export function CapabilitySearchNodeView(props: CapabilitySearchNodeViewProps) {
  const owner = props.options.owner;
  if (!owner) {
    return null;
  }

  switch (props.options.variant) {
    case "input-bar":
      return <InputBarCapabilitySearchNodeView {...props} owner={owner} />;
    case "skill-builder":
    case undefined:
      return <SkillBuilderCapabilitySearchNodeView {...props} owner={owner} />;
    default:
      assertNeverAndIgnore(props.options.variant);
      return <SkillBuilderCapabilitySearchNodeView {...props} owner={owner} />;
  }
}
