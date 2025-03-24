import type { ReactNode } from "react";
import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

export type InfiniteScrollProps = {
  nextPage: () => void;
  hasMore: boolean;
  showLoader: boolean;
  loader: ReactNode;
};

export const InfiniteScroll = ({
  nextPage,
  hasMore,
  showLoader,
  loader,
}: InfiniteScrollProps) => {
  const { ref, inView } = useInView();  
  useEffect(() => {
    if (inView && hasMore) {
      void nextPage();
    }
  }, [inView, hasMore, nextPage]);

  return (
    <>
      {hasMore && <div ref={ref} />}
      {showLoader && loader}
    </>
  );
};
