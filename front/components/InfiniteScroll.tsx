import type { ReactNode } from "react";
import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

export type InfiniteScrollProps = {
  nextPage: () => void;
  hasMore: boolean;
  showLoader: boolean;
  loader: ReactNode;
};

/**
 * The sentinel div has 1px height becase when you zoom out the container can have a fractional pixel
 * and if it happens browsers will round it to determine the maximum scrollable position and you will not reach out
 * the bottom of the container if the element height is 0px.
 */
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
      {hasMore && <div ref={ref} className="h-px" />}
      {showLoader && loader}
    </>
  );
};
