import { INTERNAL_MIME_TYPES_VALUES } from "@dust-tt/client";
import * as t from "io-ts";

import { getSupportedNonImageMimeTypes } from "../../files";

export const MessageBaseSchema = t.type({
  content: t.refinement(
    t.string,
    (s): s is string => s.length > 0,
    "NonEmptyString"
  ),
  mentions: t.array(t.type({ configurationId: t.string })),
  context: t.intersection([
    t.type({
      timezone: t.string,
      profilePictureUrl: t.union([t.string, t.null]),
    }),
    t.partial({
      clientSideMCPServerIds: t.array(t.string),
      selectedMCPServerViewIds: t.array(t.string),
      originMessageId: t.string,
    }),
  ]),
});

export const InternalPostMessagesRequestBodySchema = MessageBaseSchema;

const ContentFragmentBaseSchema = t.intersection([
  t.type({
    title: t.string,
  }),
  t.partial({
    url: t.union([t.string, t.null]),
    supersededContentFragmentId: t.union([t.string, t.null]),
  }),
]);

export const getSupportedInlinedContentType = () => {
  const [first, second, ...rest] = getSupportedNonImageMimeTypes();
  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
};

const [first, second, ...rest] = [
  ...INTERNAL_MIME_TYPES_VALUES,
  ...getSupportedNonImageMimeTypes(),
];
export const getSupportedContentNodeContentTypeSchema = () => {
  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
};

export type SupportedContentNodeContentType = t.TypeOf<
  ReturnType<typeof getSupportedContentNodeContentTypeSchema>
>;

export type SupportedInlinedContentFragmentTypeSchema = t.TypeOf<
  ReturnType<typeof getSupportedInlinedContentType>
>;

export const isSupportedInlinedFragmentContentType = (
  contentType: string
): contentType is SupportedInlinedContentFragmentTypeSchema => {
  return (
    [
      ...INTERNAL_MIME_TYPES_VALUES,
      ...getSupportedNonImageMimeTypes(),
    ] as string[]
  ).includes(contentType);
};

export const isSupportedContentNodeFragmentContentType = (
  contentType: string
): contentType is SupportedContentNodeContentType => {
  return (
    [
      ...INTERNAL_MIME_TYPES_VALUES,
      ...getSupportedNonImageMimeTypes(),
    ] as string[]
  ).includes(contentType);
};

const ContentFragmentInputWithContentSchema = t.intersection([
  ContentFragmentBaseSchema,
  t.type({
    content: t.string,
    contentType: getSupportedInlinedContentType(),
  }),
]);

export type ContentFragmentInputWithInlinedContent = t.TypeOf<
  typeof ContentFragmentInputWithContentSchema
>;

const ContentFragmentInputWithContentNodeSchema = t.intersection([
  ContentFragmentBaseSchema,
  t.type({
    nodeId: t.string,
    nodeDataSourceViewId: t.string,
  }),
]);

export type ContentFragmentInputWithContentNode = t.TypeOf<
  typeof ContentFragmentInputWithContentNodeSchema
>;

const ContentFragmentInputWithFileIdSchema = t.intersection([
  ContentFragmentBaseSchema,
  t.type({
    fileId: t.string,
  }),
]);

export type ContentFragmentInputWithFileIdType = t.TypeOf<
  typeof ContentFragmentInputWithFileIdSchema
>;

export type ContentFragmentInputType =
  | ContentFragmentInputWithInlinedContent
  | ContentFragmentInputWithFileIdType
  | ContentFragmentInputWithContentNode;

export function isContentFragmentInput(
  fragment: Omit<ContentFragmentInputType, "contentType"> & {
    contentType?: string | undefined | null;
  }
): fragment is ContentFragmentInputType {
  return (
    isContentFragmentInputWithInlinedContent(fragment) ||
    isContentFragmentInputWithFileId(fragment) ||
    isContentFragmentInputWithContentNode(fragment)
  );
}

export function isContentFragmentInputWithInlinedContent(
  fragment: Omit<ContentFragmentInputType, "contentType"> & {
    contentType?: string | undefined | null;
  }
): fragment is ContentFragmentInputWithInlinedContent {
  return (
    "content" in fragment &&
    !!fragment.contentType &&
    isSupportedInlinedFragmentContentType(fragment.contentType)
  );
}

export function isContentFragmentInputWithFileId(
  fragment: Omit<ContentFragmentInputType, "contentType">
): fragment is ContentFragmentInputWithFileIdType {
  return "fileId" in fragment;
}

export function isContentFragmentInputWithContentNode(
  fragment: Omit<ContentFragmentInputType, "contentType">
): fragment is ContentFragmentInputWithContentNode {
  return "nodeId" in fragment && "nodeDataSourceViewId" in fragment;
}

export const InternalPostContentFragmentRequestBodySchema = t.intersection([
  t.type({
    context: t.type({
      profilePictureUrl: t.union([t.string, t.null]),
    }),
  }),
  t.union([
    ContentFragmentInputWithFileIdSchema,
    ContentFragmentInputWithContentNodeSchema,
  ]),
]);

export type InternalPostContentFragmentRequestBodyType = t.TypeOf<
  typeof InternalPostContentFragmentRequestBodySchema
>;

export const InternalPostConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("deleted"),
    t.literal("test"),
  ]),
  message: t.union([MessageBaseSchema, t.null]),
  contentFragments: t.array(InternalPostContentFragmentRequestBodySchema),
});

export const InternalPostBuilderSuggestionsRequestBodySchema = t.union([
  t.type({
    type: t.literal("name"),
    inputs: t.type({ instructions: t.string, description: t.string }),
  }),
  t.type({
    type: t.literal("emoji"),
    inputs: t.type({ instructions: t.string }),
  }),
  t.type({
    type: t.literal("autocompletion"),
    inputs: t.type({
      description: t.union([t.null, t.string]),
      instructions: t.string,
      name: t.union([t.null, t.string]),
      tools: t.string, // Stringified array of {name: string, description: string}.
    }),
  }),
  t.type({
    type: t.literal("instructions"),
    inputs: t.type({
      current_instructions: t.string,
      former_suggestions: t.array(t.string),
    }),
  }),
  t.type({
    type: t.literal("description"),
    inputs: t.type({ instructions: t.string, name: t.string }),
  }),
  t.type({
    type: t.literal("tags"),
    inputs: t.type({
      instructions: t.string,
      description: t.string,
      isAdmin: t.boolean,
      tags: t.array(t.string),
    }),
  }),
]);

export type BuilderSuggestionsRequestType = t.TypeOf<
  typeof InternalPostBuilderSuggestionsRequestBodySchema
>;

export const BuilderSuggestionsResponseBodySchema = t.union([
  t.type({
    status: t.literal("ok"),
    suggestions: t.union([t.array(t.string), t.null, t.undefined]),
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

export const BuilderEmojiSuggestionsResponseBodySchema = t.type({
  suggestions: t.array(t.type({ emoji: t.string, backgroundColor: t.string })),
});
export type BuilderEmojiSuggestionsType = t.TypeOf<
  typeof BuilderEmojiSuggestionsResponseBodySchema
>;

export const InternalPostBuilderGenerateSchemaRequestBodySchema = t.type({
  instructions: t.string,
});
