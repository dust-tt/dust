import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SCHEDULES_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/schedules_management/metadata";
import { generateCronRule } from "@app/lib/api/assistant/configuration/triggers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ScheduleTriggerType } from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";
import { Err, Ok } from "@app/types/shared/result";
import { UniqueConstraintError } from "sequelize";

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
  lines.push(`  Status: ${schedule.status}`);
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

export function createSchedulesManagementTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const handlers: ToolHandlers<typeof SCHEDULES_MANAGEMENT_TOOLS_METADATA> = {
    create_schedule: async ({ name, schedule, prompt, timezone }) => {
      const owner = auth.getNonNullableWorkspace();
      const user = auth.getNonNullableUser();

      if (!agentLoopContext?.runContext) {
        logger.error("Agent context missing");
        return new Err(new MCPError("Agent context is required"));
      }

      const { agentConfiguration } = agentLoopContext.runContext;

      const resolvedTimezone = timezone ?? getUserTimezone(agentLoopContext);

      if (!resolvedTimezone) {
        logger.error("resolved timezone missing");
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
      let result;
      try {
        result = await TriggerResource.makeNew(auth, {
          workspaceId: owner.id,
          agentConfigurationId: agentConfiguration.sId,
          name,
          kind: "schedule",
          status: "enabled",
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
          origin: "agent",
        });

        if (result.isErr()) {
          logger.error(result.error.message);
          return new Err(
            new MCPError(`Failed to enable schedule: ${result.error.message}`)
          );
        }
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          return new Err(new MCPError("Schedule uniqueness constraint error"));
        }
        throw err;
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
    },

    list_schedules: async () => {
      const owner = auth.getNonNullableWorkspace();
      const userId = auth.getNonNullableUser().id;

      if (!agentLoopContext?.runContext) {
        return new Err(new MCPError("Agent context is required"));
      }

      const { agentConfiguration } = agentLoopContext.runContext;

      const schedulesResult =
        await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
          agentConfigurationId: agentConfiguration.sId,
          editorIds: [userId],
        });

      if (schedulesResult.isErr()) {
        return new Err(
          new MCPError("Error while fetching schedules for this agent")
        );
      }

      getStatsDClient().increment("tools.schedules_management.listed", 1, [
        `workspace_id:${owner.sId}`,
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
    },

    disable_schedule: async ({ scheduleId }) => {
      const owner = auth.getNonNullableWorkspace();
      const userId = auth.getNonNullableUser().id;

      if (!agentLoopContext?.runContext) {
        return new Err(new MCPError("Agent context is required"));
      }

      const { agentConfiguration } = agentLoopContext.runContext;

      const triggersResult =
        await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
          agentConfigurationId: agentConfiguration.sId,
          editorIds: [userId],
        });
      if (triggersResult.isErr()) {
        return new Err(new MCPError("Error fetching schedules"));
      }
      const schedule = triggersResult.value.find(
        (t) => t.kind === "schedule" && t.sId === scheduleId
      );
      if (!schedule) {
        return new Err(new MCPError("Schedule not found"));
      }

      const scheduleName = schedule.name;
      const result = await schedule.disable(auth);

      if (result.isErr()) {
        return new Err(
          new MCPError(`Failed to disable schedule: ${result.error.message}`)
        );
      }

      getStatsDClient().increment("tools.schedules_management.disabled", 1, [
        `workspace_id:${owner.sId}`,
        `agent_id:${agentConfiguration.sId}`,
      ]);

      return new Ok([
        {
          type: "text" as const,
          text: `Disabled schedule "${scheduleName}".`,
        },
      ]);
    },
  };

  return buildTools(SCHEDULES_MANAGEMENT_TOOLS_METADATA, handlers);
}
