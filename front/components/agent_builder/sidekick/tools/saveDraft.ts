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
  getTargetAgentConfigurationId: () => string | null;
}

/**
 * Registers the save_as_draft tool on the client-side MCP server.
 * This tool saves the current agent builder form state as a draft agent,
 * PATCHing the target agent so the run_agent action (configured with that
 * agent's sId) can run the latest form state.
 */
export function registerSaveDraftTool(
  mcpServer: McpServer,
  callbacks: SaveDraftCallbacks
): void {
  const {
    getFormValues,
    getOwner,
    getUser,
    getFetcherWithBody,
    getTargetAgentConfigurationId,
  } = callbacks;

  mcpServer.tool(
    "save_as_draft",
    `Save the current agent configuration as a draft so it can be tested via the test_target_agent tool.
This must be called before testing to ensure the latest form state is saved.`,
    {},
    async () => {
      const formData = getFormValues();
      const owner = getOwner();
      const user = getUser();
      const fetcherWithBody = getFetcherWithBody();
      const agentConfigurationId = getTargetAgentConfigurationId();

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
        agentConfigurationId,
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
