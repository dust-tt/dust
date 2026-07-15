import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  isAgentLoopRunContext,
  type ToolContext,
} from "@app/lib/actions/types";
import { SCHEDULES_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/schedules_management/metadata";
import { generateScheduleRule } from "@app/lib/api/assistant/configuration/triggers";
import type { Authenticator } from "@app/lib/auth";
import {
  resolveTriggerSpaceId,
  TriggerResource,
} from "@app/lib/resources/trigger_resource";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ScheduleTriggerType } from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { UniqueConstraintError } from "sequelize";

function renderSchedule(schedule: ScheduleTriggerType): string {
  const config = schedule.configuration;
  const scheduleDesc =
    schedule.naturalLanguageDescription ?? describeScheduleConfig(config);
  const scheduleInfo = `${scheduleDesc} (${config.timezone})`;
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

function getUserTimezone(toolContext?: ToolContext): string | null {
  if (!isAgentLoopRunContext(toolContext?.runContext)) {
    return null;
  }

  const content = toolContext?.runContext?.conversation?.content;
  if (!content) {
    return null;
  }

  const userMessage = content.flat().findLast(isUserMessageType);
  return userMessage?.context.timezone ?? null;
}

export function createSchedulesManagementTools(
  auth: Authenticator,
  toolContext?: ToolContext
) {
  const handlers: ToolHandlers<typeof SCHEDULES_MANAGEMENT_TOOLS_METADATA> = {
    create_schedule: async ({ name, schedule, prompt, timezone }) => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const user = auth.getNonNullableUser();

      const { agentConfiguration, conversation } = toolContext.runContext;

      // When the schedule is created inside a Pod, attach its trigger to that
      // Pod so the scheduled run lands in the Pod (where the pinned view lives).
      const spaceIdRes = await resolveTriggerSpaceId(
        auth,
        conversation.spaceId
      );
      if (spaceIdRes.isErr()) {
        return new Err(new MCPError(spaceIdRes.error));
      }
      const spaceId = spaceIdRes.value;

      const resolvedTimezone = timezone ?? getUserTimezone(toolContext);

      if (!resolvedTimezone) {
        logger.error("resolved timezone missing");
        return new Err(new MCPError("Provide a timezone"));
      }

      const scheduleResult = await generateScheduleRule(auth, {
        naturalDescription: schedule,
        defaultTimezone: resolvedTimezone,
      });

      if (scheduleResult.isErr()) {
        logger.error(
          {
            error: scheduleResult.error,
            workspaceId: owner.id,
            schedule,
          },
          "Error parsing schedule"
        );
        return new Err(
          new MCPError(
            `Unable to understand the schedule "${schedule}". Please try rephrasing (e.g., "every weekday at 9am", "every Monday at 10am", "every other Monday at 9am").`
          )
        );
      }
      const scheduleConfig = scheduleResult.value;
      let result;
      try {
        result = await TriggerResource.makeNew(auth, {
          workspaceId: owner.id,
          agentConfigurationId: agentConfiguration.sId,
          name,
          kind: "schedule",
          status: "enabled",
          configuration: scheduleConfig,
          naturalLanguageDescription: schedule,
          customPrompt: prompt,
          editor: user.id,
          webhookSourceViewId: null,
          executionPerDayLimitOverride: null,
          executionMode: "fair_use",
          origin: "agent",
          spaceId,
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

      const configDesc = describeScheduleConfig(scheduleConfig);

      return new Ok([
        {
          type: "text" as const,
          text:
            `Created schedule "${name}"!\n\n` +
            `Schedule: ${schedule}\n` +
            `Configuration: ${configDesc} (${scheduleConfig.timezone})\n\n` +
            `The agent will execute "${prompt}" according to this schedule.` +
            (spaceId !== null ? " Its runs will land in this Pod." : "") +
            `\n\n` +
            renderSchedule(trigger),
        },
      ]);
    },

    list_schedules: async () => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const userId = auth.getNonNullableUser().id;

      const { agentConfiguration, conversation } = toolContext.runContext;

      // Inside a Pod, list all of the user's schedules scoped to that Pod
      // (across agents). Otherwise, fall back to this agent's schedules.
      const spaceIdRes = await resolveTriggerSpaceId(
        auth,
        conversation.spaceId
      );
      if (spaceIdRes.isErr()) {
        return new Err(new MCPError(spaceIdRes.error));
      }
      const spaceId = spaceIdRes.value;

      const schedulesResult =
        spaceId !== null
          ? await TriggerResource.listBySpaceAndEditors(auth, {
              spaceModelId: spaceId,
              editorIds: [userId],
            })
          : await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
              agentConfigurationId: agentConfiguration.sId,
              editorIds: [userId],
            });

      if (schedulesResult.isErr()) {
        return new Err(
          new MCPError(
            spaceId !== null
              ? "Error while fetching schedules for this Pod"
              : "Error while fetching schedules for this agent"
          )
        );
      }

      getStatsDClient().increment("tools.schedules_management.listed", 1, [
        `workspace_id:${owner.sId}`,
        `agent_id:${agentConfiguration.sId}`,
      ]);

      const scope = spaceId !== null ? "Pod" : "agent";

      if (schedulesResult.value.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: `No schedules configured for this ${scope}.`,
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
          text: `Schedules for this ${scope}:\n\n${scheduleList}`,
        },
      ]);
    },

    disable_schedule: async ({ scheduleId }) => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const userId = auth.getNonNullableUser().id;

      const { agentConfiguration, conversation } = toolContext.runContext;

      // Match the scope used by list_schedules so any schedule the user can see
      // in this context can also be disabled.
      const spaceIdRes = await resolveTriggerSpaceId(
        auth,
        conversation.spaceId
      );
      if (spaceIdRes.isErr()) {
        return new Err(new MCPError(spaceIdRes.error));
      }
      const spaceId = spaceIdRes.value;

      const triggersResult =
        spaceId !== null
          ? await TriggerResource.listBySpaceAndEditors(auth, {
              spaceModelId: spaceId,
              editorIds: [userId],
            })
          : await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
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
