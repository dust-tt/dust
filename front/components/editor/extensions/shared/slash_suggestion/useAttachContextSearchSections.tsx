import { buildNodeItems } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  ALL_KNOWLEDGE_SECTION_LABEL,
  getScopedSearchSectionLabel,
  getSearchResultKey,
} from "@app/components/data_source_view/browser/knowledgeBrowserSearch";
import { useKnowledgeBrowserSearch } from "@app/components/data_source_view/browser/useKnowledgeBrowserSearch";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { findSpaceFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import type { SlashCommandSection } from "@app/components/editor/extensions/shared/slash_suggestion/buildSlashCommandSections";
import { toKnowledgeBrowserSlashCommands } from "@app/components/editor/extensions/shared/slash_suggestion/knowledgeBrowserSlashCommands";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { AttachContextSlashMenuItem } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSlashMenuItems";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

const SCOPED_SEARCH_EMPTY_MESSAGE = "No matches here";

interface UseAttachContextSearchSectionsParams {
  // The views listed at the category level, so the scope needs no fetch of its own.
  categoryDataSourceViews: DataSourceViewType[];
  emptyMessage: string;
  enabled: boolean;
  excludeNonRemoteDatabaseTables: boolean;
  hasMinimalQuery: boolean;
  isGlobalLoading: boolean;
  // The global search results.
  items: AttachContextSlashMenuItem[];
  navigationHistory: NavigationHistoryEntryType[];
  // Attaches a folder from its "Add" end action instead of navigating into it.
  onAttachNode: (node: DataSourceViewContentNode) => void;
  owner: LightWorkspaceType;
  query: string;
  // Maps a global search item to the row the sub-menu renders for it.
  toCommand: (item: AttachContextSlashMenuItem) => SlashCommand;
}

/**
 * @cc [owner:smb2268,label:product] scoped-then-global-sections
 * The first section MUST hold the matches within the browsed level, rendered like browse rows
 * (containers navigate, leaves attach), and the second MUST hold the global results minus any
 * node already present in the first, so a match never appears twice.
 */
export function useAttachContextSearchSections({
  categoryDataSourceViews,
  emptyMessage,
  enabled,
  excludeNonRemoteDatabaseTables,
  hasMinimalQuery,
  isGlobalLoading,
  items,
  navigationHistory,
  onAttachNode,
  owner,
  query,
  toCommand,
}: UseAttachContextSearchSectionsParams): SlashCommandSection[] {
  const scopedSearch = useKnowledgeBrowserSearch({
    owner,
    navigationHistory,
    categoryDataSourceViews,
    query,
    viewType: "all",
    enabled,
  });

  const scopedCommands = useMemo(
    () =>
      toKnowledgeBrowserSlashCommands(
        buildNodeItems(scopedSearch.results, {
          isTopLevelInView: false,
          excludeNonRemoteDatabaseTables,
          spaceName: findSpaceFromNavigationHistory(navigationHistory)?.name,
        }),
        { onAttachNode }
      ),
    [
      excludeNonRemoteDatabaseTables,
      navigationHistory,
      onAttachNode,
      scopedSearch.results,
    ]
  );

  return useMemo((): SlashCommandSection[] => {
    const scopedKeys = new Set(scopedSearch.results.map(getSearchResultKey));
    const remainingItems = items.filter(
      (item) =>
        item.selection.kind !== "knowledge" ||
        !scopedKeys.has(getSearchResultKey(item.selection.node))
    );
    return [
      {
        label: getScopedSearchSectionLabel(scopedSearch.scopeLabel),
        items: scopedCommands,
        isLoading: scopedSearch.isLoading,
        // Below the minimum query length the global section already shows the hint.
        emptyMessage: hasMinimalQuery ? SCOPED_SEARCH_EMPTY_MESSAGE : undefined,
      },
      {
        label: ALL_KNOWLEDGE_SECTION_LABEL,
        items: remainingItems.map(toCommand),
        isLoading: isGlobalLoading,
        emptyMessage,
      },
    ];
  }, [
    emptyMessage,
    hasMinimalQuery,
    isGlobalLoading,
    items,
    scopedCommands,
    scopedSearch.isLoading,
    scopedSearch.results,
    scopedSearch.scopeLabel,
    toCommand,
  ]);
}
