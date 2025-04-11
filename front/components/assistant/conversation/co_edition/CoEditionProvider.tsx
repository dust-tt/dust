import React from "react";

import { CoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { useCoEditionServer } from "@app/components/assistant/conversation/co_edition/useCoEditionMcpServer";
import { isMobile } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types";

interface CoEditionProviderProps {
  children: React.ReactNode;
  hasCoEditionFeatureFlag: boolean;
  owner: LightWorkspaceType;
}

export function CoEditionProvider({
  owner,
  children,
  hasCoEditionFeatureFlag = false,
}: CoEditionProviderProps) {
  const { closeCoEdition, isCoEditionOpen, isConnected, server, serverId } =
    useCoEditionServer({
      owner,
      hasCoEditionFeatureFlag,
    });

  // If feature flag is false or on mobile, return a default context.
  if (!hasCoEditionFeatureFlag || isMobile(navigator)) {
    return (
      <CoEditionContext.Provider
        value={{
          closeCoEdition: () => {},
          isCoEditionOpen: false,
          isConnected: false,
          server: null,
          serverId: null,
        }}
      >
        {children}
      </CoEditionContext.Provider>
    );
  }

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
