import { createContext, useContext, useState } from "react";

interface BaseCodeEditionContent {
  version: string;
}

export type CoEditionVisualizationContent = BaseCodeEditionContent & {
  type: "visualization";
  agentConfigurationId: string;
  code: string;
  complete: boolean;
};

type TextContent = BaseCodeEditionContent & {
  type: "text";
  content: string;
  title?: string;
};

type CodeContent = BaseCodeEditionContent & {
  type: "code";
  content: string;
  language: string;
  title?: string;
};

type CoEditionContent =
  | CoEditionVisualizationContent
  | TextContent
  | CodeContent;

export interface CoEditionState {
  isVisible: boolean;
  content: Record<string, CoEditionContent>;
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
        version,
      }: {
        agentConfigurationId: string;
        code: string;
        complete: boolean;
        version: string;
      }
    ) => void;
    clear: () => void;
  };
}

const CoEditionContext = createContext<CoEditionContextType | null>(null);

export function CoEditionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CoEditionState>({
    isVisible: false,
    content: {},
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
        version,
      }: {
        agentConfigurationId: string;
        code: string;
        complete: boolean;
        version: string;
      }
    ) => {
      console.log(">>> updating state with visualization", identifier);
      setState((prevState) => {
        const existingContent = prevState.content[identifier];
        if (existingContent) {
          // Same version, no need to update
          if (existingContent.version === version) {
            return prevState;
          }

          // Otherwise keep the latest version.
          const sortedVersions = [existingContent.version, version].sort();
          // If the new version is NOT the latest, ignore.
          if (sortedVersions[1] !== version) {
            return prevState;
          }
        }

        prevState.content[identifier] = {
          type: "visualization",
          agentConfigurationId,
          code,
          complete,
          version,
        };

        return {
          ...prevState,
        };
      });
    },
    clear: () => {
      setState({
        isVisible: false,
        content: {},
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
