import { useMcpServer } from "@extension/shared/hooks/useMcpServer";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

const ClientSideMCPServerContext = createContext<string[] | undefined>(
  undefined
);

export function useClientSideMCPServerIds(): string[] | undefined {
  return useContext(ClientSideMCPServerContext);
}

interface ExtensionClientSideMCPServerProviderProps {
  children: ReactNode;
}

export function ExtensionClientSideMCPServerProvider({
  children,
}: ExtensionClientSideMCPServerProviderProps) {
  const { serverId } = useMcpServer();

  const clientSideMCPServerIds = useMemo(
    () => (serverId ? [serverId] : undefined),
    [serverId]
  );

  return (
    <ClientSideMCPServerContext.Provider value={clientSideMCPServerIds}>
      {children}
    </ClientSideMCPServerContext.Provider>
  );
}
