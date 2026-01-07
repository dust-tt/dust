import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SalesloftActionWithDetails } from "@app/lib/actions/mcp_internal_actions/servers/salesloft/salesloft_api_helper";
import { getActionsWithDetails } from "@app/lib/actions/mcp_internal_actions/servers/salesloft/salesloft_api_helper";
import {
  getToolSecret,
  makeInternalMCPServer,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

async function getBearerToken(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<string | null> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (!toolConfig || !isLightServerSideMCPToolConfiguration(toolConfig)) {
    return null;
  }

  return getToolSecret(auth, toolConfig);
}

function formatActionAsString(action: SalesloftActionWithDetails): string {
  const parts: string[] = [];

  parts.push(`Action #${action.action.id}`);
  parts.push(`Type: ${action.action.type}`);
  parts.push(`Status: ${action.action.status}`);
  parts.push(`Due: ${action.action.due ? "Yes" : "No"}`);
  if (action.action.due_on) {
    parts.push(`Due On: ${new Date(action.action.due_on).toLocaleString()}`);
  }

  if (action.person) {
    const personName = [action.person.first_name, action.person.last_name]
      .filter(Boolean)
      .join(" ");
    parts.push(`\nPerson: ${personName || "Unknown"}`);

    const personFields = [
      { label: "Email", value: action.person.email_address },
      { label: "Phone", value: action.person.phone },
      { label: "Title", value: action.person.title },
      { label: "Company", value: action.person.person_company_name },
      { label: "Company Website", value: action.person.person_company_website },
      {
        label: "Location",
        value:
          [action.person.city, action.person.state, action.person.country]
            .filter(Boolean)
            .join(", ") || null,
      },
      { label: "LinkedIn", value: action.person.linkedin_url },
      { label: "Twitter", value: action.person.twitter_handle },
      { label: "Job Seniority", value: action.person.job_seniority },
      { label: "Job Function", value: action.person.job_function },
      {
        label: "Do Not Contact",
        value:
          action.person.do_not_contact !== null
            ? action.person.do_not_contact
              ? "Yes"
              : "No"
            : null,
      },
      {
        label: "Untouched",
        value:
          action.person.untouched !== null
            ? action.person.untouched
              ? "Yes"
              : "No"
            : null,
      },
      {
        label: "Hot Lead",
        value:
          action.person.hot_lead !== null
            ? action.person.hot_lead
              ? "Yes"
              : "No"
            : null,
      },
    ];

    personFields.forEach(({ label, value }) => {
      if (value) {
        parts.push(`  ${label}: ${value}`);
      }
    });
  }

  if (action.cadence) {
    parts.push(`\nCadence: ${action.cadence.name}`);
    if (action.cadence.team_cadence) {
      parts.push(`  (Team Cadence)`);
    }
  }

  if (action.step) {
    parts.push(
      `\nStep: ${action.step.name} (Step #${action.step.step_number}, Type: ${action.step.type})`
    );
  }

  if (action.action_details) {
    parts.push(`\nAction Details: Available`);
  }

  return parts.join("\n");
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("salesloft");

  server.tool(
    "get_actions",
    "Get actions owned by the current user with complete related information for full context. " +
      "By default, returns only currently due or overdue actions, but can be configured to return all actions. " +
      "Follows Salesloft best practices: " +
      "1. Gets steps (with has_due_actions filter when configured) " +
      "2. Gets cadences associated with those steps (complete cadence information) " +
      "3. Gets actions for those steps using step_id filter (more efficient than querying all actions) " +
      "4. Gets person/contact information for each action (complete contact details) " +
      "This provides comprehensive context needed to understand and execute each action.",
    {
      include_due_actions_only: z
        .boolean()
        .describe(
          "Whether to only include actions that are currently due or overdue. Defaults to true."
        )
        .default(true),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "salesloft_get_actions",
        agentLoopContext,
      },
      async ({ include_due_actions_only }) => {
        const bearerToken = await getBearerToken(auth, agentLoopContext);
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
      }
    )
  );

  return server;
}

export default createServer;
