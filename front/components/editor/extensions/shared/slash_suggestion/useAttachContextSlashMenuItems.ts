import { toDataSourceViewContentNodes } from "@app/components/data_source_view/browser/knowledgeBrowserSearch";
import type {
  ContextFileSlashSearchItem,
  ContextFileSlashSearchSelection,
} from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import { useContextFileSlashSearchItems } from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import type {
  ContextSlashSearchSelection,
  ContextSlashSearchUseCase,
} from "@app/components/editor/extensions/shared/slash_suggestion/contextSlashSearchTypes";
import { getLocationForDataSourceViewContentNodeWithSpace } from "@app/lib/content_nodes";
import { useUnifiedSearch } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
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
  owner,
  query,
  spaceId = null,
  useCase,
}: {
  conversationId?: string | null;
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

  // Within a pod, only the pod itself and the global space are searchable and browsable.
  const scopedSpaces = useMemo(
    () =>
      spaceId
        ? spaces.filter(
            (space) => space.sId === spaceId || space.kind === "global"
          )
        : spaces,
    [spaceId, spaces]
  );

  const spaceIds = useMemo(
    () => scopedSpaces.map((space) => space.sId),
    [scopedSpaces]
  );

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
      toDataSourceViewContentNodes(searchResults, Object.keys(spacesMap)).map(
        (knowledgeNode) => ({
          description: getLocationForDataSourceViewContentNodeWithSpace(
            knowledgeNode,
            spacesMap
          ),
          id: `knowledge-${knowledgeNode.internalId}-${knowledgeNode.dataSourceView.sId}`,
          kind: "knowledge" as const,
          label: knowledgeNode.title,
          selection: {
            kind: "knowledge" as const,
            node: knowledgeNode,
          },
        })
      ),
    [searchResults, spacesMap]
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

  return {
    emptyMessage,
    hasMinimalQuery,
    includeFiles,
    isLoading,
    items,
    spaces: scopedSpaces,
  };
}

export type { ContextFileSlashSearchSelection };
