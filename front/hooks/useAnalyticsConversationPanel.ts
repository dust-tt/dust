import { useCallback, useState } from "react";

/**
 * Open/close state for the Analytics conversation panel.
 *
 * Deliberately does not touch the navigation sidebar: reclaiming its width is
 * driven by how wide the panel actually gets, which only the layout can
 * measure (see AppContentLayout's onContentSqueezed).
 *
 * openPanel/closePanel are called both directly (the CTA / close button) and
 * from the resizable panel's onCollapse lifecycle callback (dragging the
 * divider shut), so both guard on the current value to stay idempotent.
 */
export function useAnalyticsConversationPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const openPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, openPanel, closePanel };
}
