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

function renderTrigger(trigger: TriggerResource): string {
  const config = trigger.configuration;
  const scheduleInfo =
    trigger.kind === "schedule" && "cron" in config
      ? `${trigger.naturalLanguageDescription ?? config.cron} (${config.timezone})`
      : trigger.kind;
  const lines = [
    `- **${trigger.name}** (ID: ${trigger.sId()})`,
    `  Schedule: ${scheduleInfo}`,
  ];
  if (trigger.customPrompt) {
    lines.push(`  Prompt: ${trigger.customPrompt}`);
  }
  lines.push(`  Enabled: ${trigger.enabled ? "Yes" : "No"}`);
  return lines.join("\n");
}

function getToolContext(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Result<
  {
    userId: number;
    workspaceSId: string;
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
    workspaceSId: workspace.sId,
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

async function fetchTriggerWithOwnershipCheck(
  auth: Authenticator,
  triggerId: string,
  agentConfigurationSId: string,
  userId: number
): Promise<Result<TriggerResource, MCPError>> {
  const trigger = await TriggerResource.fetchById(auth, triggerId);
  if (!trigger) {
    return new Err(new MCPError("Trigger not found"));
  }
  if (trigger.agentConfigurationId !== agentConfigurationSId) {
    return new Err(new MCPError("This trigger does not belong to this agent"));
  }
  if (trigger.editor !== userId) {
    return new Err(new MCPError("You can only modify triggers you created"));
  }
  return new Ok(trigger);
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("trigger_management");

  server.tool(
    "create_schedule_trigger",
    "Create a scheduled trigger that runs this agent at specified times. Use when user says 'remind me every day', 'run this weekly', 'automate this task', 'schedule this to run at 9am', 'set up a recurring task'.",
    {
      name: z
        .string()
        .max(255)
        .describe(
          "A short, descriptive name for the trigger (max 255 chars). Examples: 'Daily email summary', 'Weekly PR review', 'Morning standup prep'"
        ),
      schedule: z
        .string()
        .describe(
          "When to run, in natural language. Examples: 'every weekday at 9am', 'every Monday morning', 'daily at 8am', 'first day of each month at noon', 'every Friday at 5pm'"
        ),
      prompt: z
        .string()
        .describe(
          "What you should do when triggered. Examples: 'Summarize my emails from yesterday', 'Show PRs that need my review', 'Generate a weekly status report'"
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
        toolNameForMonitoring: "trigger_management_create_schedule",
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
          key: `trigger_create:${owner.sId}:${user.sId}`,
          maxPerTimeframe: 20,
          timeframeSeconds: 86400,
          logger,
        });

        if (remaining === 0) {
          getStatsDClient().increment(
            "tools.trigger_management.rate_limit_hit",
            1,
            [`workspace_id:${owner.sId}`, `agent_id:${agentConfiguration.sId}`]
          );
          return new Err(
            new MCPError(
              "Rate limit exceeded: You can create up to 20 triggers per day."
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
          executionMode: null,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to create trigger: ${result.error.message}`)
          );
        }

        getStatsDClient().increment("tools.trigger_management.created", 1, [
          `workspace_id:${owner.sId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        return new Ok([
          {
            type: "text" as const,
            text:
              `Created trigger "${name}"!\n\n` +
              `Schedule: ${schedule}\n` +
              `Cron: ${cron} (${resultTimezone})\n\n` +
              `I'll run "${prompt}" according to this schedule.\n\n` +
              renderTrigger(result.value),
          },
        ]);
      }
    )
  );

  server.tool(
    "list_triggers",
    "List all scheduled triggers you have created for this agent. Use when user asks 'what triggers do I have?', 'show my scheduled tasks', 'what's automated?', 'list my triggers'.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "trigger_management_list",
        agentLoopContext,
      },
      async () => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, workspaceSId, agentConfiguration } =
          contextResult.value;

        const triggersResult =
          await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
            agentConfigurationId: agentConfiguration.sId,
            editorIds: [userId],
          });

        if (triggersResult.isErr()) {
          return new Err(
            new MCPError("Error while fetching triggers for this agent")
          );
        }

        getStatsDClient().increment("tools.trigger_management.listed", 1, [
          `workspace_id:${workspaceSId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        if (triggersResult.value.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "You have no triggers configured for this agent.",
            },
          ]);
        }

        const triggerList = triggersResult.value
          .map((trigger) => renderTrigger(trigger))
          .join("\n\n");

        return new Ok([
          {
            type: "text" as const,
            text: `Your triggers for this agent:\n\n${triggerList}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "get_trigger",
    "Get details of a specific trigger by ID. Use this to check the current state of a trigger or verify changes after updates.",
    {
      triggerId: z
        .string()
        .describe("The trigger ID (get this from list_triggers)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "trigger_management_get",
        agentLoopContext,
      },
      async ({ triggerId }) => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, agentConfiguration } = contextResult.value;

        const triggerResult = await fetchTriggerWithOwnershipCheck(
          auth,
          triggerId,
          agentConfiguration.sId,
          userId
        );
        if (triggerResult.isErr()) {
          return triggerResult;
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderTrigger(triggerResult.value),
          },
        ]);
      }
    )
  );

  server.tool(
    "update_trigger",
    "Update an existing trigger. Can change name, schedule, prompt, or enabled state. Use 'enabled: false' to pause a trigger, 'enabled: true' to reactivate it. Use when user says 'change trigger settings', 'pause this trigger', 'turn on this trigger', 'update the schedule'.",
    {
      triggerId: z
        .string()
        .describe("The trigger ID (get this from list_triggers)"),
      name: z
        .string()
        .max(255)
        .optional()
        .describe(
          "New name for the trigger (e.g., 'Daily email summary', 'Weekly PR review')"
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
          "New prompt - what the agent should do when triggered (e.g., 'Summarize my emails from yesterday')"
        ),
      enabled: z
        .boolean()
        .optional()
        .describe(
          "Set to true to enable the trigger, false to disable/pause it"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "trigger_management_update",
        agentLoopContext,
      },
      async ({ triggerId, name, schedule, prompt, enabled }) => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, workspaceSId, agentConfiguration } =
          contextResult.value;

        const triggerResult = await fetchTriggerWithOwnershipCheck(
          auth,
          triggerId,
          agentConfiguration.sId,
          userId
        );
        if (triggerResult.isErr()) {
          return triggerResult;
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

        const updateResult = await TriggerResource.update(auth, triggerId, {
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
              `Failed to update trigger: ${updateResult.error.message}`
            )
          );
        }

        getStatsDClient().increment("tools.trigger_management.updated", 1, [
          `workspace_id:${workspaceSId}`,
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
            text: `Updated trigger (changed: ${changedFields}).\n\n${renderTrigger(updateResult.value)}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "delete_trigger",
    "Permanently delete a trigger. Use when user says 'remove this trigger', 'stop this automation', 'delete the scheduled task'. This action cannot be undone.",
    {
      triggerId: z
        .string()
        .describe("The trigger ID (get this from list_triggers)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "trigger_management_delete",
        agentLoopContext,
      },
      async ({ triggerId }) => {
        const contextResult = getToolContext(auth, agentLoopContext);
        if (contextResult.isErr()) {
          return contextResult;
        }
        const { userId, workspaceSId, agentConfiguration } =
          contextResult.value;

        const triggerResult = await fetchTriggerWithOwnershipCheck(
          auth,
          triggerId,
          agentConfiguration.sId,
          userId
        );
        if (triggerResult.isErr()) {
          return triggerResult;
        }
        const trigger = triggerResult.value;

        const triggerName = trigger.name;
        const result = await trigger.delete(auth);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to delete trigger: ${result.error.message}`)
          );
        }

        getStatsDClient().increment("tools.trigger_management.deleted", 1, [
          `workspace_id:${workspaceSId}`,
          `agent_id:${agentConfiguration.sId}`,
        ]);

        return new Ok([
          {
            type: "text" as const,
            text: `Deleted trigger "${triggerName}".`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
