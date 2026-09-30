import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  getBrowsableDataSourceViewTitle,
  KNOWLEDGE_BROWSER_GROUP_LABELS,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { AttachContextSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import { SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getDataSourceViewRootNode } from "@app/lib/content_nodes";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ChevronRight, DotsHorizontal } from "@dust-tt/sparkle";

export const NAVIGATE_KNOWLEDGE_BROWSER_ACTION = "navigate-knowledge-browser";
export const LOAD_MORE_KNOWLEDGE_BROWSER_ACTION = "load-more-knowledge-browser";

const LOAD_MORE_KNOWLEDGE_BROWSER_ID = "knowledge-browser-load-more";

const KNOWLEDGE_BROWSER_ITEM_KINDS: KnowledgeBrowserItem["kind"][] = [
  "space",
  "category",
  "data_source",
  "node",
];

export interface NavigateKnowledgeBrowserSlashCommand extends SlashCommand {
  action: typeof NAVIGATE_KNOWLEDGE_BROWSER_ACTION;
  data: { item: KnowledgeBrowserItem };
}

// Trusts the producer: the only `data.item` carrying one of these kinds is the row the sub-menu
// built itself, so checking the discriminant is enough to narrow safely.
function isKnowledgeBrowserItem(value: unknown): value is KnowledgeBrowserItem {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    typeof value.kind === "string" &&
    KNOWLEDGE_BROWSER_ITEM_KINDS.some((kind) => kind === value.kind)
  );
}

export function isNavigateKnowledgeBrowserSlashCommand(
  item: SlashCommand
): item is NavigateKnowledgeBrowserSlashCommand {
  return (
    item.action === NAVIGATE_KNOWLEDGE_BROWSER_ACTION &&
    !!item.data &&
    typeof item.data === "object" &&
    "item" in item.data &&
    isKnowledgeBrowserItem(item.data.item)
  );
}

export function isLoadMoreKnowledgeBrowserSlashCommand(
  item: SlashCommand
): boolean {
  return item.action === LOAD_MORE_KNOWLEDGE_BROWSER_ACTION;
}

function toAttachNodeSlashCommand(
  id: string,
  label: string,
  icon: SlashCommand["icon"],
  node: DataSourceViewContentNode,
  description?: string
): AttachContextSlashCommand {
  return {
    action: SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
    data: { selection: { kind: "knowledge", node } },
    description,
    icon,
    id,
    label,
  };
}

export const ATTACH_FOLDER_ACTION_LABEL = "Add";

// The node an "Add" on a container row attaches: the folder itself, or a data source view's root.
export function getAttachableNodeForItem(
  item: KnowledgeBrowserItem
): DataSourceViewContentNode | null {
  switch (item.kind) {
    case "node":
      return item.node;
    case "data_source":
      return getDataSourceViewRootNode(item.dataSourceView);
    case "space":
    case "category":
      return null;
    default:
      assertNeverAndIgnore(item);
      return null;
  }
}

/**
 * @cc [owner:smb2268,label:product] browser-rows-navigate-or-attach
 * Space, category and data source rows and expandable node rows MUST produce a
 * `NAVIGATE_KNOWLEDGE_BROWSER_ACTION` command carrying the row, with a trailing chevron;
 * non-expandable node rows MUST produce a `SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION` command
 * attaching the node. When `onAttachNode` is given, expandable node rows and data source rows
 * also carry an "Add" end action that attaches the folder, or the view's root node, without
 * navigating, matching what a search hit on the same folder or data source attaches. Row order
 * is preserved.
 */
export function toKnowledgeBrowserSlashCommands(
  items: KnowledgeBrowserItem[],
  {
    onAttachNode,
  }: { onAttachNode?: (node: DataSourceViewContentNode) => void } = {}
): SlashCommand[] {
  return items.map((item) => {
    if (item.kind === "node" && !item.expandable) {
      return toAttachNodeSlashCommand(
        `knowledge-${item.node.internalId}-${item.node.dataSourceView.sId}`,
        item.title,
        item.icon,
        item.node,
        item.description
      );
    }
    const attachable = getAttachableNodeForItem(item);
    return {
      action: NAVIGATE_KNOWLEDGE_BROWSER_ACTION,
      data: { item },
      description: item.description,
      endAction:
        attachable && onAttachNode
          ? {
              label: ATTACH_FOLDER_ACTION_LABEL,
              onSelect: () => onAttachNode(attachable),
            }
          : undefined,
      endIcon: ChevronRight,
      icon: item.icon,
      id: `browse-${item.kind}-${item.id}`,
      // The menu names a pod's own data source by its files; the row keeps the stored name.
      label:
        item.kind === "data_source"
          ? getBrowsableDataSourceViewTitle(item.dataSourceView)
          : item.title,
    };
  });
}

export function getLoadMoreKnowledgeBrowserSlashCommand({
  isLoading,
}: {
  isLoading: boolean;
}): SlashCommand {
  return {
    action: LOAD_MORE_KNOWLEDGE_BROWSER_ACTION,
    icon: DotsHorizontal,
    id: LOAD_MORE_KNOWLEDGE_BROWSER_ID,
    label: isLoading ? "Loading…" : "Show more",
  };
}

// The root lists spaces under a heading and pods under a second one, like the Agent Builder.
export function buildRootBrowseSections(
  items: KnowledgeBrowserItem[],
  { isLoading }: { isLoading: boolean }
): SlashCommandSection[] {
  const spaceItems = items.filter(
    (item) => item.kind === "space" && item.group === "spaces"
  );
  const podItems = items.filter(
    (item) => item.kind === "space" && item.group === "pods"
  );
  // While loading, the spaces heading stays in place with placeholder rows under it.
  const sections: SlashCommandSection[] = [
    {
      label: KNOWLEDGE_BROWSER_GROUP_LABELS.spaces,
      items: toKnowledgeBrowserSlashCommands(spaceItems),
      isLoading,
    },
  ];
  if (podItems.length > 0) {
    sections.push({
      label: KNOWLEDGE_BROWSER_GROUP_LABELS.pods,
      items: toKnowledgeBrowserSlashCommands(podItems),
    });
  }
  return sections;
}

// Rows below the root: the children of the browsed level, then paging.
export function buildBrowseCommands(
  items: KnowledgeBrowserItem[],
  {
    onAttachNode,
    hasMore,
    isLoadingMore,
  }: {
    onAttachNode: (node: DataSourceViewContentNode) => void;
    hasMore: boolean;
    isLoadingMore: boolean;
  }
): SlashCommand[] {
  const commands = toKnowledgeBrowserSlashCommands(items, { onAttachNode });
  if (hasMore) {
    commands.push(
      getLoadMoreKnowledgeBrowserSlashCommand({ isLoading: isLoadingMore })
    );
  }
  return commands;
}
