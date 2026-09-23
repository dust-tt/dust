import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { EnrichedSpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

// The given spaces that hold at least one of the given data source views, in the given order.
export function filterBrowsableSpaces<T extends { sId: string }>(
  spaces: T[],
  dataSourceViews: Pick<DataSourceViewType, "spaceId">[]
): T[] {
  const spaceIds = new Set(dataSourceViews.map((dsv) => dsv.spaceId));
  return spaces.filter((space) => spaceIds.has(space.sId));
}

/**
 * @cc [owner:smb2268,label:product] browsable-spaces-have-data-source-views
 * When enabled, the returned spaces MUST be the given spaces that hold at least one data source
 * view the caller can read, in the given order, so a space with nothing to browse is not offered.
 * While the data source views load no space is returned, so a lone unfiltered space is never
 * entered prematurely. When disabled the given spaces are returned unchanged and nothing is
 * fetched.
 */
export function useBrowsableSpaces({
  owner,
  spaces,
  enabled,
}: {
  owner: LightWorkspaceType;
  spaces: EnrichedSpaceType[];
  enabled: boolean;
}): { spaces: EnrichedSpaceType[]; isLoading: boolean } {
  const { dataSourceViews, isDataSourceViewsLoading } = useDataSourceViews(
    owner,
    { disabled: !enabled }
  );

  const browsableSpaces = useMemo(() => {
    if (!enabled) {
      return spaces;
    }
    if (isDataSourceViewsLoading) {
      return [];
    }
    return filterBrowsableSpaces(spaces, dataSourceViews);
  }, [dataSourceViews, enabled, isDataSourceViewsLoading, spaces]);

  return {
    spaces: browsableSpaces,
    isLoading: enabled && isDataSourceViewsLoading,
  };
}
