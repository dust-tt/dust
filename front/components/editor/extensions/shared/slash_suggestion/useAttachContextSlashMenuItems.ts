import {
  type ContextFileSlashSearchItem,
  type ContextFileSlashSearchSelection,
  useContextFileSlashSearchItems,
} from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import type {
  ContextSlashSearchSelection,
  ContextSlashSearchUseCase,
} from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import { getAttachContextSlashMenuLoadingMessage } from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { getLocationForDataSourceViewContentNodeWithSpace } from "@app/lib/content_nodes";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

export type AttachContextSlashMenuItem =
  | {
      description: string;
      id: string;
      kind: "file";
      label: string;
      selection: ContextSlashSearchSelection;
    }
  | {
      description: string;
      id: string;
      kind: "knowledge";
      label: string;
      selection: ContextSlashSearchSelection;
    };

function contextFileItemToMenuItem(
  item: ContextFileSlashSearchItem
): AttachContextSlashMenuItem {
  return {
    description: item.description,
    id: item.id,
    kind: "file",
    label: item.label,
    selection: {
      kind: "file",
      selection: {
        contentType: item.file.contentType,
        fileId: item.fileId,
        label: item.label,
        path: item.path,
      },
    },
  };
}

export function useAttachContextSlashMenuItems({
  conversationId = null,
  isNodeAttached,
  owner,
  query,
  spaceId = null,
  useCase,
}: {
  conversationId?: string | null;
  isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
  owner: LightWorkspaceType;
  query: string;
  spaceId?: string | null;
  useCase: ContextSlashSearchUseCase;
}) {
  const includeFiles =
    useCase === "conversation-input" &&
    (Boolean(conversationId) || Boolean(spaceId));

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: false,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const spaceIds = useMemo(() => {
    if (spaceId) {
      return spaces
        .filter((space) => space.sId === spaceId || space.kind === "global")
        .map((space) => space.sId);
    }

    return spaces.map((space) => space.sId);
  }, [spaceId, spaces]);

  const projectId =
    spaceId && spacesMap[spaceId]?.kind === "project" ? spaceId : undefined;

  const normalizedQuery = query.trim().toLowerCase();
  const hasMinimalQuery = normalizedQuery.length >= MIN_SEARCH_QUERY_SIZE;

  const excludeNonRemoteDatabaseTables = useCase === "skill-builder";
  const includeDataSources = useCase === "conversation-input";

  const { fileItems, isFileItemsLoading } = useContextFileSlashSearchItems({
    conversationId,
    includeFiles,
    normalizedQuery,
    owner,
    spaceId,
  });

  const { knowledgeResults: searchResults, isSearchLoading } = useUnifiedSearch(
    {
      owner,
      query,
      pageSize: 10,
      disabled: isSpacesLoading || !hasMinimalQuery,
      spaceIds,
      projectId,
      viewType: "all",
      excludeNonRemoteDatabaseTables,
      includeDataSources,
      searchSourceUrls: true,
      includeTools: false,
      prioritizeSpaceAccess: true,
    }
  );

  const knowledgeItems = useMemo(
    () =>
      removeNulls(
        searchResults.map((node) => {
          const { dataSourceViews, ...rest } = node;
          const dataSourceView = dataSourceViews.find(
            (view) => spacesMap[view.spaceId]
          );

          if (!dataSourceView) {
            return null;
          }

          const knowledgeNode = { ...rest, dataSourceView };

          if (isNodeAttached?.(knowledgeNode)) {
            return null;
          }

          return {
            description: getLocationForDataSourceViewContentNodeWithSpace(
              knowledgeNode,
              spacesMap
            ),
            id: `knowledge-${node.internalId}-${dataSourceView.sId}`,
            kind: "knowledge" as const,
            label: node.title,
            selection: {
              kind: "knowledge" as const,
              node: knowledgeNode,
            },
          };
        })
      ),
    [isNodeAttached, searchResults, spacesMap]
  );

  const items = useMemo<AttachContextSlashMenuItem[]>(
    () => [...fileItems.map(contextFileItemToMenuItem), ...knowledgeItems],
    [fileItems, knowledgeItems]
  );

  const isLoading =
    isSpacesLoading ||
    isFileItemsLoading ||
    (hasMinimalQuery && isSearchLoading);

  const emptyMessage = !hasMinimalQuery
    ? "Type at least 2 characters to search"
    : "No results found";

  const loadingMessage = getAttachContextSlashMenuLoadingMessage(includeFiles);

  return {
    emptyMessage,
    hasMinimalQuery,
    includeFiles,
    isLoading,
    items,
    loadingMessage,
  };
}

export type { ContextFileSlashSearchSelection };
