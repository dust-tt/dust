import { createContext } from "react";
import React from "react";

import type { CoEditionServer } from "@app/components/assistant/conversation/co_edition/server";

interface CoEditionContextType {
  closeCoEdition: () => void;
  isCoEditionOpen: boolean;
  isConnected: boolean;
  server: CoEditionServer | null;
  serverId: string | null;
}

export const CoEditionContext = createContext<CoEditionContextType>({
  closeCoEdition: () => {},
  isCoEditionOpen: false,
  isConnected: false,
  server: null,
  serverId: null,
});

export const useCoEditionContext = () => {
  const context = React.useContext(CoEditionContext);
  if (!context) {
    throw new Error(
      "useCoEditionContext must be used within CoEditionProvider"
    );
  }

  return context;
};
