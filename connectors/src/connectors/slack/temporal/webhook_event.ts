import type {
  AppMentionEvent,
  ChannelCreatedEvent,
  ChannelDeletedEvent,
  ChannelLeftEvent,
  ChannelNameMessageEvent,
  GenericMessageEvent,
  MemberJoinedChannelEvent,
  MessageDeletedEvent,
} from "@slack/types";
import { z } from "zod";

/**
 * Projection of a Slack webhook event, built by the webhook handler and carried
 * to `slackWebhookEventWorkflow`. One variant per routing decision, so a
 * handler never has to re-check the fields it reads. Message text, blocks and
 * attachments never leave the webhook.
 */
export const SlackWebhookEventPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("app_mention"),
    channelId: z.string(),
    ts: z.string(),
  }),
  z.object({
    type: z.literal("direct_message"),
    channelId: z.string(),
    ts: z.string(),
    // Absent on messages posted by a bot, which carry `bot_id` instead.
    userId: z.string().optional(),
  }),
  z.object({
    type: z.literal("channel_message"),
    channelId: z.string(),
    ts: z.string(),
    threadTs: z.string().optional(),
  }),
  z.object({
    type: z.literal("channel_message_deleted"),
    channelId: z.string(),
    // Timestamp of the deleted message, which is the one to re-sync.
    deletedTs: z.string(),
    threadTs: z.string().optional(),
  }),
  // Slack sends channel renames as a `channel_name` message subtype. The
  // top-level `channel_rename` event carries no member list and is not routed.
  z.object({
    type: z.literal("channel_renamed"),
    channelId: z.string(),
    channelName: z.string(),
  }),
  z.object({
    type: z.literal("channel_created"),
    channelId: z.string(),
    // Team the channel belongs to. Differs from the webhook team id on shared
    // channels.
    contextTeamId: z.string(),
  }),
  z.object({
    type: z.literal("member_joined_channel"),
    channelId: z.string(),
    userId: z.string(),
  }),
  z.object({ type: z.literal("channel_left") }),
  z.object({ type: z.literal("channel_deleted") }),
]);

export type SlackWebhookEventPayload = z.infer<
  typeof SlackWebhookEventPayloadSchema
>;

// Raw Slack events, narrowed to the fields we route on. `satisfies` pins each
// schema to the vendored Slack types, so a shape change breaks the build.

const EventTypeSchema = z.object({ type: z.string() });

const AppMentionEventSchema = z.object({
  type: z.literal("app_mention"),
  channel: z.string(),
  ts: z.string(),
}) satisfies z.ZodType<Pick<AppMentionEvent, "type" | "channel" | "ts">>;

const MessageEventSchema = z.object({
  type: z.literal("message"),
  channel: z.string(),
  channel_type: z.enum(["channel", "group", "im", "mpim", "app_home"]),
  ts: z.string(),
  subtype: z.string().optional(),
  user: z.string().optional(),
  thread_ts: z.string().optional(),
  // Only on the `message_deleted` subtype.
  deleted_ts: z.string().optional(),
  // Only on the `channel_name` subtype.
  name: z.string().optional(),
}) satisfies z.ZodType<
  Pick<GenericMessageEvent, "type" | "channel" | "channel_type" | "ts"> & {
    subtype?: string;
    user?: GenericMessageEvent["user"];
    thread_ts?: GenericMessageEvent["thread_ts"];
    deleted_ts?: MessageDeletedEvent["deleted_ts"];
    name?: ChannelNameMessageEvent["name"];
  }
>;

const ChannelCreatedEventSchema = z.object({
  type: z.literal("channel_created"),
  channel: z.object({ id: z.string(), context_team_id: z.string() }),
}) satisfies z.ZodType<{
  type: ChannelCreatedEvent["type"];
  channel: Pick<ChannelCreatedEvent["channel"], "id" | "context_team_id">;
}>;

const MemberJoinedChannelEventSchema = z.object({
  type: z.literal("member_joined_channel"),
  channel: z.string(),
  user: z.string(),
}) satisfies z.ZodType<
  Pick<MemberJoinedChannelEvent, "type" | "channel" | "user">
>;

const ChannelGoneEventSchema = z.object({
  type: z.enum(["channel_left", "channel_deleted"]),
}) satisfies z.ZodType<{
  type: ChannelLeftEvent["type"] | ChannelDeletedEvent["type"];
}>;

/**
 * Projects a raw Slack event onto the payload the workflow needs, or null when
 * the event is not one we route or is missing the fields its variant needs.
 * This is the only place that reads Slack's field names.
 */
export function toWebhookEventPayload(
  event: unknown
): SlackWebhookEventPayload | null {
  const eventType = EventTypeSchema.safeParse(event);
  if (!eventType.success) {
    return null;
  }

  switch (eventType.data.type) {
    case "app_mention": {
      const parsed = AppMentionEventSchema.safeParse(event);
      if (!parsed.success) {
        return null;
      }

      return {
        type: "app_mention",
        channelId: parsed.data.channel,
        ts: parsed.data.ts,
      };
    }

    // Slack routes direct messages, channel messages, deletions and channel
    // renames through the same event type.
    case "message": {
      const parsed = MessageEventSchema.safeParse(event);
      if (!parsed.success) {
        return null;
      }
      const { channel, channel_type: channelType, subtype } = parsed.data;

      if (channelType === "im") {
        // A direct message that was edited or deleted has nothing to answer.
        if (subtype === "message_changed" || subtype === "message_deleted") {
          return null;
        }

        return {
          type: "direct_message",
          channelId: channel,
          ts: parsed.data.ts,
          userId: parsed.data.user,
        };
      }

      if (channelType !== "channel" && channelType !== "group") {
        return null;
      }

      if (subtype === "channel_name") {
        if (!parsed.data.name) {
          return null;
        }

        return {
          type: "channel_renamed",
          channelId: channel,
          channelName: parsed.data.name,
        };
      }

      if (subtype === "message_deleted") {
        if (!parsed.data.deleted_ts) {
          return null;
        }

        return {
          type: "channel_message_deleted",
          channelId: channel,
          deletedTs: parsed.data.deleted_ts,
          threadTs: parsed.data.thread_ts,
        };
      }

      return {
        type: "channel_message",
        channelId: channel,
        ts: parsed.data.ts,
        threadTs: parsed.data.thread_ts,
      };
    }

    case "channel_created": {
      const parsed = ChannelCreatedEventSchema.safeParse(event);
      if (!parsed.success) {
        return null;
      }

      return {
        type: "channel_created",
        channelId: parsed.data.channel.id,
        contextTeamId: parsed.data.channel.context_team_id,
      };
    }

    case "member_joined_channel": {
      const parsed = MemberJoinedChannelEventSchema.safeParse(event);
      if (!parsed.success) {
        return null;
      }

      return {
        type: "member_joined_channel",
        channelId: parsed.data.channel,
        userId: parsed.data.user,
      };
    }

    case "channel_left":
    case "channel_deleted": {
      const parsed = ChannelGoneEventSchema.safeParse(event);
      if (!parsed.success) {
        return null;
      }

      return { type: parsed.data.type };
    }

    default:
      return null;
  }
}
