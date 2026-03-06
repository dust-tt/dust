import type { ChatStreamer, WebClient } from "@slack/web-api";
import type { ChatAppendStreamArguments } from "@slack/web-api/dist/types/request/chat";

// Single task id reused for every task so only the latest is visible.
// Later, if we adapt the tool call output a bit further, we can use this
// to show multiple tasks in a single plan block (see: https://docs.slack.dev/reference/block-kit/blocks/plan-block).
const ACTIVE_TASK_ID = "active-task-id";

export class SlackStreamHandler {
  private streamer: ChatStreamer | undefined;
  private hasTask = false;
  messageTs: string | undefined;

  constructor(private slackClient: WebClient) {}

  public start({
    slackChannel,
    slackMessageTs,
    slackTeamId,
    slackUserId,
  }: {
    slackChannel: string;
    slackMessageTs: string;
    slackTeamId: string;
    slackUserId?: string;
  }) {
    this.streamer = this.slackClient.chatStream({
      channel: slackChannel,
      thread_ts: slackMessageTs,
      recipient_team_id: slackTeamId,
      recipient_user_id: slackUserId ?? undefined,
      buffer_size: 256,
    });
  }

  private async append(
    payload: Omit<ChatAppendStreamArguments, "channel" | "ts">
  ) {
    const res = await this.streamer?.append(payload);
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
