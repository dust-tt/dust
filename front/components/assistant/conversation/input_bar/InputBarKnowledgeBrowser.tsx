import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  getKnowledgeBrowserEntryLabel,
  KNOWLEDGE_BROWSER_GROUP_LABELS,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import { getVisibleNavigationEntries } from "@app/components/data_source_view/browser/useKnowledgeBrowserNavigation";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import {
  Breadcrumbs,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

const BROWSE_EMPTY_MESSAGE = "Nothing to browse here";
const ATTACH_FOLDER_ACTION_LABEL = "Add";

interface KnowledgeBrowserRowProps {
  item: KnowledgeBrowserItem;
  onAttachNode: (node: DataSourceViewContentNode) => void;
  onNavigate: (item: KnowledgeBrowserItem) => void;
}

// Containers navigate and keep the menu open; leaves attach and let the menu close. Folders also
// offer "Add", revealed on hover, to attach the folder itself.
function KnowledgeBrowserRow({
  item,
  onAttachNode,
  onNavigate,
}: KnowledgeBrowserRowProps) {
  const icon = <Icon visual={item.icon} size="md" />;

  if (item.kind === "node" && !item.expandable) {
    return (
      <DropdownMenuItem
        label={item.title}
        description={item.description}
        icon={icon}
        onClick={() => onAttachNode(item.node)}
        truncateText
      />
    );
  }

  const node = item.kind === "node" ? item.node : null;
  const handleAttach = (event: MouseEvent<HTMLButtonElement>) => {
    // Keep the click from selecting the row, which would navigate into the folder.
    event.preventDefault();
    event.stopPropagation();
    if (node) {
      onAttachNode(node);
    }
  };

  return (
    <DropdownMenuItem
      className="group"
      label={item.title}
      description={item.description}
      icon={icon}
      endComponent={
        <div className="flex items-center gap-1">
          {node && (
            <button
              type="button"
              className="rounded px-1 text-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-data-[highlighted]:opacity-100"
              onClick={handleAttach}
            >
              {ATTACH_FOLDER_ACTION_LABEL}
            </button>
          )}
          <Icon
            visual={ChevronRight}
            size="xs"
            className="text-muted-foreground"
          />
        </div>
      }
      onSelect={(event) => {
        event.preventDefault();
        onNavigate(item);
      }}
      truncateText
    />
  );
}

interface InputBarKnowledgeBrowserProps {
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  items: KnowledgeBrowserItem[];
  loadMore: () => Promise<void>;
  navigateTo: (index: number) => void;
  navigationHistory: NavigationHistoryEntryType[];
  onAttachNode: (node: DataSourceViewContentNode) => void;
  onNavigate: (item: KnowledgeBrowserItem) => void;
}

/**
 * @cc [owner:smb2268,label:product] popover-browse-mirrors-slash-menu
 * The root MUST list spaces under the "From spaces" heading and pods under "From Pods", and any
 * level below the root MUST show breadcrumbs for the visible navigation entries above its rows.
 * Space, category, data source and folder rows MUST navigate without closing the menu; leaf rows
 * MUST attach their node. Paging MUST load the next page as the list is scrolled to its end.
 */
export function InputBarKnowledgeBrowser({
  hasMore,
  isLoading,
  isLoadingMore,
  items,
  loadMore,
  navigateTo,
  navigationHistory,
  onAttachNode,
  onNavigate,
}: InputBarKnowledgeBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFocusedHistoryRef = useRef(navigationHistory);

  const isRoot = navigationHistory.length === 1;

  // The row that was clicked unmounts with its level; move focus to the new level so keyboard
  // navigation continues from there. The initial level leaves focus in the search input.
  useEffect(() => {
    if (isLoading || lastFocusedHistoryRef.current === navigationHistory) {
      return;
    }
    lastFocusedHistoryRef.current = navigationHistory;
    containerRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
  }, [isLoading, navigationHistory]);

  const breadcrumbItems = useMemo(
    () =>
      getVisibleNavigationEntries(navigationHistory).map(
        ({ entry, index }) => ({
          label: getKnowledgeBrowserEntryLabel(entry),
          onClick: () => navigateTo(index),
        })
      ),
    [navigateTo, navigationHistory]
  );

  const groups = useMemo(() => {
    if (!isRoot) {
      return [{ label: undefined, items }];
    }
    return (["spaces", "pods"] as const)
      .map((group) => ({
        label: KNOWLEDGE_BROWSER_GROUP_LABELS[group],
        items: items.filter(
          (item) => item.kind === "space" && item.group === group
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [isRoot, items]);

  return (
    <div ref={containerRef}>
      {!isRoot && (
        <div className="px-2 py-1">
          <Breadcrumbs
            items={breadcrumbItems}
            size="xs"
            truncateLengthMiddle={8}
            truncateLengthEnd={18}
          />
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          {BROWSE_EMPTY_MESSAGE}
        </div>
      ) : (
        <>
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? groupIndex}>
              {group.label && <DropdownMenuLabel label={group.label} />}
              {group.items.map((item) => (
                <KnowledgeBrowserRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  onAttachNode={onAttachNode}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
          <InfiniteScroll
            nextPage={loadMore}
            hasMore={hasMore}
            showLoader={isLoadingMore}
            loader={
              <div className="flex justify-center py-2">
                <Spinner size="xs" />
              </div>
            }
          />
        </>
      )}
    </div>
  );
}
