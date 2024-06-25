import * as t from "io-ts";
import moment from "moment-timezone";

// Custom codec to validate the timezone
const Timezone = t.refinement(
  t.string,
  (s) => moment.tz.names().includes(s),
  "Timezone"
);

export const PublicPostMessagesRequestBodySchema = t.intersection([
  t.type({
    content: t.string,
    mentions: t.array(t.type({ configurationId: t.string })),
    context: t.type({
      timezone: Timezone,
      username: t.string,
      fullName: t.union([t.string, t.null]),
      email: t.union([t.string, t.null]),
      profilePictureUrl: t.union([t.string, t.null]),
      origin: t.union([
        t.literal("slack"),
        t.literal("web"),
        t.literal("api"),
        t.null,
        t.undefined,
      ]),
    }),
  }),
  t.partial({
    blocking: t.boolean,
  }),
]);

export const PublicPostContentFragmentRequestBodySchema = t.type({
  title: t.string,
  content: t.string,
  url: t.union([t.string, t.null]),
  contentType: t.union([
    t.literal("text/plain"),
    t.literal("text/csv"),
    t.literal("text/markdown"),
    t.literal("text/tsv"),
    t.literal("text/comma-separated-values"),
    t.literal("text/tab-separated-values"),
    t.literal("application/pdf"),
    t.literal("image/png"),
    t.literal("image/jpeg"),
    t.literal("image/jpg"),
    t.literal("dust-application/slack")
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
  t.partial({ blocking: t.boolean }),
]);
