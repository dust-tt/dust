import { ReactNode, useEffect } from "react";
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

  const InfinitePager = ({ children }: { children: ReactNode }) => (
    <>
      {hasMore && !isValidating && <div ref={ref} />}
      {isValidating && !isLoading && children}
    </>
  );

  return InfinitePager;
};
