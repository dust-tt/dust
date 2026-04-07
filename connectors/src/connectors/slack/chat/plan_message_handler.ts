import {
  getActionDoneLabel,
  getActionRunningLabel,
} from "@connectors/connectors/slack/chat/action_utils";
import {
  makePlanMessage,
  type TaskCardState,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/slack/chat/blocks";
import logger from "@connectors/logger/logger";
import type {
  AgentEvent,
  DustAPI,
  NotificationRunAgentContent,
} from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";

// Match the SDK defaults (sdks/js/src/index.ts DEFAULT_MAX_RECONNECT_ATTEMPTS / DEFAULT_RECONNECT_DELAY).
const CHILD_STREAM_MAX_RECONNECT_ATTEMPTS = 10;
const CHILD_STREAM_RECONNECT_DELAY_MS = 5_000;

interface PlanMessageHandlerParams {
  dustAPI: DustAPI;
  slackClient: WebClient;
  slackChannelId: string;
  slackMessageTs: string;
  conversationUrl: string | null;
  assistantName: string;
  workspaceId: string;
}

export class PlanMessageHandler {
  private readonly dustAPI: DustAPI;
  private readonly slackClient: WebClient;
  private readonly slackChannelId: string;
  private readonly slackMessageTs: string;
  private readonly conversationUrl: string | null;
  private readonly assistantName: string;
  private readonly workspaceId: string;

  private readonly taskCards = new Map<string, TaskCardState>();
  private planMessageTs: string | undefined;
  private readonly childStreamControllers = new Map<string, AbortController>();

  constructor({
    dustAPI,
    slackClient,
    slackChannelId,
    slackMessageTs,
    conversationUrl,
    assistantName,
    workspaceId,
  }: PlanMessageHandlerParams) {
    this.dustAPI = dustAPI;
    this.slackClient = slackClient;
    this.slackChannelId = slackChannelId;
    this.slackMessageTs = slackMessageTs;
    this.conversationUrl = conversationUrl;
    this.assistantName = assistantName;
    this.workspaceId = workspaceId;
  }

  async upsertPlanMessage(title: string): Promise<void> {
    const payload = makePlanMessage({
      planTitle: title,
      tasks: [...this.taskCards.values()],
      conversationUrl: this.conversationUrl,
      assistantName: this.assistantName,
      workspaceId: this.workspaceId,
    });

    if (this.planMessageTs) {
      await this.slackClient.chat.update({
        ...payload,
        channel: this.slackChannelId,
        ts: this.planMessageTs,
      });
    } else {
      const res = await this.slackClient.chat.postMessage({
        ...payload,
        channel: this.slackChannelId,
        thread_ts: this.slackMessageTs,
      });
      this.planMessageTs = res.ts;
    }
  }

  async deletePlanMessage(): Promise<void> {
    if (!this.planMessageTs) {
      return;
    }
    const ts = this.planMessageTs;
    this.planMessageTs = undefined;
    await this.slackClient.chat.delete({ channel: this.slackChannelId, ts });
  }

  setDefaultTask(title: string, status: TaskCardState["status"]): void {
    this.taskCards.set("default", { taskId: "default", title, status });
  }

  private async handleChildStreamEvent(
    taskId: string,
    event: AgentEvent
  ): Promise<"continue" | "complete" | "error"> {
    switch (event.type) {
      case "tool_params":
      case "tool_notification": {
        const label = getActionRunningLabel(event.action);
        this.taskCards.set(taskId, { taskId, title: label, status: "in_progress" });
        await this.upsertPlanMessage(label);
        return "continue";
      }
      case "agent_action_success": {
        const label = getActionDoneLabel(event.action);
        this.taskCards.set(taskId, { taskId, title: label, status: "complete" });
        await this.upsertPlanMessage(label);
        return "continue";
      }
      case "agent_message_success":
      case "agent_generation_cancelled":
        return "complete";
      case "agent_error":
        return "error";
      default:
        return "continue";
    }
  }

  async startChildStream(output: NotificationRunAgentContent): Promise<void> {
    if (!output.agentMessageId) {
      return;
    }

    const controller = new AbortController();
    const { conversationId, agentMessageId } = output;
    this.childStreamControllers.set(conversationId, controller);

    // One task card per child agent, keyed by conversationId. Run in background.
    void this.runChildStream(conversationId, agentMessageId, controller);
  }

  private async runChildStream(
    conversationId: string,
    agentMessageId: string,
    controller: AbortController
  ): Promise<void> {
    const streamRes = await this.dustAPI.streamAgentMessageEvents({
      conversation: { sId: conversationId },
      agentMessage: { sId: agentMessageId },
      signal: controller.signal,
      options: {
        maxReconnectAttempts: CHILD_STREAM_MAX_RECONNECT_ATTEMPTS,
        reconnectDelay: CHILD_STREAM_RECONNECT_DELAY_MS,
        autoReconnect: true,
      },
    });
    if (streamRes.isErr()) {
      logger.error(
        { conversationId, error: streamRes.error },
        "Failed to open child agent stream"
      );
      return;
    }

    try {
      for await (const event of streamRes.value.eventStream) {
        const result = await this.handleChildStreamEvent(conversationId, event);
        if (result === "complete" || result === "error") {
          break;
        }
      }
    } catch {
      // AbortError or stream failure — handled by cleanup.
    } finally {
      this.childStreamControllers.delete(conversationId);
    }
  }

  abortAllChildStreams(): void {
    for (const [, controller] of this.childStreamControllers) {
      controller.abort();
    }
    this.childStreamControllers.clear();
  }
}
