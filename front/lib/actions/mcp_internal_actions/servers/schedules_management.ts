import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { generateCronRule } from "@app/lib/api/assistant/configuration/triggers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ScheduleTriggerType } from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";

function renderSchedule(schedule: ScheduleTriggerType): string {
  const config = schedule.configuration;
  const scheduleInfo = `${schedule.naturalLanguageDescription ?? config.cron} (${config.timezone})`;
  const lines = [
    `- **${schedule.name}** (ID: ${schedule.sId})`,
    `  Schedule: ${scheduleInfo}`,
  ];
  if (schedule.customPrompt) {
    lines.push(`  Prompt: ${schedule.customPrompt}`);
  }
  lines.push(`  Enabled: ${schedule.enabled ? "Yes" : "No"}`);
  return lines.join("\n");
}

function getUserTimezone(
  agentLoopContext?: AgentLoopContextType
): string | null {
  const content = agentLoopContext?.runContext?.conversation?.content;
  if (!content) {
    return null;
  }

  const userMessage = content.flat().findLast(isUserMessageType);
  return userMessage?.context.timezone ?? null;
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("schedules_management");

  server.tool(
    "create_schedule",
    "Create a schedule that runs this agent at specified times.",
    {
      name: z
        .string()
        .max(255)
        .describe(
          "A short, descriptive name for the schedule (max 255 chars). Examples: 'Daily email summary', 'Weekly PR review', 'Morning standup prep'"
        ),
      schedule: z
        .string()
        .describe(
          "When to run, in natural language. Examples: 'every weekday at 9am', 'every Monday morning', 'daily at 8am', 'first day of each month at noon', 'every Friday at 5pm'"
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          "What the agent should do when the schedule runs. Examples: 'Summarize my emails from yesterday', 'Show PRs that need my review', 'Generate a weekly status report'"
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone for the schedule. Examples: 'Europe/Paris', 'America/New_York', 'Asia/Tokyo'. If not provided, uses user's timezone from context."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "schedules_management_create",
        agentLoopContext,
      },
      async ({ name, schedule, prompt, timezone }) => {
        const owner = auth.getNonNullableWorkspace();
        const user = auth.getNonNullableUser();

        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("Agent context is required"));
        }

        const { agentConfiguration } = agentLoopContext.runContext;

        // Determine timezone: explicit param > context > default
        const resolvedTimezone = timezone ?? getUserTimezone(agentLoopContext);

        if (!resolvedTimezone) {
          return new Err(new MCPError("Provide a timezone"));
        }

        const cronResult = await generateCronRule(auth, {
          naturalDescription: schedule,
          defaultTimezone: resolvedTimezone,
        });

        if (cronResult.isErr()) {
          logger.error(
            {
              error: cronResult.error,
              workspaceId: owner.id,
              schedule,
            },
            "Error parsing schedule"
          );
          return new Err(
            new MCPError(
              `Unable to understand the schedule "${schedule}". Please try rephrasing (e.g., "every weekday at 9am", "every Monday at 10am").`
            )
          );
        }

        const { cron, timezone: resultTimezone } = cronResult.value;

        const result = await TriggerResource.makeNew(auth, {
          workspaceId: owner.id,
          agentConfigurationId: agentConfiguration.sId,
          name,
          kind: "schedule",
          enabled: true,
          configuration: {
            cron,
            timezone: resultTimezone,
          },
          naturalLanguageDescription: schedule,
          customPrompt: prompt,
          editor: user.id,
          webhookSourceViewId: null,
          executionPerDayLimitOverride: null,
          executionMode: "fair_use",
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to create schedule: ${result.error.message}`)
          );
        }

        getStatsDClient().increment("tools.schedules_management.created", 1, [
          `workspace_id:${owner.sId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        const trigger = result.value.toJSON();
        if (!isScheduleTrigger(trigger)) {
          return new Err(new MCPError("Unexpected trigger type"));
        }

        return new Ok([
          {
            type: "text" as const,
            text:
              `Created schedule "${name}"!\n\n` +
              `Schedule: ${schedule}\n` +
              `Cron: ${cron} (${resultTimezone})\n\n` +
              `The agent will execute "${prompt}" according to this schedule.\n\n` +
              renderSchedule(trigger),
          },
        ]);
      }
    )
  );

  server.tool(
    "list_schedules",
    "List all schedules created for this agent.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "schedules_management_list",
        agentLoopContext,
      },
      async () => {
        const userId = auth.getNonNullableUser().id;
        const workspaceId = auth.getNonNullableWorkspace().id;
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("Agent context is required"));
        }
        const { agentConfiguration } = agentLoopContext.runContext;

        const schedulesResult =
          await TriggerResource.listSchedulesByAgentAndEditor(auth, {
            agentConfigurationId: agentConfiguration.sId,
            editorIds: [userId],
          });

        if (schedulesResult.isErr()) {
          return new Err(
            new MCPError("Error while fetching schedules for this agent")
          );
        }

        getStatsDClient().increment("tools.schedules_management.listed", 1, [
          `workspace_id:${workspaceId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        if (schedulesResult.value.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No schedules configured for this agent.",
            },
          ]);
        }

        const scheduleList = schedulesResult.value
          .map((s) => s.toJSON())
          .filter(isScheduleTrigger)
          .map((schedule) => renderSchedule(schedule))
          .join("\n\n");

        return new Ok([
          {
            type: "text" as const,
            text: `Schedules for this agent:\n\n${scheduleList}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "disable_schedule",
    "Disable a schedule.",
    {
      scheduleId: z
        .string()
        .describe("The schedule ID (get this from list_schedules)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "schedules_management_disable",
        agentLoopContext,
      },
      async ({ scheduleId }) => {
        const userId = auth.getNonNullableUser().id;
        const workspaceId = auth.getNonNullableWorkspace().id;
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("Agent context is required"));
        }
        const { agentConfiguration } = agentLoopContext.runContext;

        const scheduleResult = await TriggerResource.fetchScheduleByIdForEditor(
          auth,
          scheduleId,
          {
            agentConfigurationId: agentConfiguration.sId,
            editorId: userId,
          }
        );
        if (scheduleResult.isErr()) {
          return new Err(new MCPError(scheduleResult.error.message));
        }
        const schedule = scheduleResult.value;

        const scheduleName = schedule.name;
        const result = await schedule.disable(auth);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to disable schedule: ${result.error.message}`)
          );
        }

        getStatsDClient().increment("tools.schedules_management.disabled", 1, [
          `workspace_id:${workspaceId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        return new Ok([
          {
            type: "text" as const,
            text: `Disabled schedule "${scheduleName}".`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
