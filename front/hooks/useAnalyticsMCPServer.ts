import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { registerGetAnalyticsViewTool } from "@app/components/workspace/analytics/tools/getAnalyticsView";
import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const SERVER_NAME = "analytics-panel-client";

export interface AnalyticsMCPServerHandle {
  serverId: string | undefined;
  isRegistering: boolean;
}

/**
 * Registers the client-side MCP server backing the Analytics conversation panel, exposing the
 * page's live view to `@analyst`. Returns the server id to send along the panel's messages, or
 * `undefined` while it is not registered.
 */
export function useAnalyticsMCPServer({
  enabled,
  view,
  workspaceId,
}: {
  enabled: boolean;
  view: AnalyticsViewInput;
  workspaceId: string;
}): AnalyticsMCPServerHandle {
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [isRegistering, setIsRegistering] = useState(true);
  // Read through a ref so a filter change does not re-register the server.
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    // Held as locals rather than refs: cleanup runs while `connect` is still awaiting, when refs
    // assigned after the await are still empty, leaving the registration and its heartbeat alive.
    let server: McpServer | null = null;
    let transport: BrowserMCPTransport | null = null;

    const closeServer = () => {
      if (server) {
        void server.close();
        server = null;
      }
      if (transport) {
        void transport.close();
        transport = null;
      }
    };

    const initializeMCPServer = async () => {
      try {
        server = new McpServer({ name: SERVER_NAME, version: "1.0.0" });
        registerGetAnalyticsViewTool(server, () => viewRef.current);

        transport = new BrowserMCPTransport(
          workspaceId,
          SERVER_NAME,
          (newServerId) => {
            if (!cancelled) {
              setServerId(newServerId);
              setIsRegistering(false);
            }
          }
        );
        transport.onerror = (err) => {
          console.error("[useAnalyticsMCPServer] Transport error:", err);
        };

        await server.connect(transport);

        if (cancelled) {
          closeServer();
        }
      } catch (err) {
        console.error("[useAnalyticsMCPServer] Failed to initialize:", err);
        closeServer();
        setIsRegistering(false);
      }
    };

    void initializeMCPServer();

    return () => {
      cancelled = true;
      closeServer();
      setServerId(undefined);
    };
  }, [enabled, workspaceId]);

  return { serverId, isRegistering };
}
