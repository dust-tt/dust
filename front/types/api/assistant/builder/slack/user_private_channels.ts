export type SlackUserPrivateChannel = {
  slackChannelId: string;
  slackChannelName: string;
  sourceUrl: string | null;
};

export type GetSlackUserPrivateChannelsResponseBody = {
  /**
   * - `ok`: personal Slack Tools connection found; private channels listed.
   * - `not_connected`: user has not connected personal Slack Tools yet.
   * - `tool_unavailable`: Slack Tools is not activated in this workspace.
   */
  status: "ok" | "not_connected" | "tool_unavailable";
  channels: SlackUserPrivateChannel[];
};
