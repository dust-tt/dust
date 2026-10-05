import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import {
  ANALYTICS_PANEL_SERVER_NAME,
  registerGetAnalyticsViewTool,
} from "@app/components/workspace/analytics/tools/getAnalyticsView";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface AnalyticsMCPServerHandle {
  serverId: string | undefined;
  status: "idle" | "registering" | "registered" | "failed";
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
  const { hasFeature } = useFeatureFlags();
  const forcePolling = hasFeature("agent_stream_long_polling");
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [status, setStatus] =
    useState<AnalyticsMCPServerHandle["status"]>("idle");
  // Read through a ref so a filter change does not re-register the server.
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setStatus("registering");
    let cancelled = false;
    // Held as locals rather than refs: cleanup runs while `connect` is still awaiting, when refs
    // assigned after the await are still empty, leaving the registration and its heartbeat alive.
    let server: McpServer | null = null;
    let transport: BrowserMCPTransport | null = null;

    const closeServer = () => {
      void Promise.all([server?.close(), transport?.close()]).catch(
        (error: unknown) => {
          logger.error(
            { err: normalizeError(error), workspaceId },
            "Failed to close analytics MCP server."
          );
        }
      );
    };

    const initializeMCPServer = async () => {
      try {
        server = new McpServer({
          name: ANALYTICS_PANEL_SERVER_NAME,
          version: "1.0.0",
        });
        registerGetAnalyticsViewTool(server, () => viewRef.current);

        transport = new BrowserMCPTransport(
          workspaceId,
          ANALYTICS_PANEL_SERVER_NAME,
          (newServerId) => {
            if (!cancelled) {
              setServerId(newServerId);
              setStatus("registered");
            }
          },
          forcePolling ? "immediate" : "fallback"
        );
        transport.onerror = (err) => {
          logger.error({ err }, "[useAnalyticsMCPServer] Transport error");
        };

        await server.connect(transport);

        if (cancelled) {
          closeServer();
        }
      } catch (err) {
        logger.error(
          { err: normalizeError(err) },
          "[useAnalyticsMCPServer] Failed to initialize"
        );
        closeServer();
        if (!cancelled) {
          setStatus("failed");
        }
      }
    };

    void initializeMCPServer();

    return () => {
      cancelled = true;
      closeServer();
      setServerId(undefined);
      setStatus("idle");
    };
  }, [enabled, workspaceId, forcePolling]);

  return { serverId, status };
}
