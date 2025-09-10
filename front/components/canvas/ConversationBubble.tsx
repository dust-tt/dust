import { useState } from "react";
import { cn } from "@dust-tt/sparkle";
import { PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/20/solid";

import type { MockConversationBubble } from "./utils/mockData";
import { useCanvas } from "./CanvasContext";

interface ConversationBubbleProps {
  conversation: MockConversationBubble;
  x: number;
  y: number;
  itemId: string;
  isSelected: boolean;
  transform: { k: number };
}

export function ConversationBubble({
  conversation,
  x,
  y,
  itemId,
  isSelected,
  transform,
}: ConversationBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [newMessage, setNewMessage] = useState("");
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
    
    // Don't start drag if clicking on a button or interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('form')) {
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // In a real implementation, this would send the message to the agent
    console.log("Sending message:", newMessage);
    setNewMessage("");
    setShowInput(false);

    // Mock response from agent
    setTimeout(() => {
      console.log("Agent response would appear here");
    }, 1000);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "REMOVE_ITEM", itemId });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      data-canvas-item="true"
      className={cn(
        "absolute bg-white rounded-lg shadow-lg border-2 transition-all duration-200",
        isSelected ? "border-blue-500" : "border-gray-200",
        isDragging ? "cursor-grabbing shadow-xl" : "cursor-pointer",
        isHovered && !isDragging ? "shadow-xl" : ""
      )}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        minWidth: "250px",
        maxWidth: "350px",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
            💬
          </div>
          <div>
            <span className="text-sm font-medium text-gray-900">
              Conversation
            </span>
            <div className="text-xs text-gray-500">
              {formatTime(conversation.timestamp)}
            </div>
          </div>
        </div>

        {isHovered && !isDragging && (
          <button
            onClick={handleRemove}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded transition-colors"
            title="Remove conversation"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Message */}
      <div className="p-3">
        <div
          className={cn(
            "p-2 rounded-lg text-sm",
            conversation.isUserMessage
              ? "bg-blue-100 text-blue-900 ml-4"
              : "bg-gray-100 text-gray-900 mr-4"
          )}
        >
          {conversation.message}
        </div>
      </div>

      {/* Action Area */}
      <div className="px-3 pb-3">
        {!showInput ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowInput(true);
            }}
            className="w-full py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Reply...
          </button>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              rows={2}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="flex-1 flex items-center justify-center space-x-1 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
                <span>Send</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInput(false);
                  setNewMessage("");
                }}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}