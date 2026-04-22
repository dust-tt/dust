import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { WAKEUPS_TOOLS_METADATA } from "@app/lib/api/actions/servers/wakeups/metadata";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

// Per-conversation guardrails. Enforced at tool-call time so the agent gets a clear error instead
// of silently over-scheduling.
const MAX_ACTIVE_WAKEUPS_PER_CONVERSATION = 1;

// One-shot wake-ups cannot be scheduled further than this into the future. Prevents
// far-future orphans. Matches the "Max one-shot delay | 1 month" guardrail.
const MAX_ONE_SHOT_DELAY_MS = 31 * 24 * 60 * 60 * 1000;

const RELATIVE_DURATION_REGEXP = /^in\s+(\d+)\s*(m|h|d)$/i;

function parseRelativeDuration(input: string): Date | null {
  const match = RELATIVE_DURATION_REGEXP.exec(input.trim());
  if (!match) {
    return null;
  }

  const amount = parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2].toLowerCase();
  const unitMs =
    unit === "m"
      ? 60 * 1000
      : unit === "h"
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

  return new Date(Date.now() + amount * unitMs);
}

function parseIsoTimestamp(input: string): Date | null {
  const trimmed = input.trim();
  // Require a year-led ISO-ish prefix to avoid accidentally parsing things like "2h" as 2 AM.
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(trimmed)) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseWhen(when: string):
  | {
      kind: "one_shot";
      fireAt: Date;
    }
  | {
      kind: "cron";
      cron: string;
    }
  | null {
  const trimmed = when.trim();

  const relative = parseRelativeDuration(trimmed);
  if (relative) {
    return { kind: "one_shot", fireAt: relative };
  }

  const iso = parseIsoTimestamp(trimmed);
  if (iso) {
    return { kind: "one_shot", fireAt: iso };
  }

  // If looks like cron
  if (trimmed.split(/\s+/).length === 5) {
    return { kind: "cron", cron: trimmed };
  }

  return null;
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

function renderScheduleConfig(wakeUp: WakeUpType): string {
  switch (wakeUp.scheduleConfig.type) {
    case "one_shot":
      return `one-shot at ${new Date(wakeUp.scheduleConfig.fireAt).toISOString()}`;
    case "cron":
      return `cron "${wakeUp.scheduleConfig.cron}" (${wakeUp.scheduleConfig.timezone})`;
    default:
      assertNever(wakeUp.scheduleConfig);
  }
}

function renderWakeUp(wakeUp: WakeUpType): string {
  return (
    `- ${wakeUp.sId} — ${renderScheduleConfig(wakeUp)}\n` +
    `  Status: ${wakeUp.status} (${wakeUp.fireCount}/${wakeUp.maxFires} fires)\n` +
    `  Reason: ${wakeUp.reason}`
  );
}

export function createWakeupsTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const handlers: ToolHandlers<typeof WAKEUPS_TOOLS_METADATA> = {
    schedule_wakeup: async ({ when, reason, timezone }) => {
      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError(
            "Wake-ups can only be scheduled from within a conversation."
          )
        );
      }

      const { conversation: runConversation, agentConfiguration } =
        agentLoopContext.runContext;

      const parsed = parseWhen(when);
      if (!parsed) {
        return new Err(
          new MCPError(
            `Unable to parse \`when\`="${when}". Expected a relative duration ` +
              '("in 2h"), an ISO 8601 timestamp ("2026-04-16T16:00:00Z"), or a 5-field cron ' +
              'expression ("0 9 * * MON-FRI").'
          )
        );
      }

      if (parsed.kind === "one_shot") {
        const delayMs = parsed.fireAt.getTime() - Date.now();
        if (delayMs <= 0) {
          return new Err(
            new MCPError(
              `Cannot schedule a wake-up in the past (${parsed.fireAt.toISOString()}).`
            )
          );
        }
        if (delayMs > MAX_ONE_SHOT_DELAY_MS) {
          return new Err(
            new MCPError(
              `One-shot wake-ups cannot be scheduled more than ${MAX_ONE_SHOT_DELAY_MS / (24 * 60 * 60 * 1000)} days in the future.`
            )
          );
        }
      }

      let cronTimezone: string | null = null;
      if (parsed.kind === "cron") {
        cronTimezone = timezone ?? getUserTimezone(agentLoopContext);
        if (!cronTimezone) {
          return new Err(
            new MCPError(
              "Cron wake-ups require a `timezone` (IANA name, e.g. 'Europe/Paris'). " +
                "None was provided and no timezone could be inferred from the conversation."
            )
          );
        }
      }

      const conversation = await ConversationResource.fetchById(
        auth,
        runConversation.sId
      );
      if (!conversation) {
        return new Err(
          new MCPError("Current conversation could not be loaded.")
        );
      }

      const conversationWakeUps = await WakeUpResource.listByConversation(
        auth,
        runConversation
      );
      const activeInConversation = conversationWakeUps.filter(
        (w) => w.status === "scheduled"
      );
      if (activeInConversation.length >= MAX_ACTIVE_WAKEUPS_PER_CONVERSATION) {
        return new Err(
          new MCPError(
            `This conversation already has ${activeInConversation.length} active wake-up(s); ` +
              `the limit is ${MAX_ACTIVE_WAKEUPS_PER_CONVERSATION}. Cancel the existing wake-up ` +
              "before scheduling a new one."
          )
        );
      }

      const blob =
        parsed.kind === "one_shot"
          ? {
              scheduleType: "one_shot" as const,
              fireAt: parsed.fireAt,
              cronExpression: null,
              cronTimezone: null,
              reason,
            }
          : {
              scheduleType: "cron" as const,
              fireAt: null,
              cronExpression: parsed.cron,
              // parsed.kind === "cron" means we resolved cronTimezone above.
              cronTimezone: cronTimezone as string,
              reason,
            };

      const result = await WakeUpResource.makeNew(
        auth,
        blob,
        conversation,
        agentConfiguration
      );
      if (result.isErr()) {
        return new Err(
          new MCPError(`Failed to schedule wake-up: ${result.error.message}`)
        );
      }

      const wakeUp = result.value.toJSON();
      return new Ok([
        {
          type: "text" as const,
          text:
            `Scheduled wake-up ${wakeUp.sId}.\n\n` +
            `Schedule: ${renderScheduleConfig(wakeUp)}\n` +
            `Reason: ${wakeUp.reason}`,
        },
      ]);
    },

    list_wakeups: async () => {
      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError(
            "Wake-ups can only be listed from within a conversation."
          )
        );
      }

      const { conversation } = agentLoopContext.runContext;

      const wakeUps = await WakeUpResource.listByConversation(
        auth,
        conversation
      );

      if (wakeUps.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: "No wake-ups in this conversation.",
          },
        ]);
      }

      const rendered = wakeUps
        .map((w) => renderWakeUp(w.toJSON()))
        .join("\n\n");
      return new Ok([
        {
          type: "text" as const,
          text: `Wake-ups in this conversation:\n\n${rendered}`,
        },
      ]);
    },

    cancel_wakeup: async ({ wakeUpId }) => {
      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError(
            "Wake-ups can only be cancelled from within a conversation."
          )
        );
      }

      const { conversation } = agentLoopContext.runContext;

      const wakeUp = await WakeUpResource.fetchById(auth, wakeUpId);
      if (!wakeUp) {
        return new Err(new MCPError(`Wake-up ${wakeUpId} not found.`));
      }

      if (wakeUp.conversationId !== conversation.id) {
        return new Err(
          new MCPError(
            `Wake-up ${wakeUpId} does not belong to the current conversation.`
          )
        );
      }

      const previousStatus = wakeUp.status;
      const cancelResult = await wakeUp.cancel(auth);
      if (cancelResult.isErr()) {
        return new Err(
          new MCPError(
            `Failed to cancel wake-up ${wakeUpId}: ${cancelResult.error.message}`
          )
        );
      }

      if (previousStatus !== "scheduled") {
        return new Ok([
          {
            type: "text" as const,
            text: `Wake-up ${wakeUpId} was already ${previousStatus}; nothing to do.`,
          },
        ]);
      }

      return new Ok([
        {
          type: "text" as const,
          text: `Cancelled wake-up ${wakeUpId}.`,
        },
      ]);
    },
  };

  return buildTools(WAKEUPS_TOOLS_METADATA, handlers);
}
