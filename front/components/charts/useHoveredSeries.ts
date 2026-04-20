import { useCallback, useState } from "react";

export function useHoveredSeries() {
  const [hoveredKey, setHoveredKey] = useState<string | undefined>(undefined);

  const hoverHandlers = useCallback(
    (key: string) => ({
      onMouseEnter: () => setHoveredKey(key),
      onMouseLeave: () => setHoveredKey(undefined),
    }),
    []
  );

  return { hoveredKey, hoverHandlers };
}
