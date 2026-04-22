import { useCallback, useRef } from "react";

interface UseDragOptions {
  onDrag: (delta: { dx: number; dy: number }) => void;
  onDragEnd: () => void;
}

export function useDrag({ onDrag, onDragEnd }: UseDragOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startRef.current = { x: e.clientX, y: e.clientY };

      const onMouseMove = (ev: MouseEvent) => {
        if (!startRef.current) {
          return;
        }
        onDrag({
          dx: ev.clientX - startRef.current.x,
          dy: ev.clientY - startRef.current.y,
        });
      };

      const onMouseUp = () => {
        startRef.current = null;
        onDragEnd();
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onDrag, onDragEnd]
  );

  return { onMouseDown };
}
