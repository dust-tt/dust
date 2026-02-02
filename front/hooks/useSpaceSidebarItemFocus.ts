import escapeRegExp from "lodash/escapeRegExp";
import { useEffect, useState } from "react";

import { useAppRouter } from "@app/lib/platform";

export function useSpaceSidebarItemFocus({ path }: { path: string }) {
  const router = useAppRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const currentRouterPath = router.asPath;

  // Check if input path is a descendant of the given path:
  const descendantRegex = new RegExp(`^${escapeRegExp(path)}/?$`);
  const isDescendant = descendantRegex.test(currentRouterPath);

  const isSamePath = currentRouterPath === path;

  // Unfold the space's category if it's an ancestor of the current page.
  /* eslint-disable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
  useEffect(() => {
    if (isDescendant) {
      setIsExpanded(true);
    }
  }, [isDescendant]);
  /* eslint-enable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */

  return {
    isExpanded,
    toggleExpanded: () => setIsExpanded((prev) => !prev),
    isSelected: isSamePath,
  };
}
