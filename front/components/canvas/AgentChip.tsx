import { useState } from "react";
import { cn } from "@dust-tt/sparkle";
import { PencilIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/20/solid";

import type { MockAgentType } from "./utils/mockData";
import { useCanvas, useCanvasActions } from "./CanvasContext";

interface AgentChipProps {
  agent: MockAgentType;
  x: number;
  y: number;
  itemId: string;
  isSelected: boolean;
  transform: { k: number };
}

export function AgentChip({
  agent,
  x,
  y,
  itemId,
  isSelected,
  transform,
}: AgentChipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { dispatch } = useCanvas();
  const { addConversation } = useCanvasActions();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({
      type: "SELECT_ITEM",
      itemId,
      multiSelect: e.metaKey || e.ctrlKey,
    });
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(!isEditing);
  };

  const handleInteract = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Create a conversation bubble next to the agent
    const conversationData = {
      id: `msg-${Date.now()}`,
      agentId: agent.id,
      message: `Hello! How can I help you today?`,
      timestamp: new Date(),
      isUserMessage: false,
    };
    addConversation(conversationData, { x: x + 200, y: y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    // Don't start drag if clicking on a button or interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }
    
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

  const getStatusColor = (status: MockAgentType["status"]) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200";
      case "draft":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "archived":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div
      data-canvas-item="true"
      className={cn(
        "absolute bg-white rounded-lg shadow-lg border-2 transition-all duration-200",
        isSelected ? "border-blue-500" : "border-gray-200",
        isDragging ? "cursor-grabbing shadow-xl" : "cursor-pointer",
        isHovered && !isDragging ? "shadow-xl scale-105" : ""
      )}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        minWidth: isEditing ? "300px" : "200px",
        minHeight: isEditing ? "200px" : "auto",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Agent Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-medium text-sm text-gray-900">{agent.name}</h3>
            <div className="flex items-center space-x-2 mt-1">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium border",
                  getStatusColor(agent.status)
                )}
              >
                {agent.status}
              </span>
              <span className="text-xs text-gray-500">{agent.model}</span>
            </div>
          </div>
        </div>

        {/* Action buttons - shown on hover */}
        {isHovered && !isDragging && (
          <div className="flex space-x-1">
            <button
              onClick={handleEdit}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Edit agent"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleInteract}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Start conversation"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Agent Description */}
      <div className="px-3 pb-3">
        <p className="text-xs text-gray-600">{agent.description}</p>
      </div>

      {/* Expanded Edit Mode */}
      {isEditing && (
        <div className="border-t p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              defaultValue={agent.name}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              defaultValue={agent.description}
              rows={3}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}