import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { registerGetAnalyticsViewTool } from "@app/components/workspace/analytics/tools/getAnalyticsView";
import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useEffect, useState } from "react";

const SERVER_NAME = "analytics-panel-client";

/**
 * Registers the client-side MCP server backing the Analytics conversation panel, exposing the
 * page's live view to `@analyst`. Returns the server id to send along the panel's messages, or
 * `undefined` while it is not registered.
 */
export function useAnalyticsMCPServer({
  enabled,
  getView,
  workspaceId,
}: {
  enabled: boolean;
  getView: () => AnalyticsViewInput;
  workspaceId: string;
}): string | undefined {
  const [serverId, setServerId] = useState<string | undefined>(undefined);

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
        registerGetAnalyticsViewTool(server, getView);

        transport = new BrowserMCPTransport(
          workspaceId,
          SERVER_NAME,
          (newServerId) => {
            if (!cancelled) {
              setServerId(newServerId);
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
      }
    };

    void initializeMCPServer();

    return () => {
      cancelled = true;
      closeServer();
      setServerId(undefined);
    };
  }, [enabled, getView, workspaceId]);

  return serverId;
}
