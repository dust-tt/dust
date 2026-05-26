import { assertNever } from "@app/types/shared/utils/assert_never";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useReducer } from "react";

// --- Types ---

type PanelState =
  | { isOpen: false }
  | { isOpen: true; renderer: () => ReactNode };

type PanelAction =
  | { type: "open"; renderer: () => ReactNode }
  | { type: "close" };

// --- Reducer ---

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "open":
      return { isOpen: true, renderer: action.renderer };
    case "close":
      return { isOpen: false };
    default:
      return assertNever(action);
  }
}

// --- Contexts ---

const PanelStateContext = createContext<PanelState>({ isOpen: false });
const PanelDispatchContext = createContext<React.Dispatch<PanelAction> | null>(
  null
);

// --- Provider ---

interface PanelProviderProps {
  children: ReactNode;
}

export function PanelProvider({ children }: PanelProviderProps) {
  const [state, dispatch] = useReducer(panelReducer, { isOpen: false });

  return (
    <PanelStateContext.Provider value={state}>
      <PanelDispatchContext.Provider value={dispatch}>
        {children}
      </PanelDispatchContext.Provider>
    </PanelStateContext.Provider>
  );
}

// --- Hooks ---

function usePanelDispatch(): React.Dispatch<PanelAction> {
  const dispatch = useContext(PanelDispatchContext);
  if (!dispatch) {
    throw new Error("usePanelDispatch must be used within a PanelProvider");
  }
  return dispatch;
}

export function usePanelState(): PanelState {
  return useContext(PanelStateContext);
}

export function useOpenPanel(): (renderer: () => ReactNode) => void {
  const dispatch = usePanelDispatch();
  return useCallback(
    (renderer: () => ReactNode) => dispatch({ type: "open", renderer }),
    [dispatch]
  );
}

export function useClosePanel(): () => void {
  const dispatch = usePanelDispatch();
  return useCallback(() => dispatch({ type: "close" }), [dispatch]);
}
