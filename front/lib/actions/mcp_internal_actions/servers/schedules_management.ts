import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { generateCronRule } from "@app/lib/api/assistant/configuration/triggers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { isUserMessageType } from "@app/types/assistant/conversation";

function renderSchedule(schedule: TriggerResource): string {
  const config = schedule.configuration;
  const scheduleInfo =
    "cron" in config
      ? `${schedule.naturalLanguageDescription ?? config.cron} (${config.timezone})`
      : "";
  const lines = [
    `- **${schedule.name}** (ID: ${schedule.sId()})`,
    `  Schedule: ${scheduleInfo}`,
  ];
  if (schedule.customPrompt) {
    lines.push(`  Prompt: ${schedule.customPrompt}`);
  }
  lines.push(`  Enabled: ${schedule.enabled ? "Yes" : "No"}`);
  return lines.join("\n");
}

function getToolContext(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Result<
  {
    userId: number;
    workspaceId: string;
    agentConfiguration: AgentConfigurationType;
  },
  MCPError
> {
  const user = auth.user();
  const workspace = auth.workspace();
  if (!user) {
    return new Err(new MCPError("User not found"));
  }
  if (!workspace) {
    return new Err(new MCPError("Workspace not found"));
  }
  if (!agentLoopContext?.runContext) {
    return new Err(new MCPError("Agent context is required"));
  }
  return new Ok({
    userId: user.id,
    workspaceId: workspace.sId,
    agentConfiguration: agentLoopContext.runContext.agentConfiguration,
  });
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
        const owner = auth.workspace();
        const user = auth.user();

        if (!owner) {
          return new Err(new MCPError("Workspace not found"));
        }

        if (!user) {
          return new Err(new MCPError("User not found"));
        }

        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("Agent context is required"));
        }

        const { agentConfiguration } = agentLoopContext.runContext;

        const remaining = await rateLimiter({
          key: `schedule_create:${owner.sId}:${user.sId}`,
          maxPerTimeframe: 20,
          timeframeSeconds: 86400,
          logger,
        });

        if (remaining === 0) {
          getStatsDClient().increment(
            "tools.schedules_management.rate_limit_hit",
            1,
            [`workspace_id:${owner.sId}`, `agent_id:${agentConfiguration.sId}`]
          );
          return new Err(
            new MCPError(
              "Rate limit exceeded: You can create up to 20 schedules per day."
            )
          );
        }

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

        return new Ok([
          {
            type: "text" as const,
            text:
              `Created schedule "${name}"!\n\n` +
              `Schedule: ${schedule}\n` +
              `Cron: ${cron} (${resultTimezone})\n\n` +
              `The agent will execute "${prompt}" according to this schedule.\n\n` +
              renderSchedule(result.value),
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
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, workspaceId, agentConfiguration } = contextResult.value;

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
    "get_schedule",
    "Get details of a specific schedule by ID. Returns name, timing, prompt, and enabled state.",
    {
      scheduleId: z
        .string()
        .describe("The schedule ID (get this from list_schedules)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "schedules_management_get",
        agentLoopContext,
      },
      async ({ scheduleId }) => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, agentConfiguration } = contextResult.value;

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

        return new Ok([
          {
            type: "text" as const,
            text: renderSchedule(scheduleResult.value),
          },
        ]);
      }
    )
  );

  server.tool(
    "update_schedule",
    "Update an existing schedule. Can change name, schedule, prompt, or enabled state. Setting enabled to false pauses the schedule, true reactivates it.",
    {
      scheduleId: z
        .string()
        .describe("The schedule ID (get this from list_schedules)"),
      name: z
        .string()
        .max(255)
        .optional()
        .describe(
          "New name for the schedule (e.g., 'Daily email summary', 'Weekly PR review')"
        ),
      schedule: z
        .string()
        .optional()
        .describe(
          "New schedule in natural language (e.g., 'every weekday at 9am', 'every Monday morning', 'daily at 8am')"
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          "New prompt - what the agent should do when the schedule runs (e.g., 'Summarize my emails from yesterday')"
        ),
      enabled: z
        .boolean()
        .optional()
        .describe(
          "Set to true to enable the schedule, false to disable/pause it"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "schedules_management_update",
        agentLoopContext,
      },
      async ({ scheduleId, name, schedule, prompt, enabled }) => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, workspaceId, agentConfiguration } = contextResult.value;

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

        let scheduleUpdate:
          | { cron: string; timezone: string; naturalLanguage: string }
          | undefined;

        if (schedule) {
          const resolvedTimezone = getUserTimezone(agentLoopContext);

          if (!resolvedTimezone) {
            return new Err(new MCPError("Provide a timezone"));
          }

          const cronResult = await generateCronRule(auth, {
            naturalDescription: schedule,
            defaultTimezone: resolvedTimezone,
          });

          if (cronResult.isErr()) {
            return new Err(
              new MCPError(
                `Unable to understand the schedule "${schedule}". Please try rephrasing (e.g., "every weekday at 9am", "every Monday at 10am").`
              )
            );
          }

          scheduleUpdate = {
            cron: cronResult.value.cron,
            timezone: cronResult.value.timezone,
            naturalLanguage: schedule,
          };
        }

        const updateResult = await TriggerResource.update(auth, scheduleId, {
          name,
          enabled,
          customPrompt: prompt,
          ...(scheduleUpdate && {
            configuration: {
              cron: scheduleUpdate.cron,
              timezone: scheduleUpdate.timezone,
            },
            naturalLanguageDescription: scheduleUpdate.naturalLanguage,
          }),
        });

        if (updateResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to update schedule: ${updateResult.error.message}`
            )
          );
        }

        getStatsDClient().increment("tools.schedules_management.updated", 1, [
          `workspace_id:${workspaceId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        const changedFields = [
          name !== undefined && "name",
          schedule !== undefined && "schedule",
          prompt !== undefined && "prompt",
          enabled !== undefined && (enabled ? "enabled" : "disabled"),
        ]
          .filter(Boolean)
          .join(", ");

        return new Ok([
          {
            type: "text" as const,
            text: `Updated schedule (changed: ${changedFields}).\n\n${renderSchedule(updateResult.value)}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "delete_schedule",
    "Permanently delete a schedule.",
    {
      scheduleId: z
        .string()
        .describe("The schedule ID (get this from list_schedules)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "schedules_management_delete",
        agentLoopContext,
      },
      async ({ scheduleId }) => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, workspaceId, agentConfiguration } = contextResult.value;

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
        const result = await schedule.delete(auth);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to delete schedule: ${result.error.message}`)
          );
        }

        getStatsDClient().increment("tools.schedules_management.deleted", 1, [
          `workspace_id:${workspaceId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        return new Ok([
          {
            type: "text" as const,
            text: `Deleted schedule "${scheduleName}".`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
