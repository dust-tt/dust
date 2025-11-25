import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type WelcomeTourGuideContextType = {
  startConversationRef: React.RefObject<HTMLDivElement>;
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>;
  createAgentButtonRef: React.RefObject<HTMLDivElement>;
  showTourGuide: boolean;
  startTour: () => void;
  endTour: () => void;
};

const WelcomeTourGuideContext =
  createContext<WelcomeTourGuideContextType | null>(null);

export function WelcomeTourGuideProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const startConversationRef = useRef<HTMLDivElement>(null);
  const spaceMenuButtonRef = useRef<HTMLDivElement>(null);
  const createAgentButtonRef = useRef<HTMLDivElement>(null);
  const [showTourGuide, setShowTourGuide] = useState(false);

  const startTour = useCallback(() => {
    setShowTourGuide(true);
  }, []);

  const endTour = useCallback(() => {
    setShowTourGuide(false);
  }, []);

  const value = useMemo(() => {
    return {
      startConversationRef,
      spaceMenuButtonRef,
      createAgentButtonRef,
      showTourGuide,
      startTour,
      endTour,
    };
  }, [
    startConversationRef,
    spaceMenuButtonRef,
    createAgentButtonRef,
    showTourGuide,
    startTour,
    endTour,
  ]);

  return (
    <WelcomeTourGuideContext.Provider value={value}>
      {children}
    </WelcomeTourGuideContext.Provider>
  );
}

export function useWelcomeTourGuide() {
  const context = useContext(WelcomeTourGuideContext);
  if (!context) {
    throw new Error(
      "useWelcomeTourGuide must be used within a WelcomeTourGuideProvider"
    );
  }
  return context;
}
