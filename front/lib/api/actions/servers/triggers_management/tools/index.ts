import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { TRIGGERS_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/triggers_management/metadata";
import { generateScheduleRule } from "@app/lib/api/assistant/configuration/triggers";
import { getWebhookFilterGeneration } from "@app/lib/api/assistant/configuration/triggers/webhook_filter";
import type { Authenticator } from "@app/lib/auth";
import { parseMatcherExpression } from "@app/lib/matcher/parser";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  resolveTriggerSpaceId,
  TriggerResource,
} from "@app/lib/resources/trigger_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type {
  ScheduleTriggerType,
  WebhookTriggerType,
} from "@app/types/assistant/triggers";
import {
  DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT,
  isScheduleTrigger,
  isWebhookTrigger,
} from "@app/types/assistant/triggers";
import { Err, Ok } from "@app/types/shared/result";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";
import assert from "assert";
import { UniqueConstraintError } from "sequelize";

function renderSchedule(
  schedule: ScheduleTriggerType,
  podName?: string | null
): string {
  const config = schedule.configuration;
  const scheduleDesc =
    schedule.naturalLanguageDescription ?? describeScheduleConfig(config);
  const scheduleInfo = `${scheduleDesc} (${config.timezone})`;
  const lines = [
    `- **${schedule.name}** (ID: ${schedule.sId})`,
    `  Schedule: ${scheduleInfo}`,
  ];
  if (podName && schedule.spaceId) {
    lines.push(`  Pod: ${podName} (${schedule.spaceId})`);
  }
  if (schedule.customPrompt) {
    lines.push(`  Prompt: ${schedule.customPrompt}`);
  }
  lines.push(`  Status: ${schedule.status}`);
  return lines.join("\n");
}

function renderWebhookTrigger(
  trigger: WebhookTriggerType,
  sourceName: string | null
): string {
  const config = trigger.configuration;
  const lines = [
    `- **${trigger.name}** (ID: ${trigger.sId}) [event trigger]`,
    `  Source: ${sourceName ?? "(unknown)"}`,
  ];
  if (config.event) {
    lines.push(`  Event: ${config.event}`);
  }
  if (config.filter) {
    lines.push(`  Filter: ${config.filter}`);
  }
  if (trigger.customPrompt) {
    lines.push(`  Prompt: ${trigger.customPrompt}`);
  }
  lines.push(`  Status: ${trigger.status}`);
  return lines.join("\n");
}

async function getAccessibleWebhookSourceViews(
  auth: Authenticator
): Promise<WebhookSourcesViewResource[]> {
  const views = await WebhookSourcesViewResource.listByWorkspace(auth);
  const usable = views.filter(
    (view) =>
      view.canReadOrAdministrate(auth) &&
      !view.space.isSystem() &&
      !view.space.isConversations()
  );

  const bySourceId = new Map<number, WebhookSourcesViewResource>();
  for (const view of usable) {
    if (!bySourceId.has(view.webhookSourceId)) {
      bySourceId.set(view.webhookSourceId, view);
    }
  }
  return [...bySourceId.values()].sort((a, b) =>
    a.createdAt >= b.createdAt ? -1 : 1
  );
}

function renderSubscribedEvents(
  provider: WebhookSourcesViewResource["webhookSource"]["provider"],
  subscribedEvents: string[]
): string {
  if (subscribedEvents.length === 0) {
    return "  Events: (no events subscribed)";
  }
  const presetEvents = provider ? WEBHOOK_PRESETS[provider].events : [];
  return (
    "  Events (use the `value` with create_event_trigger):\n" +
    subscribedEvents
      .map((value) => {
        const preset = presetEvents.find((e) => e.value === value);
        if (!preset) {
          return `    - value: \`${value}\``;
        }
        return (
          `    - value: \`${preset.value}\` (${preset.name})\n` +
          `      ${preset.description}`
        );
      })
      .join("\n")
  );
}

function renderWebhookSourceCatalog(
  views: WebhookSourcesViewResource[]
): string {
  return views
    .map((view) => {
      const json = view.toJSON();
      const lines = [`- **${json.customName}**`, `  sourceId: ${json.sId}`];
      if (json.provider) {
        lines.push(`  Provider: ${json.provider}`);
      }
      lines.push(`  Space: ${view.space.name} (${view.space.kind})`);
      if (json.description) {
        lines.push(`  Description: ${json.description}`);
      }
      lines.push(renderSubscribedEvents(json.provider, json.subscribedEvents));
      return lines.join("\n");
    })
    .join("\n\n");
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

export function createTriggersManagementTools(
  auth: Authenticator,
  toolContext?: ToolContext
) {
  const handlers: ToolHandlers<typeof TRIGGERS_MANAGEMENT_TOOLS_METADATA> = {
    create_schedule: async ({ name, schedule, prompt, timezone, podId }) => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const user = auth.getNonNullableUser();

      const { agentConfiguration } = toolContext.runContext;

      const spaceIdRes = await resolveTriggerSpaceId(auth, podId);
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

      statsDMetrics.increment("tools.triggers_management.created", 1, [
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
            (spaceId !== null ? " Its runs will land in the Pod." : "") +
            `\n\n` +
            renderSchedule(trigger),
        },
      ]);
    },

    list_triggers: async ({ podId }) => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const userModelId = auth.getNonNullableUser().id;

      const { agentConfiguration } = toolContext.runContext;

      const triggersResult =
        await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
          agentConfigurationId: agentConfiguration.sId,
          editorIds: [userModelId],
        });

      if (triggersResult.isErr()) {
        return new Err(
          new MCPError("Error while fetching triggers for this agent")
        );
      }

      statsDMetrics.increment("tools.triggers_management.listed", 1, [
        `workspace_id:${owner.sId}`,
        `agent_id:${agentConfiguration.sId}`,
      ]);

      const allTriggers = triggersResult.value.map((t) => t.toJSON());
      const triggers = podId
        ? allTriggers.filter((t) => t.spaceId === podId)
        : allTriggers;
      if (triggers.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: podId
              ? `No triggers associated with Pod "${podId}" for this agent.`
              : "No triggers configured for this agent.",
          },
        ]);
      }

      const schedules = triggers.filter(isScheduleTrigger);
      const webhookTriggers = triggers.filter(isWebhookTrigger);

      // Batch-resolve Pod names for schedules and source names for webhook triggers.
      const podIds = [
        ...new Set(
          schedules
            .map((s) => s.spaceId)
            .filter((id): id is string => id !== null)
        ),
      ];
      const pods =
        podIds.length > 0 ? await SpaceResource.fetchByIds(auth, podIds) : [];
      const podNameById = new Map(pods.map((p) => [p.sId, p.name]));

      const viewSIds = [
        ...new Set(
          webhookTriggers
            .map((t) => t.webhookSourceViewId)
            .filter((id): id is string => id !== null)
        ),
      ];
      const views =
        viewSIds.length > 0
          ? await WebhookSourcesViewResource.fetchByIds(auth, viewSIds)
          : [];
      const sourceNameByViewSId = new Map(
        views.map((v) => [v.sId, v.toJSON().customName])
      );

      const sections: string[] = [];
      if (schedules.length > 0) {
        sections.push(
          `Schedules:\n\n${schedules
            .map((schedule) =>
              renderSchedule(
                schedule,
                schedule.spaceId ? podNameById.get(schedule.spaceId) : null
              )
            )
            .join("\n\n")}`
        );
      }
      if (webhookTriggers.length > 0) {
        sections.push(
          `Event triggers:\n\n${webhookTriggers
            .map((t) =>
              renderWebhookTrigger(
                t,
                t.webhookSourceViewId
                  ? (sourceNameByViewSId.get(t.webhookSourceViewId) ?? null)
                  : null
              )
            )
            .join("\n\n")}`
        );
      }

      return new Ok([
        {
          type: "text" as const,
          text: `Triggers for this agent:\n\n${sections.join("\n\n")}`,
        },
      ]);
    },

    disable_trigger: async ({ triggerId }) => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const userModelId = auth.getNonNullableUser().id;

      const { agentConfiguration } = toolContext.runContext;

      const triggersResult =
        await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
          agentConfigurationId: agentConfiguration.sId,
          editorIds: [userModelId],
        });
      if (triggersResult.isErr()) {
        return new Err(new MCPError("Error fetching triggers"));
      }
      const trigger = triggersResult.value.find((t) => t.sId === triggerId);
      if (!trigger) {
        return new Err(new MCPError("Trigger not found"));
      }

      // An admin editor could otherwise clear a system-owned status
      // (relocating/downgraded), losing the marker the restore jobs key on.
      if (trigger.isSystemStatusTransitionTo("disabled")) {
        return new Err(
          new MCPError(
            "This trigger's status is managed by Dust and cannot be changed."
          )
        );
      }

      const triggerName = trigger.name;
      const result = await trigger.disable(auth);

      if (result.isErr()) {
        return new Err(
          new MCPError(`Failed to disable trigger: ${result.error.message}`)
        );
      }

      statsDMetrics.increment("tools.triggers_management.disabled", 1, [
        `workspace_id:${owner.sId}`,
        `agent_id:${agentConfiguration.sId}`,
      ]);

      return new Ok([
        {
          type: "text" as const,
          text: `Disabled trigger "${triggerName}".`,
        },
      ]);
    },

    list_event_sources: async () => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const { agentConfiguration } = toolContext.runContext;

      const views = await getAccessibleWebhookSourceViews(auth);

      statsDMetrics.increment(
        "tools.triggers_management.event_sources_listed",
        1,
        [`workspace_id:${owner.sId}`, `agent_id:${agentConfiguration.sId}`]
      );

      if (views.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text:
              "No webhook sources are configured in this workspace. An admin must " +
              "set one up before event triggers can be created.",
          },
        ]);
      }

      return new Ok([
        {
          type: "text" as const,
          text: `Webhook sources available for event triggers:\n\n${renderWebhookSourceCatalog(
            views
          )}`,
        },
      ]);
    },

    create_event_trigger: async ({
      name,
      sourceId,
      event,
      filterDescription,
      prompt,
      includePayload,
      podId,
    }) => {
      assert(
        isAgentLoopRunContext(toolContext?.runContext),
        "AgentLoopRunContext expected"
      );

      const owner = auth.getNonNullableWorkspace();
      const user = auth.getNonNullableUser();

      const { agentConfiguration } = toolContext.runContext;

      const views = await getAccessibleWebhookSourceViews(auth);

      if (views.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text:
              "No webhook sources are configured in this workspace, so no event " +
              "trigger can be created. An admin must first set up a webhook source.",
          },
        ]);
      }

      const view = sourceId ? views.find((v) => v.sId === sourceId) : undefined;

      if (!view) {
        return new Ok([
          {
            type: "text" as const,
            text:
              (sourceId
                ? `No accessible webhook source found with ID "${sourceId}". `
                : "") +
              `Available webhook sources:\n\n${renderWebhookSourceCatalog(
                views
              )}\n\n` +
              "Call create_event_trigger again with a sourceId and event from this list (or use list_event_sources).",
          },
        ]);
      }

      const { provider, subscribedEvents } = view.webhookSource;

      if (!event || !subscribedEvents.includes(event)) {
        const eventList =
          subscribedEvents.length > 0
            ? subscribedEvents.map((e) => `- ${e}`).join("\n")
            : "(this source has no subscribed events)";
        return new Ok([
          {
            type: "text" as const,
            text:
              (event
                ? `Event "${event}" is not available on "${view.toJSON().customName}". `
                : "") +
              `Events available on this source:\n${eventList}\n\n` +
              "Call create_event_trigger again with one of these events.",
          },
        ]);
      }

      let filter: string | undefined;
      if (filterDescription) {
        const preset = provider ? WEBHOOK_PRESETS[provider] : null;
        const presetEvent = preset?.events.find((e) => e.value === event);
        if (!presetEvent) {
          return new Err(
            new MCPError(
              `Cannot generate a filter for event "${event}" on this source. ` +
                "Retry without filterDescription to trigger on every event of this type."
            )
          );
        }
        const filterResult = await getWebhookFilterGeneration(auth, {
          naturalDescription: filterDescription,
          event: presetEvent,
          providerSpecificInstructions:
            preset?.filterGenerationInstructions ?? null,
        });
        if (filterResult.isErr()) {
          logger.error(
            { error: filterResult.error, workspaceId: owner.id, event },
            "Error generating webhook filter"
          );
          return new Err(
            new MCPError(
              `Unable to build a filter from "${filterDescription}": ${filterResult.error.message}`
            )
          );
        }
        const parseResult = parseMatcherExpression(filterResult.value.filter);
        if (parseResult.isErr()) {
          return new Err(
            new MCPError(
              "Generated an invalid filter. Please rephrase the filter description."
            )
          );
        }
        filter = filterResult.value.filter;
      }

      const spaceIdRes = await resolveTriggerSpaceId(auth, podId);
      if (spaceIdRes.isErr()) {
        return new Err(new MCPError(spaceIdRes.error));
      }
      const spaceId = spaceIdRes.value;

      let result;
      try {
        result = await TriggerResource.makeNew(auth, {
          workspaceId: owner.id,
          agentConfigurationId: agentConfiguration.sId,
          name,
          kind: "webhook",
          status: "enabled",
          configuration: {
            includePayload: includePayload ?? true,
            event,
            ...(filter ? { filter } : {}),
          },
          naturalLanguageDescription: filterDescription ?? null,
          customPrompt: prompt ?? null,
          editor: user.id,
          webhookSourceViewId: view.id,
          executionPerDayLimitOverride:
            DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT,
          origin: "agent",
          spaceId,
        });

        if (result.isErr()) {
          logger.error(result.error.message);
          return new Err(
            new MCPError(
              `Failed to create event trigger: ${result.error.message}`
            )
          );
        }
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          return new Err(
            new MCPError(
              "A trigger with this name already exists for this agent."
            )
          );
        }
        throw err;
      }

      statsDMetrics.increment(
        "tools.triggers_management.event_trigger_created",
        1,
        [`workspace_id:${owner.sId}`, `agent_id:${agentConfiguration.sId}`]
      );

      const trigger = result.value.toJSON();
      if (!isWebhookTrigger(trigger)) {
        return new Err(new MCPError("Unexpected trigger type"));
      }

      const sourceName = view.toJSON().customName;

      return new Ok([
        {
          type: "text" as const,
          text:
            `Created event trigger "${name}"!\n\n` +
            `Source: ${sourceName}\n` +
            `Event: ${event}\n` +
            (filter ? `Filter: ${filter}\n` : "") +
            (prompt
              ? `\nThe agent will run "${prompt}" when this event fires.`
              : "") +
            (spaceId !== null ? " Its runs will land in the Pod." : ""),
        },
      ]);
    },
  };

  return buildTools(TRIGGERS_MANAGEMENT_TOOLS_METADATA, handlers);
}
