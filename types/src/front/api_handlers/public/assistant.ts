import * as t from "io-ts";
import moment from "moment-timezone";

import { getSupportedContentFragmentTypeCodec } from "../../content_fragment";

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
        t.literal("gsheet"),
        t.literal("zapier"),
        t.literal("make"),
        t.literal("zendesk"),
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
  contentType: getSupportedContentFragmentTypeCodec(),
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
