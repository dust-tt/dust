import { CONVERSATION_MIN_WIDTH_PX } from "@app/components/assistant/conversation/constant";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useCallback, useEffect, useRef, useState } from "react";

// How far the pointer must keep pushing past the conversation minimum width before the
// navigation bar folds to make room.
const NAVIGATION_FOLD_OVERSHOOT_PX = 140;

// Conversation width from which a fold is undone. The overshoot margin keeps the reopened
// conversation clear of the fold threshold.
export const NAVIGATION_REOPEN_CONVERSATION_WIDTH_PX =
  CONVERSATION_MIN_WIDTH_PX + NAVIGATION_FOLD_OVERSHOOT_PX;

// Once a divider drag squeezes the conversation to its minimum width, the divider stops. Pushing
// the pointer further past it folds the navigation bar instead of shrinking the conversation. The
// fold is undone as soon as the conversation has room for the navigation bar again, whether the
// divider is dragged back or the panel closes.
export function useFoldNavigationOnOvershoot({
  conversationElement,
  hasRoomForNavigation,
}: {
  conversationElement: HTMLElement | null;
  hasRoomForNavigation: boolean;
}) {
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const disarmRef = useRef<(() => void) | null>(null);
  // Set only while the fold is ours to undo.
  const [isFolded, setIsFolded] = useState(false);

  // Reopening the navigation bar by any means ends our fold.
  if (isNavigationBarOpen && isFolded) {
    setIsFolded(false);
  }

  useEffect(() => () => disarmRef.current?.(), []);

  useEffect(() => {
    if (isFolded && hasRoomForNavigation) {
      setIsNavigationBarOpen(true);
    }
  }, [isFolded, hasRoomForNavigation, setIsNavigationBarOpen]);

  return useCallback(() => {
    if (!isNavigationBarOpen || !conversationElement || disarmRef.current) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      // Layout changes (e.g. reopening the navigation bar) also squeeze the conversation. Only a
      // pointer still pressed from a divider drag may fold.
      if (event.buttons === 0) {
        disarm();
        return;
      }
      const { right } = conversationElement.getBoundingClientRect();
      if (event.clientX < right - NAVIGATION_FOLD_OVERSHOOT_PX) {
        disarm();
        setIsFolded(true);
        setIsNavigationBarOpen(false);
      }
    };
    const disarm = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", disarm);
      disarmRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", disarm);
    disarmRef.current = disarm;
  }, [conversationElement, isNavigationBarOpen, setIsNavigationBarOpen]);
}
