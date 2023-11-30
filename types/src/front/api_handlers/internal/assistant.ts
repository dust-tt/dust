import * as t from "io-ts";

export const InternalPostMessagesRequestBodySchema = t.type({
  content: t.string,
  mentions: t.array(
    t.union([
      t.type({ configurationId: t.string }),
      t.type({
        provider: t.string,
        providerId: t.string,
      }),
    ])
  ),
  context: t.type({
    timezone: t.string,
    profilePictureUrl: t.union([t.string, t.null]),
  }),
});

export const InternalPostContentFragmentRequestBodySchema = t.type({
  title: t.string,
  content: t.string,
  url: t.union([t.string, t.null]),
  contentType: t.union([
    t.literal("slack_thread_content"),
    t.literal("file_attachment"),
  ]),
  context: t.type({
    profilePictureUrl: t.union([t.string, t.null]),
  }),
});

export const InternalPostConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
  ]),
  message: t.union([InternalPostMessagesRequestBodySchema, t.null]),
  contentFragment: t.union([
    InternalPostContentFragmentRequestBodySchema,
    t.undefined,
  ]),
});
