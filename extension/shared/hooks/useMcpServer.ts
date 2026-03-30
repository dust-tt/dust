import logger from "@app/logger/logger";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { normalizeError } from "@extension/shared/lib/utils";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { useCallback, useEffect, useState } from "react";

/**
 * React hook for using MCP servers in components.
 * This hook provides access to workspace-scoped MCP servers and
 * re-registers when the workspace changes.
 */
export function useMcpServer() {
  const platform = usePlatform();
  const [isSupported, setIsSupported] = useState(false);
  const [server, setServer] = useState<any>(null);
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { workspace } = useExtensionAuth();
  const workspaceId = workspace?.sId;

  const disconnectServer = useCallback(async () => {
    if (platform.mcp) {
      try {
        await platform.mcp.disconnect();
        setIsConnected(false);
      } catch (err) {
        logger.error({ err }, "Error disconnecting MCP server.");
      }
    }
  }, [platform.mcp]);

  useEffect(() => {
    if (!platform.mcp) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    if (!workspaceId) {
      return;
    }

    let isMounted = true;

    const setupServer = async () => {
      try {
        if (!platform.mcp) {
          if (isMounted) {
            setIsSupported(false);
          }
          return;
        }

        if (!workspace) {
          return;
        }

        const result = await platform.mcp.getOrCreateServer(
          workspace,
          (sid) => {
            if (isMounted) {
              setServerId(sid);
            }
          }
        );

        if (!isMounted) {
          return;
        }

        if (!result.server) {
          setIsSupported(false);
          return;
        }

        setServer(result.server);
        setServerId(result.serverId);
        setIsConnected(true);
        setError(null);
      } catch (err) {
        logger.error({ err }, "Error setting up MCP server.");
        if (isMounted) {
          setError(normalizeError(err));
          setIsConnected(false);
        }
      }
    };

    // Defer so that React StrictMode's synchronous mount→cleanup→mount cycle
    // cancels the first timer before it runs, preventing duplicate registrations.
    const timer = setTimeout(() => {
      void setupServer();
    }, 0);

    return () => {
      clearTimeout(timer);
      isMounted = false;
      if (platform.mcp) {
        void platform.mcp.disconnect();
      }
      setServer(null);
      setServerId(undefined);
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace object excluded; workspaceId triggers re-runs.
  }, [platform.mcp, workspaceId]);

  return {
    server,
    serverId,
    isConnected,
    isSupported,
    error,
    disconnect: disconnectServer,
  };
}
