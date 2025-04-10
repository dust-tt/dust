import React from "react";

import { CoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { useCoEditionServer } from "@app/components/assistant/conversation/co_edition/useCoEditionMcpServer";
import type { LightWorkspaceType } from "@app/types";

interface CoEditionProviderProps {
  owner: LightWorkspaceType;
  children: React.ReactNode;
  onServerIdChange?: (serverId: string | null) => void;
}

export function CoEditionProvider({
  owner,
  children,
  onServerIdChange,
}: CoEditionProviderProps) {
  const { server, state, isConnected, serverId } = useCoEditionServer({
    owner,
  });

  React.useEffect(() => {
    onServerIdChange?.(serverId);
  }, [serverId, onServerIdChange]);

  return (
    <CoEditionContext.Provider value={{ server, serverId, state, isConnected }}>
      {children}
    </CoEditionContext.Provider>
  );
}
