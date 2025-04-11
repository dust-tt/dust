import React from "react";

import { CoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { useCoEditionServer } from "@app/components/assistant/conversation/co_edition/useCoEditionMcpServer";
import type { LightWorkspaceType } from "@app/types";

interface CoEditionProviderProps {
  owner: LightWorkspaceType;
  children: React.ReactNode;
}

export function CoEditionProvider({ owner, children }: CoEditionProviderProps) {
  const { server, state, isConnected, serverId } = useCoEditionServer({
    owner,
  });

  return (
    <CoEditionContext.Provider value={{ server, serverId, state, isConnected }}>
      {children}
    </CoEditionContext.Provider>
  );
}
