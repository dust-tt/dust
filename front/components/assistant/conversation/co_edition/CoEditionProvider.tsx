import React from "react";

import { CoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { useCoEditionServer } from "@app/components/assistant/conversation/co_edition/useCoEditionMcpServer";
import type { LightWorkspaceType } from "@app/types";

interface CoEditionProviderProps {
  owner: LightWorkspaceType;
  children: React.ReactNode;
}

export function CoEditionProvider({ owner, children }: CoEditionProviderProps) {
  const { closeCoEdition, isCoEditionOpen, isConnected, server, serverId } =
    useCoEditionServer({
      owner,
    });

  return (
    <CoEditionContext.Provider
      value={{
        closeCoEdition,
        isCoEditionOpen,
        isConnected,
        server,
        serverId,
      }}
    >
      {children}
    </CoEditionContext.Provider>
  );
}
