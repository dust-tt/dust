import { useEffect, useRef } from "react";
import ReactDOM from "react-dom";

/**
 * Simple hook to manage action buttons portal
 */

interface UseActionButtonsPortalProps {
  containerId: string;
}

export function useActionButtonsPortal({
  containerId,
}: UseActionButtonsPortalProps) {
  // Reference to the container element.
  const containerRef = useRef<HTMLElement | null>(null);

  // Find the container on mount.
  useEffect(() => {
    containerRef.current = document.getElementById(containerId);
  }, [containerId]);

  return {
    // Function to create a portal if container exists.
    portalToHeader: (content: React.ReactNode) => {
      return containerRef.current
        ? ReactDOM.createPortal(content, containerRef.current)
        : null;
    },
    // Reference to container (for debugging)
    containerRef,
  };
}
