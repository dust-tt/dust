import React, { createContext, useContext, useReducer } from "react";

import type {
  CanvasItem,
  MockAgentType,
  MockConversationBubble,
} from "./utils/mockData";
import type { Transform } from "./utils/coordinates";

export interface CanvasState {
  items: CanvasItem[];
  selectedItems: string[];
  transform: Transform;
  isCommandPaletteOpen: boolean;
  draggedItem: string | null;
}

export type CanvasAction =
  | { type: "ADD_ITEM"; item: CanvasItem }
  | { type: "REMOVE_ITEM"; itemId: string }
  | { type: "UPDATE_ITEM"; itemId: string; updates: Partial<CanvasItem> }
  | { type: "SELECT_ITEM"; itemId: string; multiSelect?: boolean }
  | { type: "DESELECT_ALL" }
  | { type: "SET_TRANSFORM"; transform: Transform }
  | { type: "TOGGLE_COMMAND_PALETTE" }
  | { type: "SET_COMMAND_PALETTE_OPEN"; open: boolean }
  | { type: "START_DRAG"; itemId: string }
  | { type: "END_DRAG" }
  | { type: "UPDATE_ITEM_POSITION"; itemId: string; x: number; y: number };

const initialState: CanvasState = {
  items: [],
  selectedItems: [],
  transform: { x: 0, y: 0, k: 1 },
  isCommandPaletteOpen: false,
  draggedItem: null,
};

function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "ADD_ITEM":
      return {
        ...state,
        items: [...state.items, action.item],
      };

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.itemId),
        selectedItems: state.selectedItems.filter((id) => id !== action.itemId),
      };

    case "UPDATE_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.itemId ? { ...item, ...action.updates } : item
        ),
      };

    case "SELECT_ITEM":
      if (action.multiSelect) {
        return {
          ...state,
          selectedItems: state.selectedItems.includes(action.itemId)
            ? state.selectedItems.filter((id) => id !== action.itemId)
            : [...state.selectedItems, action.itemId],
        };
      } else {
        return {
          ...state,
          selectedItems: [action.itemId],
        };
      }

    case "DESELECT_ALL":
      return {
        ...state,
        selectedItems: [],
      };

    case "SET_TRANSFORM":
      return {
        ...state,
        transform: action.transform,
      };

    case "TOGGLE_COMMAND_PALETTE":
      return {
        ...state,
        isCommandPaletteOpen: !state.isCommandPaletteOpen,
      };

    case "SET_COMMAND_PALETTE_OPEN":
      return {
        ...state,
        isCommandPaletteOpen: action.open,
      };

    case "START_DRAG":
      return {
        ...state,
        draggedItem: action.itemId,
      };

    case "END_DRAG":
      return {
        ...state,
        draggedItem: null,
      };

    case "UPDATE_ITEM_POSITION":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.itemId
            ? { ...item, x: action.x, y: action.y }
            : item
        ),
      };

    default:
      return state;
  }
}

interface CanvasContextType {
  state: CanvasState;
  dispatch: React.Dispatch<CanvasAction>;
}

const CanvasContext = createContext<CanvasContextType | null>(null);

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(canvasReducer, initialState);

  return (
    <CanvasContext.Provider value={{ state, dispatch }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("useCanvas must be used within a CanvasProvider");
  }
  return context;
}

// Helper hooks for common operations
export function useCanvasActions() {
  const { dispatch, state } = useCanvas();

  const addAgent = (agent: MockAgentType, position: { x: number; y: number }) => {
    const item: CanvasItem = {
      id: `agent-${Date.now()}-${Math.random()}`,
      type: "agent",
      x: position.x,
      y: position.y,
      data: agent,
    };
    dispatch({ type: "ADD_ITEM", item });
  };

  const addConversation = (
    conversation: MockConversationBubble,
    position: { x: number; y: number }
  ) => {
    const item: CanvasItem = {
      id: `conversation-${Date.now()}-${Math.random()}`,
      type: "conversation",
      x: position.x,
      y: position.y,
      data: conversation,
    };
    dispatch({ type: "ADD_ITEM", item });
  };

  const removeSelectedItems = () => {
    state.selectedItems.forEach((itemId) => {
      dispatch({ type: "REMOVE_ITEM", itemId });
    });
  };

  const openCommandPalette = () => {
    dispatch({ type: "SET_COMMAND_PALETTE_OPEN", open: true });
  };

  const closeCommandPalette = () => {
    dispatch({ type: "SET_COMMAND_PALETTE_OPEN", open: false });
  };

  return {
    addAgent,
    addConversation,
    removeSelectedItems,
    openCommandPalette,
    closeCommandPalette,
  };
}