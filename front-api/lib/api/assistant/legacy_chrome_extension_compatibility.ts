import { USER_MEMORY_SERVER_NAME } from "@app/lib/api/actions/servers/user_memory/metadata";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { AgentMessageContentView } from "@app/types/assistant/agent";
import type {
  InlineActivityStep,
  LightAgentMessageType,
} from "@app/types/assistant/conversation";

// Chrome 0.1.13 bundled an internal-server registry that predates user_memory.
// Returning a null server name keeps the tool data intact while making that
// renderer use its generic icon instead of indexing the missing registry entry.
const FIRST_CHROME_EXTENSION_VERSION_WITH_UNKNOWN_SERVER_GUARD = [
  0, 1, 14,
] as const;

type AgentMessageStreamEvent = {
  eventId: string;
  data: AgentMessageEvents & { step: number };
};

function isVersionBefore(
  version: readonly number[],
  minimumVersion: readonly number[]
): boolean {
  for (let index = 0; index < minimumVersion.length; index++) {
    const currentPart = version[index] ?? 0;
    const minimumPart = minimumVersion[index] ?? 0;
    if (currentPart !== minimumPart) {
      return currentPart < minimumPart;
    }
  }

  return false;
}

export function isLegacyChromeExtensionRequest({
  origin,
  extensionVersion,
}: {
  origin: string | undefined;
  extensionVersion: string | undefined;
}): boolean {
  const hasChromeOrigin = origin?.startsWith("chrome-extension://") ?? false;
  const hasChromeVersion = extensionVersion?.startsWith("chrome-") ?? false;

  if (!hasChromeOrigin && !hasChromeVersion) {
    return false;
  }

  // Chrome 0.1.13 did not attach its version header to direct fetches or SSE.
  // Treat a Chrome-origin request without a parseable version as legacy.
  const versionMatch = extensionVersion?.match(/^chrome-(\d+)\.(\d+)\.(\d+)$/);
  if (!versionMatch) {
    return true;
  }

  const version = versionMatch.slice(1).map(Number);
  return isVersionBefore(
    version,
    FIRST_CHROME_EXTENSION_VERSION_WITH_UNKNOWN_SERVER_GUARD
  );
}

function makeActionCompatible(
  action: AgentMCPActionWithOutputType
): AgentMCPActionWithOutputType {
  if (action.internalMCPServerName !== USER_MEMORY_SERVER_NAME) {
    return action;
  }

  return {
    ...action,
    internalMCPServerName: null,
  };
}

function makeActivityStepsCompatible(
  activitySteps: InlineActivityStep[]
): InlineActivityStep[] {
  return activitySteps.map((step) => {
    if (
      step.type !== "action" ||
      step.internalMCPServerName !== USER_MEMORY_SERVER_NAME
    ) {
      return step;
    }

    return {
      ...step,
      internalMCPServerName: null,
    };
  });
}

export function makeLegacyChromeExtensionLightMessageCompatible(
  message: LightAgentMessageType
): LightAgentMessageType {
  return {
    ...message,
    activitySteps: makeActivityStepsCompatible(message.activitySteps),
  };
}

function makeContentViewCompatible(
  contentView: AgentMessageContentView
): AgentMessageContentView {
  return {
    ...contentView,
    activitySteps: makeActivityStepsCompatible(contentView.activitySteps),
  };
}

export function makeLegacyChromeExtensionMessageEventCompatible(
  event: AgentMessageStreamEvent
): AgentMessageStreamEvent {
  switch (event.data.type) {
    case "agent_action_success":
    case "tool_notification":
    case "tool_params":
      return {
        ...event,
        data: {
          ...event.data,
          action: makeActionCompatible(event.data.action),
        },
      };

    case "agent_message_gracefully_stopped":
    case "agent_message_success":
      if (!event.data.contentView) {
        return event;
      }

      return {
        ...event,
        data: {
          ...event.data,
          contentView: makeContentViewCompatible(event.data.contentView),
        },
      };

    default:
      return event;
  }
}
