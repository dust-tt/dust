import escapeRegExp from "lodash/escapeRegExp";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export function useSpaceSidebarItemFocus({ path }: { path: string }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const currentRouterPath = router.asPath;

  // Check if input path is a descendant of the given path:
  const descendantRegex = new RegExp(`^${escapeRegExp(path)}/?$`);
  const isDescendant = descendantRegex.test(currentRouterPath);

  const isSamePath = currentRouterPath === path;

  // Unfold the space's category if it's an ancestor of the current page.
  useEffect(() => {
    if (isDescendant) {
      setIsExpanded(true);
    }
  }, [isDescendant]);

  return {
    isExpanded,
    toggleExpanded: () => setIsExpanded((prev) => !prev),
    isSelected: isSamePath,
  };
}
