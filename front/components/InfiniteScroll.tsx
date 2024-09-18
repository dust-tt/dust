import { ReactNode, useEffect } from "react";
import { useInView } from "react-intersection-observer";

export type InfiniteScrollProps = {
  nextPage: () => void;
  hasMore: boolean;
  isValidating: boolean;
  isLoading: boolean;
  children: ReactNode;
};

export const InfiniteScroll = ({
  nextPage,
  hasMore,
  isValidating,
  isLoading,
  children,
}: InfiniteScrollProps) => {
  const { ref, inView } = useInView();
  useEffect(() => {
    if (inView && !isValidating && hasMore) {
      void nextPage();
    }
  }, [inView, isValidating, hasMore, nextPage]);

  return (
    <>
      {hasMore && !isValidating && <div ref={ref}>{children}</div>}
      {isValidating && !isLoading && <div>load</div>}
    </>
  );
};
