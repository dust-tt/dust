import { useState, useEffect, useRef } from "react";
import { cn } from "@dust-tt/sparkle";
import { 
  MagnifyingGlassIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon
} from "@heroicons/react/20/solid";

import { useCanvas, useCanvasActions } from "./CanvasContext";
import { mockAgents, createCanvasItem } from "./utils/mockData";
import { getViewportCenter } from "./utils/coordinates";

interface Command {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function CommandPalette({ containerRef }: CommandPaletteProps) {
  const { state, dispatch } = useCanvas();
  const { addAgent, closeCommandPalette } = useCanvasActions();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const getCanvasCenter = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      return getViewportCenter(rect, state.transform);
    }
    return { x: 0, y: 0 };
  };

  const commands: Command[] = [
    // Add Agent commands
    ...mockAgents.map((agent) => ({
      id: `add-agent-${agent.id}`,
      label: `Add ${agent.name}`,
      icon: UserIcon,
      category: "Agents",
      action: () => {
        const center = getCanvasCenter();
        addAgent(agent, center);
        closeCommandPalette();
      },
    })),
    // Other commands
    {
      id: "add-note",
      label: "Add Note",
      icon: DocumentTextIcon,
      category: "Content",
      action: () => {
        const center = getCanvasCenter();
        const noteItem = createCanvasItem(
          "note",
          { content: "New note..." },
          center
        );
        dispatch({ type: "ADD_ITEM", item: noteItem });
        closeCommandPalette();
      },
    },
    {
      id: "add-conversation",
      label: "Start Conversation",
      icon: ChatBubbleLeftRightIcon,
      category: "Content",
      action: () => {
        const center = getCanvasCenter();
        const conversationItem = createCanvasItem(
          "conversation",
          {
            id: `msg-${Date.now()}`,
            agentId: "system",
            message: "How can I help you?",
            timestamp: new Date(),
            isUserMessage: false,
          },
          center
        );
        dispatch({ type: "ADD_ITEM", item: conversationItem });
        closeCommandPalette();
      },
    },
  ];

  const filteredCommands = commands.filter((command) =>
    command.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    command.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedCommands = filteredCommands.reduce((groups, command) => {
    const category = command.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(command);
    return groups;
  }, {} as Record<string, Command[]>);

  useEffect(() => {
    if (state.isCommandPaletteOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.isCommandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => prev > 0 ? prev - 1 : prev);
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
        break;
      case "Escape":
        closeCommandPalette();
        break;
    }
  };

  if (!state.isCommandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-20 z-50">
      <div className="bg-white rounded-lg shadow-xl border w-96 max-h-96 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b">
          <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for commands..."
            className="flex-1 outline-none text-gray-900 placeholder-gray-500"
          />
        </div>

        {/* Commands List */}
        <div className="max-h-80 overflow-y-auto">
          {Object.entries(groupedCommands).length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, categoryCommands]) => (
              <div key={category}>
                {/* Category Header */}
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
                  {category}
                </div>

                {/* Category Commands */}
                {categoryCommands.map((command, index) => {
                  const globalIndex = filteredCommands.indexOf(command);
                  return (
                    <button
                      key={command.id}
                      onClick={command.action}
                      className={cn(
                        "w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors",
                        globalIndex === selectedIndex ? "bg-blue-50 text-blue-900" : "text-gray-900"
                      )}
                    >
                      <command.icon className="w-5 h-5 mr-3 text-gray-400" />
                      <span className="font-medium">{command.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>
              Use ↑↓ to navigate, ↵ to select, ESC to close
            </span>
            <span>
              {filteredCommands.length} command{filteredCommands.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}