import { createContext } from "react";
import React from "react";

import type {
  CoEditionServer,
  CoEditionState,
} from "@app/components/assistant/conversation/co_edition/server";

interface CoEditionContextType {
  isConnected: boolean;
  server: CoEditionServer | null;
  serverId: string | null;
  state: CoEditionState;
}

export const CoEditionContext = createContext<CoEditionContextType>({
  isConnected: false,
  server: null,
  serverId: null,
  state: { isEnabled: false },
});

export const useCoEditionContext = () => {
  const context = React.useContext(CoEditionContext);
  if (!context) {
    throw new Error("useCoEdition must be used within CoEditionProvider");
  }

  return context;
};
