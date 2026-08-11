import { FILTER_PICKER_PAGE_SIZE } from "@app/components/workspace/analytics/usageFilterPanel/constants";
import { useCallback, useState } from "react";

// Every non-member category is already fully loaded client-side;
export function useUsageFilterStaticPagination({
  totalCount,
  resetKey,
}: {
  totalCount: number;
  resetKey: string;
}) {
  const [visibleCount, setVisibleCount] = useState(FILTER_PICKER_PAGE_SIZE);

  // Reset visible count whenever resetKey changes, adjusted during render
  // rather than in an Effect since resetKey itself isn't otherwise used.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setVisibleCount(FILTER_PICKER_PAGE_SIZE);
  }

  const loadMore = useCallback(() => {
    setVisibleCount((current) => current + FILTER_PICKER_PAGE_SIZE);
  }, []);

  return {
    visibleCount,
    hasMore: visibleCount < totalCount,
    loadMore,
  };
}
