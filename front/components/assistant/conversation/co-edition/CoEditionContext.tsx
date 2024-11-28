import { createContext, useContext, useState } from "react";

type VisualizationContent = {
  type: "visualization";
  agentConfigurationId: string;
  code: string;
  complete: boolean;
};

type TextContent = {
  type: "text";
  content: string;
  title?: string;
};

type CodeContent = {
  type: "code";
  content: string;
  language: string;
  title?: string;
};

type CoEditionContent = VisualizationContent | TextContent | CodeContent;

export interface CoEditionState {
  isVisible: boolean;
  content: Map<string, CoEditionContent>;
}

export interface CoEditionContextType {
  state: CoEditionState;
  actions: {
    show: () => void;
    hide: () => void;
    toggle: () => void;
    addVisualization: (
      identifier: string,
      {
        agentConfigurationId,
        code,
        complete,
      }: {
        agentConfigurationId: string;
        code: string;
        complete: boolean;
      }
    ) => void;
    clear: () => void;
  };
}

const CoEditionContext = createContext<CoEditionContextType | null>(null);

export function CoEditionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CoEditionState>({
    isVisible: false,
    content: new Map(),
  });

  const actions = {
    show: () => setState((s) => ({ ...s, isVisible: true })),
    hide: () => setState((s) => ({ ...s, isVisible: false })),
    toggle: () => setState((s) => ({ ...s, isVisible: !s.isVisible })),
    addVisualization: (
      identifier: string,
      {
        agentConfigurationId,
        code,
        complete,
      }: {
        agentConfigurationId: string;
        code: string;
        complete: boolean;
        identifier: string;
      }
    ) => {
      setState((prevState) => {
        if (!prevState.content) {
          prevState.content = new Map();
        }

        prevState.content.set(identifier, {
          type: "visualization",
          agentConfigurationId,
          code,
          complete,
        });

        return prevState;
      });
    },
    clear: () => {
      setState({
        isVisible: false,
        content: new Map(),
      });
    },
  };

  return (
    <CoEditionContext.Provider value={{ state, actions }}>
      {children}
    </CoEditionContext.Provider>
  );
}

export const useCoEditionContext = () => {
  const context = useContext(CoEditionContext);
  if (!context) {
    throw new Error("useCoEdition must be used within CoEditionProvider");
  }
  return context;
};
