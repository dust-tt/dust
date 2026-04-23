import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import { throttleWithRedis } from "@connectors/lib/throttle";
import logger from "@connectors/logger/logger";
import type { ChatStreamer, WebClient } from "@slack/web-api";

// Matches a complete :cite[...] marker.
const CITE_REGEX = /:cite\[[a-zA-Z0-9, ]+\]/g;

export class SlackStreamHandler {
  private streamer: ChatStreamer;
  private stopped = false;
  private channelId: string;
  private slackMessageTs: string;
  private threadTs: string | undefined;
  messageTs: string | undefined;

  get isStopped(): boolean {
    return this.stopped;
  }

  constructor(
    private readonly slackClient: WebClient,
    private readonly connectorId: number,
    {
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
      slackUserId: string;
    }
  ) {
    this.channelId = slackChannel;
    this.slackMessageTs = slackMessageTs;
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
    await this.slackClient.assistant.threads.setStatus({
      channel_id: this.channelId,
      thread_ts: this.threadTs ?? this.slackMessageTs,
      status,
      loading_messages: ["Thinking..."],
    });
  }

  async appendText(text: string) {
    if (this.stopped) {
      return;
    }

    // Strip complete citation markers — they'll be rendered as numbered
    // footnotes in the final chat.update via annotateCitations().
    const toSend = text.replace(CITE_REGEX, "");
    if (!toSend) {
      return;
    }

    try {
      const res = await throttleWithRedis(
        RATE_LIMITS["chat.appendStream"],
        `${this.connectorId}-chat-appendStream`,
        { canBeIgnored: false },
        () => this.streamer.append({ markdown_text: toSend }),
        {}
      );

      if (!this.messageTs && res?.ts) {
        this.messageTs = res.ts;
      }
    } catch (e) {
      if (
        isSlackWebAPIPlatformError(e) &&
        e.data?.error === "message_not_in_streaming_state"
      ) {
        this.stopped = true;
        logger.warn(
          { connectorId: this.connectorId },
          "Slack stream expired mid-answer, falling back to chat.update on agent_message_success"
        );
        return;
      }

      throw e;
    }
  }

  async stop() {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    const res = await this.streamer.stop();

    if (!this.messageTs && res?.ts) {
      this.messageTs = res.ts;
    }
  }
}
