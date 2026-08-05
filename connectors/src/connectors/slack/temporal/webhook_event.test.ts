import { toWebhookEventPayload } from "@connectors/connectors/slack/temporal/webhook_event";
import type {
  AppMentionEvent,
  ChannelCreatedEvent,
  ChannelDeletedEvent,
  ChannelLeftEvent,
  ChannelNameMessageEvent,
  ChannelRenameEvent,
  GenericMessageEvent,
  MemberJoinedChannelEvent,
  MessageChangedEvent,
  MessageDeletedEvent,
} from "@slack/types";
import { describe, expect, it } from "vitest";

// Fixtures are typed with the vendored Slack event interfaces, so a shape
// change in `@slack/types` breaks this file rather than production.

const APP_MENTION: AppMentionEvent = {
  type: "app_mention",
  channel: "C1",
  ts: "1700000000.000100",
  text: "<@U1> hello",
  event_ts: "1700000000.000100",
};

const CHANNEL_MESSAGE: GenericMessageEvent = {
  type: "message",
  subtype: undefined,
  channel: "C1",
  channel_type: "channel",
  user: "U1",
  ts: "1700000000.000100",
  event_ts: "1700000000.000100",
  text: "secret message body",
  attachments: [{ text: "forwarded body" }],
};

describe("toWebhookEventPayload", () => {
  it("projects an app mention", () => {
    expect(toWebhookEventPayload(APP_MENTION)).toEqual({
      type: "app_mention",
      channelId: "C1",
      ts: "1700000000.000100",
    });
  });

  it("projects a channel message, leaving its body behind", () => {
    expect(toWebhookEventPayload(CHANNEL_MESSAGE)).toEqual({
      type: "channel_message",
      channelId: "C1",
      ts: "1700000000.000100",
      threadTs: undefined,
    });
  });

  it("keeps the thread of a threaded message", () => {
    const event: GenericMessageEvent = {
      ...CHANNEL_MESSAGE,
      thread_ts: "1699999999.000100",
    };

    expect(toWebhookEventPayload(event)).toMatchObject({
      type: "channel_message",
      threadTs: "1699999999.000100",
    });
  });

  it("projects a private group message like a channel message", () => {
    const event: GenericMessageEvent = {
      ...CHANNEL_MESSAGE,
      channel_type: "group",
    };

    expect(toWebhookEventPayload(event)).toMatchObject({
      type: "channel_message",
    });
  });

  it("projects a direct message", () => {
    const event: GenericMessageEvent = {
      ...CHANNEL_MESSAGE,
      channel: "D1",
      channel_type: "im",
    };

    expect(toWebhookEventPayload(event)).toEqual({
      type: "direct_message",
      channelId: "D1",
      ts: "1700000000.000100",
      userId: "U1",
    });
  });

  it("drops an edited direct message", () => {
    const event: MessageChangedEvent = {
      type: "message",
      subtype: "message_changed",
      channel: "D1",
      channel_type: "im",
      hidden: true,
      ts: "1700000000.000200",
      event_ts: "1700000000.000200",
      message: CHANNEL_MESSAGE,
      previous_message: CHANNEL_MESSAGE,
    };

    expect(toWebhookEventPayload(event)).toBeNull();
  });

  it("projects an edited channel message onto the event timestamp", () => {
    const event: MessageChangedEvent = {
      type: "message",
      subtype: "message_changed",
      channel: "C1",
      channel_type: "channel",
      hidden: true,
      ts: "1700000000.000200",
      event_ts: "1700000000.000200",
      message: CHANNEL_MESSAGE,
      previous_message: CHANNEL_MESSAGE,
    };

    expect(toWebhookEventPayload(event)).toMatchObject({
      type: "channel_message",
      ts: "1700000000.000200",
    });
  });

  it("projects a deleted message onto the deleted timestamp", () => {
    const event: MessageDeletedEvent = {
      type: "message",
      subtype: "message_deleted",
      channel: "C1",
      channel_type: "channel",
      hidden: true,
      ts: "1700000000.000200",
      deleted_ts: "1700000000.000100",
      event_ts: "1700000000.000200",
      previous_message: CHANNEL_MESSAGE,
    };

    expect(toWebhookEventPayload(event)).toEqual({
      type: "channel_message_deleted",
      channelId: "C1",
      deletedTs: "1700000000.000100",
      threadTs: undefined,
    });
  });

  it("projects a channel rename", () => {
    const event: ChannelNameMessageEvent = {
      type: "message",
      subtype: "channel_name",
      channel: "C1",
      channel_type: "channel",
      team: "T1",
      user: "U1",
      name: "new-name",
      old_name: "old-name",
      text: "renamed the channel",
      ts: "1700000000.000100",
      event_ts: "1700000000.000100",
    };

    expect(toWebhookEventPayload(event)).toEqual({
      type: "channel_renamed",
      channelId: "C1",
      channelName: "new-name",
    });
  });

  it("flattens the channel object of a created channel", () => {
    const event: ChannelCreatedEvent = {
      type: "channel_created",
      event_ts: "1700000000.000100",
      channel: {
        id: "C1",
        context_team_id: "T1",
        name: "new-channel",
        name_normalized: "new-channel",
        created: 1700000000,
        creator: "U1",
        is_channel: true,
        is_shared: false,
        is_org_shared: false,
        is_archived: false,
        is_frozen: false,
        is_general: false,
        is_group: false,
        is_private: false,
        is_ext_shared: false,
        is_im: false,
        is_mpim: false,
        is_pending_ext_shared: false,
      },
    };

    expect(toWebhookEventPayload(event)).toEqual({
      type: "channel_created",
      channelId: "C1",
      contextTeamId: "T1",
    });
  });

  it("projects a member joining a channel", () => {
    const event: MemberJoinedChannelEvent = {
      type: "member_joined_channel",
      user: "U1",
      channel: "C1",
      channel_type: "C",
      team: "T1",
      event_ts: "1700000000.000100",
    };

    expect(toWebhookEventPayload(event)).toEqual({
      type: "member_joined_channel",
      channelId: "C1",
      userId: "U1",
    });
  });

  it("projects the events that trigger a garbage collection", () => {
    const left: ChannelLeftEvent = {
      type: "channel_left",
      channel: "C1",
      actor_id: "U1",
      event_ts: "1700000000.000100",
    };
    const deleted: ChannelDeletedEvent = {
      type: "channel_deleted",
      channel: "C1",
    };

    expect(toWebhookEventPayload(left)).toEqual({ type: "channel_left" });
    expect(toWebhookEventPayload(deleted)).toEqual({ type: "channel_deleted" });
  });

  it("drops the events we do not route", () => {
    const renamed: ChannelRenameEvent = {
      type: "channel_rename",
      channel: {
        id: "C1",
        name: "new-name",
        name_normalized: "new-name",
        created: 1700000000,
        is_channel: true,
        is_mpim: false,
      },
      event_ts: "1700000000.000100",
    };

    // Renames are routed through the `channel_name` message subtype instead.
    expect(toWebhookEventPayload(renamed)).toBeNull();
    expect(
      toWebhookEventPayload({ ...CHANNEL_MESSAGE, channel_type: "mpim" })
    ).toBeNull();
    expect(toWebhookEventPayload({ type: "reaction_added" })).toBeNull();
  });

  it("drops a malformed event rather than projecting half of it", () => {
    expect(toWebhookEventPayload({ type: "app_mention" })).toBeNull();
    expect(
      toWebhookEventPayload({ type: "channel_created", channel: "C1" })
    ).toBeNull();
    expect(
      toWebhookEventPayload({ ...CHANNEL_MESSAGE, subtype: "message_deleted" })
    ).toBeNull();
    expect(
      toWebhookEventPayload({ ...CHANNEL_MESSAGE, subtype: "channel_name" })
    ).toBeNull();
    expect(toWebhookEventPayload(undefined)).toBeNull();
  });
});
