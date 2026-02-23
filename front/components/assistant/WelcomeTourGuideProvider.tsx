import { createContext, useContext, useMemo, useRef } from "react";

type WelcomeTourGuideContextType = {
  startConversationRef: React.RefObject<HTMLDivElement>;
  spaceMenuButtonRef: React.RefObject<HTMLDivElement>;
  createAgentButtonRef: React.RefObject<HTMLDivElement>;
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const value = useMemo(() => {
    return {
      startConversationRef,
      spaceMenuButtonRef,
      createAgentButtonRef,
    };
  }, [startConversationRef, spaceMenuButtonRef, createAgentButtonRef]);

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
