import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import type { UserType, WorkspaceType } from "@app/types/user";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface SaveDraftCallbacks {
  getFormValues: () => AgentBuilderFormData;
  getOwner: () => WorkspaceType;
  getUser: () => UserType;
  getFetcherWithBody: () => FetcherWithBodyFn;
}

/**
 * Registers the save_as_draft tool on the client-side MCP server.
 * This tool saves the current agent builder form state as a draft agent,
 * allowing the server-side test_agent tool to run it.
 */
export function registerSaveDraftTool(
  mcpServer: McpServer,
  callbacks: SaveDraftCallbacks
): void {
  const { getFormValues, getOwner, getUser, getFetcherWithBody } = callbacks;

  mcpServer.tool(
    "save_as_draft",
    `Save the current agent configuration as a draft so it can be tested.
Returns the draft agent's configuration ID (sId) which can be passed to test_agent.
This is required before testing agents that haven't been saved yet.`,
    {},
    async () => {
      const formData = getFormValues();
      const owner = getOwner();
      const user = getUser();
      const fetcherWithBody = getFetcherWithBody();

      const result = await submitAgentBuilderForm({
        user,
        formData: {
          ...formData,
          agentSettings: {
            ...formData.agentSettings,
            name: formData.agentSettings.name || "Sidekick Test",
          },
        },
        owner,
        agentConfigurationId: null,
        isDraft: true,
        fetcherWithBody,
      });

      if (!result.isOk()) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: result.error.message,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              agentConfigurationId: result.value.sId,
              agentName: result.value.name,
            }),
          },
        ],
      };
    }
  );
}
