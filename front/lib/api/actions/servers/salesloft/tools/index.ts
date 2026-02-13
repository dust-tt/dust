import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  formatActionAsString,
  getActionsWithDetails,
  getBearerToken,
} from "@app/lib/api/actions/servers/salesloft/helpers";
import { SALESLOFT_TOOLS_METADATA } from "@app/lib/api/actions/servers/salesloft/metadata";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

export function createSalesloftTools(
  auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SALESLOFT_TOOLS_METADATA> = {
    get_actions: async ({ include_due_actions_only }, extra) => {
      const bearerToken = getBearerToken(extra);
      if (!bearerToken) {
        return new Err(
          new MCPError(
            "No bearer token found. Please configure a secret for this Salesloft integration"
          )
        );
      }

      const userEmail = auth.user()?.email;
      if (!userEmail) {
        return new Err(
          new MCPError(
            "Unable to determine user email. Please ensure you are authenticated."
          )
        );
      }

      const result = await getActionsWithDetails(bearerToken, {
        includeDueActionsOnly: include_due_actions_only,
        userEmail: userEmail,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message ?? "Operation failed")
        );
      }

      const actionsWithDetails = result.value;

      const actionTypeText = include_due_actions_only ? "due or overdue" : "";

      if (actionsWithDetails.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: include_due_actions_only
              ? "No due or overdue actions found."
              : "No actions found.",
          },
        ]);
      }

      const formattedText = actionsWithDetails
        .map((action, index) => {
          return `--- Action ${index + 1} of ${actionsWithDetails.length} ---\n${formatActionAsString(
            action
          )}`;
        })
        .join("\n\n");

      return new Ok([
        {
          type: "text" as const,
          text: `Found ${actionsWithDetails.length} ${actionTypeText} action(s):\n\n${formattedText}`,
        },
      ]);
    },
  };

  return buildTools(SALESLOFT_TOOLS_METADATA, handlers);
}
