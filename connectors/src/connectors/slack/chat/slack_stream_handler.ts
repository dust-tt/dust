import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import { throttleWithRedis } from "@connectors/lib/throttle";
import type { ChatStreamer, WebClient } from "@slack/web-api";
import type { ChatAppendStreamArguments } from "@slack/web-api/dist/types/request/chat";

// Single task id reused for every task so only the latest is visible.
// Later, if we adapt the tool call output a bit further, we can use this
// to show multiple tasks in a single plan block (see: https://docs.slack.dev/reference/block-kit/blocks/plan-block).
const ACTIVE_TASK_ID = "active-task-id";

export class SlackStreamHandler {
  private streamer: ChatStreamer | undefined;
  private hasTask = false;
  private channelId: string | undefined;
  private threadTs: string | undefined;
  messageTs: string | undefined;

  constructor(
    private readonly slackClient: WebClient,
    private readonly connectorId: number
  ) {}

  public start({
    slackChannel,
    slackMessageTs,
    slackThreadTs,
    slackTeamId,
    slackUserId,
  }: {
    slackChannel: string;
    slackMessageTs: string;
    slackThreadTs?: string;
    slackTeamId: string;
    slackUserId?: string;
  }) {
    this.channelId = slackChannel;
    this.threadTs = slackThreadTs;
    this.streamer = this.slackClient.chatStream({
      channel: slackChannel,
      thread_ts: slackMessageTs,
      recipient_team_id: slackTeamId,
      recipient_user_id: slackUserId ?? undefined,
      buffer_size: 256,
    });
  }

  async setThinking(status: string) {
    if (!this.channelId || !this.threadTs) {
      return;
    }
    await this.slackClient.assistant.threads.setStatus({
      channel_id: this.channelId,
      thread_ts: this.threadTs,
      status,
    });
  }

  private async append(
    payload: Omit<ChatAppendStreamArguments, "channel" | "ts">
  ) {
    const res = await throttleWithRedis(
      RATE_LIMITS["chat.appendStream"],
      `${this.connectorId}-chat-appendStream`,
      { canBeIgnored: true },
      () => this.streamer?.append(payload) ?? Promise.resolve(undefined),
      {}
    );
    if (!this.messageTs && res?.ts) {
      this.messageTs = res.ts;
    }
  }

  async startTask(title: string) {
    this.hasTask = true;
    await this.append({
      chunks: [
        {
          type: "task_update",
          id: ACTIVE_TASK_ID,
          title,
          status: "in_progress",
        },
      ],
    });
  }

  async appendText(text: string) {
    if (this.hasTask) {
      this.hasTask = false;
      await this.append({
        chunks: [
          {
            type: "task_update",
            id: ACTIVE_TASK_ID,
            title: "Done",
            status: "complete",
          },
        ],
      });
    }
    await this.append({ markdown_text: text });
  }

  async stop() {
    this.hasTask = false;
    await this.streamer?.stop();
  }
}
