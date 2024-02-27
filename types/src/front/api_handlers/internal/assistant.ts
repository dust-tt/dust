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
    t.literal("test"),
  ]),
  message: t.union([InternalPostMessagesRequestBodySchema, t.null]),
  contentFragment: t.union([
    InternalPostContentFragmentRequestBodySchema,
    t.undefined,
  ]),
});

export const InternalPostBuilderSuggestionsRequestBodySchema = t.union([
  t.type({
    type: t.literal("name"),
    inputs: t.type({ instructions: t.string, description: t.string }),
  }),
  t.type({
    type: t.literal("instructions"),
    inputs: t.type({ current_instructions: t.string }),
  }),
]);

export type BuilderSuggestionsRequestType = t.TypeOf<
  typeof InternalPostBuilderSuggestionsRequestBodySchema
>;

export const BuilderSuggestionsResponseBodySchema = t.union([
  t.type({
    status: t.literal("ok"),
    suggestions: t.array(t.string),
  }),
  t.type({
    status: t.literal("unavailable"),
    reason: t.union([
      t.literal("user_not_finished"), // The user has not finished inputing data for suggestions to make sense
      t.literal("irrelevant"),
    ]),
  }),
]);

export type BuilderSuggestionsType = t.TypeOf<
  typeof BuilderSuggestionsResponseBodySchema
>;
