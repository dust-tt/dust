import type { LightWorkspaceType } from "@dust-tt/client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CoEditionState } from "@app/components/assistant/conversation/co_edition/server";
import { CoEditionServer } from "@app/components/assistant/conversation/co_edition/server";
import { CoEditionTransport } from "@app/components/assistant/conversation/co_edition/transport";

interface UseCoEditionServerProps {
  owner: LightWorkspaceType;
}

export function useCoEditionServer({ owner }: UseCoEditionServerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<CoEditionState>({ isEnabled: false });
  const [error, setError] = useState<Error | null>(null);
  const [serverId, setServerId] = useState<string | null>(null);
  const serverRef = useRef<CoEditionServer | null>(null);

  const disconnect = useCallback(async () => {
    if (serverRef.current) {
      await serverRef.current.disconnect();
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      try {
        // Create server.
        const server = new CoEditionServer(owner);

        // Listen for state changes.
        server.onStateUpdate((newState) => {
          if (isMounted) {
            setState(newState);
          }
        });

        // Create and connect transport.
        const transport = new CoEditionTransport(owner);
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
  }, [disconnect, owner]);

  return {
    server: serverRef.current,
    serverId,
    isConnected,
    state,
    error,
    disconnect,
  };
}
