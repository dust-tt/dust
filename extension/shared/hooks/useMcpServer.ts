import { usePlatform } from "@app/shared/context/PlatformContext";
import { useDustAPI } from "@app/shared/lib/dust_api";
import { normalizeError } from "@app/shared/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * React hook for using MCP servers in components
 * This hook provides access to workspace-scoped MCP servers
 *
 * @returns An object with the MCP server, serverId for message payloads, and connection state
 */
export function useMcpServer() {
  const platform = usePlatform();
  const [isSupported, setIsSupported] = useState(false);
  const [server, setServer] = useState<any>(null);
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const serverRef = useRef<any>(null);

  const dustAPI = useDustAPI();

  // Function to disconnect the server.
  const disconnectServer = useCallback(async () => {
    if (serverRef.current) {
      try {
        // If the server has a disconnect method, call it.
        if (typeof serverRef.current.disconnect === "function") {
          await serverRef.current.disconnect();
        }
        setIsConnected(false);
      } catch (err) {
        console.error("Error disconnecting MCP server:", err);
      }
    }
  }, []);

  // Create and connect to the MCP server.
  useEffect(() => {
    // Check if the platform supports MCP.
    if (!platform.mcp) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    let isMounted = true;

    const setupServer = async () => {
      try {
        if (!platform.mcp) {
          if (isMounted) {
            setIsSupported(false);
            return;
          }

          return;
        }

        const result = await platform.mcp.getOrCreateServer(dustAPI);

        if (!result.server) {
          console.log("MCP server creation returned null");
          if (isMounted) {
            setIsSupported(false);
            return;
          }
        }

        if (isMounted) {
          serverRef.current = result.server;
          setServer(result.server);
          setServerId(result.serverId);
          setIsConnected(true);
          setError(null);
          console.log(
            "MCP server connected successfully with ID:",
            result.serverId
          );
        }
      } catch (err) {
        console.error("Error setting up MCP server:", err);
        if (isMounted) {
          setError(normalizeError(err));
          setIsConnected(false);
        }
      }
    };

    // Start the setup process.
    void setupServer();

    // Cleanup function.
    return () => {
      isMounted = false;
      if (serverRef.current && isConnected) {
        // Disconnect server if connected.
        void disconnectServer();
      }
    };
  }, [platform.mcp, isConnected, disconnectServer]);

  return {
    server,
    serverId,
    isConnected,
    isSupported,
    error,
    disconnect: disconnectServer,
  };
}
