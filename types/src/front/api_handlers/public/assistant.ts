import * as t from "io-ts";

export const PublicPostMessagesRequestBodySchema = t.intersection([
  t.type({
    content: t.string,
    mentions: t.array(t.type({ configurationId: t.string })),
    context: t.type({
      timezone: t.string,
      username: t.string,
      fullName: t.union([t.string, t.null]),
      email: t.union([t.string, t.null]),
      profilePictureUrl: t.union([t.string, t.null]),
    }),
  }),
  t.partial({
    isSync: t.boolean,
  }),
]);

export const PublicPostContentFragmentRequestBodySchema = t.type({
  title: t.string,
  content: t.string,
  url: t.union([t.string, t.null]),
  contentType: t.union([
    t.literal("slack_thread_content"),
    t.literal("file_attachment"),
  ]),
  context: t.union([
    t.type({
      profilePictureUrl: t.union([t.string, t.null]),
      fullName: t.union([t.string, t.null]),
      email: t.union([t.string, t.null]),
      username: t.union([t.string, t.null]),
    }),
    t.null,
  ]),
});

export const PublicPostConversationsRequestBodySchema = t.intersection([
  t.type({
    title: t.union([t.string, t.null]),
    visibility: t.union([
      t.literal("unlisted"),
      t.literal("workspace"),
      t.literal("deleted"),
      t.literal("test"),
    ]),
    message: t.union([PublicPostMessagesRequestBodySchema, t.undefined]),
    contentFragment: t.union([
      PublicPostContentFragmentRequestBodySchema,
      t.undefined,
    ]),
  }),
  t.partial({ isSync: t.union([t.boolean, t.undefined]) }),
]);
