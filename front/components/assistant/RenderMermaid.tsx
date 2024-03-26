import mermaid from "mermaid";
import type { ReactNode } from "react";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/*
 * This component is used to render mermaid graphs in agent Messages
 */
export const MermaidGraph: React.FC<{ chart: string }> = ({ chart }) => {
  const graphRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (graphRef.current) {
      mermaid.initialize({ startOnLoad: false });
      graphRef.current.innerHTML = chart;
      void mermaid.init(undefined, graphRef.current);
    }
  }, [chart]);

  return <div ref={graphRef} className="mermaid"></div>;
};

/**
 * Context to manage the display of mermaid graphs
 */
const MermaidDisplayContext = createContext<
  | {
      isValidMermaid: boolean;
      showMermaid: boolean;
      setIsValidMermaid: React.Dispatch<React.SetStateAction<boolean>>;
      setShowMermaid: React.Dispatch<React.SetStateAction<boolean>>;
    }
  | undefined
>(undefined);

export const MermaidDisplayProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [showMermaid, setShowMermaid] = useState<boolean>(false);
  const [isValidMermaid, setIsValidMermaid] = useState<boolean>(false);

  return (
    <MermaidDisplayContext.Provider
      value={{ showMermaid, setShowMermaid, isValidMermaid, setIsValidMermaid }}
    >
      {children}
    </MermaidDisplayContext.Provider>
  );
};

export const useMermaidDisplay = () => {
  const context = useContext(MermaidDisplayContext);
  if (context === undefined) {
    throw new Error(
      "useMermaidDisplay must be used within a MermaidDisplayProvider"
    );
  }
  return context;
};
