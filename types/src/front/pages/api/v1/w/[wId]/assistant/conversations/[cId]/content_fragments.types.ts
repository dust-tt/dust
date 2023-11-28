import * as t from "io-ts";

export const PostContentFragmentRequestBodySchema = t.type({
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
