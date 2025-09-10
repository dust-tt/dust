import { useEffect, useRef } from "react";
import * as d3 from "d3";

import { useCanvas } from "./CanvasContext";
import { AgentChip } from "./AgentChip";
import { ConversationBubble } from "./ConversationBubble";
import { CommandPalette } from "./CommandPalette";
import { NoteComponent } from "./NoteComponent";
import { clampTransform } from "./utils/coordinates";
import type { MockAgentType, MockConversationBubble } from "./utils/mockData";

interface CanvasProps {
  className?: string;
}

export function Canvas({ className }: CanvasProps) {
  const { state, dispatch } = useCanvas();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !contentRef.current) return;

    const container = d3.select(containerRef.current);
    const content = d3.select(contentRef.current);

    const zoom = d3.zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 3])
      .filter((event) => {
        // Disable zoom when dragging items
        if (state.draggedItem) return false;
        
        // Allow zoom only on canvas background, not on canvas items
        const target = event.target as HTMLElement;
        if (target?.closest('[data-canvas-item]')) return false;
        
        // Allow all mouse buttons for panning, and wheel for zooming
        return true;
      })
      .on("zoom", (event) => {
        const transform = clampTransform(event.transform);
        
        // Direct DOM manipulation for smooth panning/zooming
        content.style("transform", 
          `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`
        );
      })
      .on("end", (event) => {
        // Update React state only when zoom/pan ends
        const transform = clampTransform(event.transform);
        dispatch({ type: "SET_TRANSFORM", transform });
      });

    // Set initial transform
    const initialTransform = d3.zoomIdentity
      .translate(state.transform.x, state.transform.y)
      .scale(state.transform.k);
    
    container.call(zoom).call(zoom.transform, initialTransform);

    // Handle clicks on empty space
    const handleClick = (event: MouseEvent) => {
      if (event.target === containerRef.current || event.target === contentRef.current) {
        dispatch({ type: "DESELECT_ALL" });
      }
    };

    containerRef.current.addEventListener("click", handleClick);

    return () => {
      containerRef.current?.removeEventListener("click", handleClick);
    };
  }, [dispatch, state.transform, state.draggedItem]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle Delete key
      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedItems.length > 0) {
          state.selectedItems.forEach((itemId) => {
            dispatch({ type: "REMOVE_ITEM", itemId });
          });
        }
      }

      // Handle CMD+K / Ctrl+K
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
      }

      // Handle Escape
      if (event.key === "Escape") {
        if (state.isCommandPaletteOpen) {
          dispatch({ type: "SET_COMMAND_PALETTE_OPEN", open: false });
        } else if (state.selectedItems.length > 0) {
          dispatch({ type: "DESELECT_ALL" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, state.selectedItems, state.isCommandPaletteOpen]);

  return (
    <div className={className}>
      <div 
        ref={containerRef}
        className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: `
            radial-gradient(circle, #e2e8f0 1px, transparent 1px),
            radial-gradient(circle, #e2e8f0 1px, transparent 1px)
          `,
          backgroundPosition: "0 0, 20px 20px",
          backgroundSize: "20px 20px",
        }}
      >
        <div 
          ref={contentRef} 
          className="w-full h-full relative"
          style={{
            transform: `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.k})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Render canvas items */}
          {state.items.map((item) => {
            const isSelected = state.selectedItems.includes(item.id);

            switch (item.type) {
              case "agent":
                return (
                  <AgentChip
                    key={item.id}
                    agent={item.data as MockAgentType}
                    x={item.x}
                    y={item.y}
                    itemId={item.id}
                    isSelected={isSelected}
                    transform={state.transform}
                  />
                );
              
              case "conversation":
                return (
                  <ConversationBubble
                    key={item.id}
                    conversation={item.data as MockConversationBubble}
                    x={item.x}
                    y={item.y}
                    itemId={item.id}
                    isSelected={isSelected}
                    transform={state.transform}
                  />
                );

              case "note":
                return (
                  <NoteComponent
                    key={item.id}
                    itemId={item.id}
                    x={item.x}
                    y={item.y}
                    content={(item.data as { content: string }).content}
                    isSelected={isSelected}
                    transform={state.transform}
                  />
                );

              default:
                return null;
            }
          })}

          {/* Canvas grid guide (visible when zoomed out) */}
          {state.transform.k < 0.5 && (
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full">
                <defs>
                  <pattern
                    id="grid"
                    width="100"
                    height="100"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 100 0 L 0 0 0 100"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette containerRef={containerRef} />

      {/* Status Bar */}
      <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-600 shadow-lg">
        <div className="flex items-center space-x-4">
          <span>
            Zoom: {Math.round(state.transform.k * 100)}%
          </span>
          <span>•</span>
          <span>
            Items: {state.items.length}
          </span>
          {state.selectedItems.length > 0 && (
            <>
              <span>•</span>
              <span>
                Selected: {state.selectedItems.length}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}