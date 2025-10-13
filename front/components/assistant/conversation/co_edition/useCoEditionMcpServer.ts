import { useCallback, useEffect, useRef, useState } from "react";

import { CoEditionServer } from "@app/components/assistant/conversation/co_edition/server";
import { CoEditionTransport } from "@app/components/assistant/conversation/co_edition/transport";
import type { LightWorkspaceType } from "@app/types";

interface UseCoEditionServerProps {
  hasCoEditionFeatureFlag?: boolean;
  owner: LightWorkspaceType;
}

export function useCoEditionMcpServer({
  hasCoEditionFeatureFlag = true,
  owner,
}: UseCoEditionServerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isCoEditionOpen, setIsCoEditionOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [serverId, setServerId] = useState<string | null>(null);
  const serverRef = useRef<CoEditionServer | null>(null);

  const disconnect = useCallback(async () => {
    if (serverRef.current) {
      await serverRef.current.disconnect();
      setIsConnected(false);
    }
  }, []);

  const closeCoEdition = useCallback(() => {
    setIsCoEditionOpen(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      // If hasCoEditionFeatureFlag is false, don't initialize the server.
      if (!hasCoEditionFeatureFlag) {
        return;
      }

      try {
        // Create server.
        const server = new CoEditionServer();

        // Listen for state changes.
        server.onStateUpdate((newState) => {
          if (isMounted) {
            setIsCoEditionOpen(newState.isEnabled);
          }
        });

        // Create and connect transport.
        const transport = new CoEditionTransport(owner, (serverId) => {
          if (isMounted) {
            setServerId(serverId);
          }
        });
        await server.connect(transport);

        if (isMounted) {
          serverRef.current = server;
          setIsConnected(true);
          setError(null);
          setServerId(transport.getServerId());
        }
      } catch (err) {
        console.error("Error setting up co-edition server:", err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsConnected(false);
        }
      }
    };

    void setup();

    return () => {
      isMounted = false;
      void disconnect();
    };
  }, [disconnect, hasCoEditionFeatureFlag, owner]);

  return {
    closeCoEdition,
    disconnect,
    error,
    isCoEditionOpen,
    isConnected,
    server: serverRef.current,
    serverId,
  };
}
