import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  getKnowledgeBrowserEntryLabel,
  KNOWLEDGE_BROWSER_GROUP_LABELS,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import type { NavigationHistoryState } from "@app/components/data_source_view/context/useNavigationHistory";
import type { AttachContextSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import { SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/attachContextSlashCommand";
import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { BreadcrumbsItem } from "@dust-tt/sparkle";
import { Attachment01, DotsHorizontal } from "@dust-tt/sparkle";

export const NAVIGATE_KNOWLEDGE_BROWSER_ACTION = "navigate-knowledge-browser";
export const LOAD_MORE_KNOWLEDGE_BROWSER_ACTION = "load-more-knowledge-browser";

const LOAD_MORE_KNOWLEDGE_BROWSER_ID = "knowledge-browser-load-more";
const ATTACH_CURRENT_KNOWLEDGE_BROWSER_ID = "knowledge-browser-attach-current";

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

/**
 * @cc [owner:smb2268,label:product] browser-rows-navigate-or-attach
 * Space, category and data source rows and expandable node rows MUST produce a
 * `NAVIGATE_KNOWLEDGE_BROWSER_ACTION` command carrying the row; non-expandable node rows MUST
 * produce a `SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION` command attaching the node. Row order is
 * preserved.
 */
export function toKnowledgeBrowserSlashCommands(
  items: KnowledgeBrowserItem[]
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
    return {
      action: NAVIGATE_KNOWLEDGE_BROWSER_ACTION,
      data: { item },
      description: item.description,
      icon: item.icon,
      id: `browse-${item.kind}-${item.id}`,
      label: item.title,
    };
  });
}

// Lets the browsed folder itself be attached, since its row navigated into it instead.
export function getAttachCurrentNodeSlashCommand(
  node: DataSourceViewContentNode
): AttachContextSlashCommand {
  return toAttachNodeSlashCommand(
    ATTACH_CURRENT_KNOWLEDGE_BROWSER_ID,
    `Attach "${node.title}"`,
    Attachment01,
    node
  );
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

export function getKnowledgeBrowserBreadcrumbItems(
  navigationHistory: NavigationHistoryEntryType[],
  navigateTo: (index: number) => void
): BreadcrumbsItem[] {
  return navigationHistory.map((entry, index) => ({
    label: getKnowledgeBrowserEntryLabel(entry),
    onClick: () => navigateTo(index),
  }));
}

// The root lists spaces under a heading and pods under a second one, like the Agent Builder.
export function buildRootBrowseSections(
  items: KnowledgeBrowserItem[]
): SlashCommandSection[] {
  const spaceItems = items.filter(
    (item) => item.kind === "space" && item.group === "spaces"
  );
  const podItems = items.filter(
    (item) => item.kind === "space" && item.group === "pods"
  );
  const sections: SlashCommandSection[] = [
    {
      label: KNOWLEDGE_BROWSER_GROUP_LABELS.spaces,
      items: toKnowledgeBrowserSlashCommands(spaceItems),
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

// Rows below the root: an attach row for the browsed folder first, the children, then paging.
export function buildBrowseCommands(
  items: KnowledgeBrowserItem[],
  {
    currentEntry,
    isNodeAttached,
    hasMore,
    isLoadingMore,
  }: {
    currentEntry: NavigationHistoryEntryType;
    isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
    hasMore: boolean;
    isLoadingMore: boolean;
  }
): SlashCommand[] {
  const commands = toKnowledgeBrowserSlashCommands(items);
  if (currentEntry.type === "node" && !isNodeAttached?.(currentEntry.node)) {
    commands.unshift(getAttachCurrentNodeSlashCommand(currentEntry.node));
  }
  if (hasMore) {
    commands.push(
      getLoadMoreKnowledgeBrowserSlashCommand({ isLoading: isLoadingMore })
    );
  }
  return commands;
}

type NavigationSetters = Pick<
  NavigationHistoryState,
  | "setSpaceEntry"
  | "setCategoryEntry"
  | "setDataSourceViewEntry"
  | "addNodeEntry"
>;

export function navigateToKnowledgeBrowserItem(
  item: KnowledgeBrowserItem,
  navigation: NavigationSetters
): void {
  switch (item.kind) {
    case "space":
      navigation.setSpaceEntry(item.space);
      return;
    case "category":
      navigation.setCategoryEntry(item.category);
      return;
    case "data_source":
      navigation.setDataSourceViewEntry(item.dataSourceView);
      return;
    case "node":
      navigation.addNodeEntry(item.node);
      return;
    default:
      assertNeverAndIgnore(item);
  }
}
