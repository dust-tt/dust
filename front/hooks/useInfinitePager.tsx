import { ReactNode, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";

export const useInfinitePager = ({
  nextPage,
  hasMore,
  isValidating,
  isLoading,
}: {
  nextPage: () => void;
  hasMore: boolean;
  isValidating: boolean;
  isLoading: boolean;
}) => {
  const { ref, inView } = useInView();
  useEffect(() => {
    if (inView && !isValidating && hasMore) {
      void nextPage();
    }
  }, [inView, isValidating, hasMore, nextPage]);

  const InfinitePager = useCallback(
    ({ children }: { children: ReactNode }) => (
      <>
        {hasMore && !isValidating && <div ref={ref}>{children}</div>}
        {isValidating && !isLoading && <div>load</div>}
      </>
    ),
    [hasMore, isValidating, isLoading]
  );

  return InfinitePager;
};
