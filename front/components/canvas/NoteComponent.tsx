import { useState } from "react";
import { cn } from "@dust-tt/sparkle";

import { useCanvas } from "./CanvasContext";

interface NoteComponentProps {
  itemId: string;
  x: number;
  y: number;
  content: string;
  isSelected: boolean;
  transform: { k: number };
}

export function NoteComponent({
  itemId,
  x,
  y,
  content,
  isSelected,
  transform,
}: NoteComponentProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { dispatch } = useCanvas();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({
      type: "SELECT_ITEM",
      itemId,
      multiSelect: e.metaKey || e.ctrlKey,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    if (isEditing) return; // Don't drag when editing
    
    e.preventDefault(); // Prevent text selection
    e.stopPropagation();
    setIsDragging(true);
    dispatch({ type: "START_DRAG", itemId });

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { x, y };
    const element = e.currentTarget as HTMLElement;

    // Disable text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      
      const deltaX = (e.clientX - startX) / transform.k;
      const deltaY = (e.clientY - startY) / transform.k;
      
      const newX = startPos.x + deltaX;
      const newY = startPos.y + deltaY;
      
      // Use transform instead of left/top for better performance
      element.style.transform = `translate(${newX - startPos.x}px, ${newY - startPos.y}px) translate(-50%, -50%)`;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const deltaX = (upEvent.clientX - startX) / transform.k;
      const deltaY = (upEvent.clientY - startY) / transform.k;
      const finalX = startPos.x + deltaX;
      const finalY = startPos.y + deltaY;
      
      setIsDragging(false);
      dispatch({ type: "END_DRAG" });
      
      // Re-enable text selection
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      
      // Reset transform and update position
      element.style.transform = 'translate(-50%, -50%)';
      element.style.left = `${finalX}px`;
      element.style.top = `${finalY}px`;
      
      // Update React state with final position
      dispatch({
        type: "UPDATE_ITEM_POSITION",
        itemId,
        x: finalX,
        y: finalY,
      });
      
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      data-canvas-item="true"
      className={cn(
        "absolute bg-yellow-200 p-3 rounded-lg shadow-lg border-2 transition-all duration-200",
        isSelected ? "border-blue-500" : "border-yellow-300",
        isDragging ? "cursor-grabbing shadow-xl" : "cursor-move",
        isEditing ? "cursor-text" : ""
      )}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        minWidth: "150px",
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <textarea
        defaultValue={content}
        className="w-full bg-transparent border-none outline-none resize-none text-sm cursor-text"
        rows={3}
        onClick={(e) => e.stopPropagation()}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        onChange={(e) => {
          // Update the note content
          dispatch({
            type: "UPDATE_ITEM",
            itemId,
            updates: {
              data: { content: e.target.value },
            },
          });
        }}
      />
    </div>
  );
}