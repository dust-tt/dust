import type { ChatStreamer, WebClient } from "@slack/web-api";
import type { ChatAppendStreamArguments } from "@slack/web-api/dist/types/request/chat";

export class SlackStreamHandler {
  private streamer: ChatStreamer | undefined;
  // Single task slot reused for every task — only the latest is visible.
  // The stream is invisible until first append (chat.startStream only fires
  // then). The native "Thinking…" spinner requires the Assistant API's
  // set_status(), which we don't use, so a task kicks off the stream instead.
  private readonly taskId = "active-step";
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
        { type: "task_update", id: this.taskId, title, status: "in_progress" },
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
            id: this.taskId,
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
