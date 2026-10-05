import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { useSidekickSuggestions } from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import { registerGetAgentConfigTool } from "@app/components/agent_builder/sidekick/tools/getAgentConfig";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import datadogLogger from "@app/logger/datadogLogger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

// Server name used for MCP registration. This is a client-side MCP server
// exclusively used by the Agent Builder Sidekick to access live form state.
const SERVER_NAME = "agent-builder-sidekick-client";

interface UseSidekickMCPServerResult {
  serverId: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
}

interface UseSidekickMCPServerOptions {
  enabled: boolean;
}

/**
 * React hook that manages a client-side MCP server for the Agent Builder Sidekick.
 * Exposes tools that allow the sidekick to access the live (unsaved) agent builder form state.
 */
export function useSidekickMCPServer({
  enabled,
}: UseSidekickMCPServerOptions): UseSidekickMCPServerResult {
  const { owner } = useAgentBuilderContext();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const suggestionsContext = useSidekickSuggestions();

  const { hasFeature } = useFeatureFlags();
  const forcePolling = hasFeature("agent_stream_long_polling");
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store context in a ref for use in callbacks.
  const suggestionsContextRef = useRef(suggestionsContext);

  // Update ref in effect to avoid updating during render.
  useEffect(() => {
    suggestionsContextRef.current = suggestionsContext;
  }, [suggestionsContext]);

  // Create a stable callback for getting the current form values.
  // This is used by the MCP tool handler.
  const getFormValues = useCallback(() => getValues(), [getValues]);

  useEffect(() => {
    // Don't initialize if the feature is disabled.
    if (!enabled) {
      return;
    }

    let isMounted = true;
    let mcpServer: McpServer | null = null;
    let transport: BrowserMCPTransport | null = null;

    const closeServer = () => {
      void Promise.all([mcpServer?.close(), transport?.close()]).catch(
        (error: unknown) => {
          datadogLogger.error(
            { err: normalizeError(error), workspaceId: owner.sId },
            "Failed to close sidekick MCP server."
          );
        }
      );
    };

    const initializeMCPServer = async () => {
      setIsConnecting(true);
      setError(null);

      try {
        // Create the MCP server.
        mcpServer = new McpServer({
          name: SERVER_NAME,
          version: "1.0.0",
        });

        // Register tools.
        registerGetAgentConfigTool(mcpServer, {
          getFormValues,
          getPendingSuggestions: suggestionsContextRef.current
            ? () => suggestionsContextRef.current!.pendingSuggestions
            : undefined,
          getCommittedInstructionsHtml: suggestionsContextRef.current
            ? () =>
                suggestionsContextRef.current!.getCommittedInstructionsHtml()
            : undefined,
        });

        // Create the browser transport.
        transport = new BrowserMCPTransport(
          owner.sId,
          SERVER_NAME,
          (newServerId) => {
            if (isMounted) {
              setServerId(newServerId);
            }
          },
          forcePolling ? "immediate" : "fallback"
        );

        // Set up transport error handling.
        transport.onerror = (err) => {
          datadogLogger.error(
            { err: normalizeError(err) },
            "[useSidekickMCPServer] Transport error:"
          );
          if (isMounted) {
            setError(err);
          }
        };

        transport.onclose = () => {
          if (isMounted) {
            setIsConnected(false);
          }
        };

        // Connect the MCP server to the transport.
        await mcpServer.connect(transport);

        if (isMounted) {
          setIsConnected(true);
          setIsConnecting(false);
        }
      } catch (err) {
        datadogLogger.error(
          { err: normalizeError(err) },
          "[useSidekickMCPServer] Failed to initialize:"
        );
        closeServer();
        if (isMounted) {
          setError(normalizeError(err));
          setIsConnecting(false);
        }
      }
    };

    void initializeMCPServer();

    // Cleanup on unmount.
    return () => {
      isMounted = false;

      closeServer();

      setServerId(undefined);
      setIsConnected(false);
    };
  }, [enabled, owner.sId, getFormValues, forcePolling]);

  return {
    serverId,
    isConnected,
    isConnecting,
    error,
  };
}
