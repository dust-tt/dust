import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { registerGetAgentConfigTool } from "@app/components/agent_builder/copilot/tools/getAgentConfig";
import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";

// Server name used for MCP registration. This is a client-side MCP server
// exclusively used by the Agent Builder Copilot to access live form state.
const SERVER_NAME = "agent-builder-copilot-client";

export interface UseCopilotMCPServerResult {
  serverId: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
}

interface UseCopilotMCPServerOptions {
  enabled: boolean;
}

/**
 * React hook that manages a client-side MCP server for the Agent Builder Copilot.
 * Exposes tools that allow the copilot to access the live (unsaved) agent builder form state.
 */
export function useCopilotMCPServer({
  enabled,
}: UseCopilotMCPServerOptions): UseCopilotMCPServerResult {
  const { owner } = useAgentBuilderContext();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const suggestionsContext = useCopilotSuggestions();

  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use refs to store the MCP server and transport instances
  // to ensure cleanup happens correctly and to avoid re-creating on every render.
  const mcpServerRef = useRef<McpServer | null>(null);
  const transportRef = useRef<BrowserMCPTransport | null>(null);

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

    const initializeMCPServer = async () => {
      if (mcpServerRef.current) {
        // Already initialized.
        return;
      }

      setIsConnecting(true);
      setError(null);

      try {
        // Create the MCP server.
        const mcpServer = new McpServer({
          name: SERVER_NAME,
          version: "1.0.0",
        });

        // Register tools.
        registerGetAgentConfigTool(mcpServer, {
          getFormValues,
          getPendingSuggestions: suggestionsContextRef.current
            ? () => suggestionsContextRef.current!.getPendingSuggestions()
            : undefined,
          getCommittedInstructionsHtml: suggestionsContextRef.current
            ? () =>
                suggestionsContextRef.current!.getCommittedInstructionsHtml()
            : undefined,
        });

        // Create the browser transport.
        const transport = new BrowserMCPTransport(
          owner.sId,
          SERVER_NAME,
          (newServerId) => {
            if (isMounted) {
              setServerId(newServerId);
            }
          }
        );

        // Set up transport error handling.
        transport.onerror = (err) => {
          console.error("[useCopilotMCPServer] Transport error:", err);
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
          mcpServerRef.current = mcpServer;
          transportRef.current = transport;
          setIsConnected(true);
          setIsConnecting(false);
        }
      } catch (err) {
        console.error("[useCopilotMCPServer] Failed to initialize:", err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsConnecting(false);
        }
      }
    };

    void initializeMCPServer();

    // Cleanup on unmount.
    return () => {
      isMounted = false;

      // Close the MCP server and transport.
      if (mcpServerRef.current) {
        void mcpServerRef.current.close();
        mcpServerRef.current = null;
      }

      if (transportRef.current) {
        void transportRef.current.close();
        transportRef.current = null;
      }

      setServerId(undefined);
      setIsConnected(false);
    };
  }, [enabled, owner.sId, getFormValues]);

  return {
    serverId,
    isConnected,
    isConnecting,
    error,
  };
}
