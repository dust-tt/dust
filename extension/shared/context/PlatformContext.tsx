import type { PlatformService } from "@app/shared/services/platform";
import type { ReactNode } from "react";
import React, { createContext, useContext } from "react";

// Create the context with a null initial value.
export const PlatformContext = createContext<PlatformService | null>(null);

// A hook for consuming the platform service in components.
export function usePlatform(): PlatformService {
  const context = useContext(PlatformContext);

  if (!context) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }

  return context;
}

// A provider component for wrapping the app.
export const PlatformProvider: React.FC<{
  children: ReactNode;
  platformService: PlatformService;
}> = ({ children, platformService }) => {
  return (
    <PlatformContext.Provider value={platformService}>
      {children}
    </PlatformContext.Provider>
  );
};
