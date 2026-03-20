// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import type { DustMimeType } from "@dust-tt/client";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES_VALUES } from "@dust-tt/client";
import { z } from "zod";

import type { SupportedNonImageContentType } from "../../files";
import { getSupportedNonImageMimeTypes } from "../../files";

const AgentMentionSchema = z.object({
  // TODO: add a type="agent" but this requires to be backwards compatible with the old API, not doing for now
  configurationId: z.string(),
});
const UserMentionSchema = z.object({
  type: z.literal("user"),
  userId: z.string(),
});

const UserMessageOriginSchema = z.enum([
  "web",
  "agent_sidekick",
  "project_kickoff",
  "extension",
  "reinforced_agent_notification",
]);

export const MessageBaseSchema = z.object({
  content: z.string().min(1),
  mentions: z.array(z.union([AgentMentionSchema, UserMentionSchema])),
  context: z.object({
    timezone: z.string(),
    profilePictureUrl: z.string().nullable(),
    clientSideMCPServerIds: z.array(z.string()).optional(),
    selectedMCPServerViewIds: z.array(z.string()).optional(),
    selectedSkillIds: z.array(z.string()).optional(),
    originMessageId: z.string().optional(),
    origin: UserMessageOriginSchema.optional(),
  }),
});

export const InternalPostMessagesRequestBodySchema = MessageBaseSchema.extend({
  skipToolsValidation: z.boolean().optional(),
});

const ContentFragmentBaseSchema = z.object({
  title: z.string(),
  url: z.string().nullable().optional(),
  supersededContentFragmentId: z.string().nullable().optional(),
});

export const getSupportedInlinedContentType = () => {
  const values = getSupportedNonImageMimeTypes();
  return z.enum(values as [string, ...string[]]);
};

const allContentNodeValues = [
  ...INTERNAL_MIME_TYPES_VALUES,
  ...getSupportedNonImageMimeTypes(),
];
export const getSupportedContentNodeContentTypeSchema = () => {
  return z.enum(allContentNodeValues as [string, ...string[]]);
};

export type SupportedContentNodeContentType =
  | DustMimeType
  | SupportedNonImageContentType;

export type SupportedInlinedContentFragmentTypeSchema =
  SupportedNonImageContentType;

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ContentFragmentInputWithContentSchema = ContentFragmentBaseSchema.extend({
  content: z.string(),
  contentType: getSupportedInlinedContentType(),
});

export type ContentFragmentInputWithInlinedContent = z.infer<
  typeof ContentFragmentInputWithContentSchema
>;

const ContentFragmentInputWithContentNodeSchema =
  ContentFragmentBaseSchema.extend({
    nodeId: z.string(),
    nodeDataSourceViewId: z.string(),
  });

export type ContentFragmentInputWithContentNode = z.infer<
  typeof ContentFragmentInputWithContentNodeSchema
>;

const ContentFragmentInputWithFileIdSchema = ContentFragmentBaseSchema.extend({
  fileId: z.string(),
});

export type ContentFragmentInputWithFileIdType = z.infer<
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

export const InternalPostContentFragmentRequestBodySchema = z
  .object({
    context: z.object({
      profilePictureUrl: z.string().nullable(),
    }),
  })
  .and(
    z.union([
      ContentFragmentInputWithFileIdSchema,
      ContentFragmentInputWithContentNodeSchema,
    ])
  );

export type InternalPostContentFragmentRequestBodyType = z.infer<
  typeof InternalPostContentFragmentRequestBodySchema
>;

export const InternalPostConversationsRequestBodySchema = z.object({
  title: z.string().nullable(),
  visibility: z.enum(["unlisted", "deleted", "test"]),
  spaceId: z.string().nullable(),
  message: MessageBaseSchema.nullable(),
  contentFragments: z.array(InternalPostContentFragmentRequestBodySchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
  skipToolsValidation: z.boolean().optional(),
});

export const InternalPostBuilderSuggestionsRequestBodySchema =
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("name"),
      inputs: z.object({ instructions: z.string(), description: z.string() }),
    }),
    z.object({
      type: z.literal("emoji"),
      inputs: z.object({ instructions: z.string() }),
    }),
    z.object({
      type: z.literal("instructions"),
      inputs: z.object({
        current_instructions: z.string(),
        former_suggestions: z.array(z.string()),
      }),
    }),
    z.object({
      type: z.literal("description"),
      inputs: z.object({ instructions: z.string(), name: z.string() }),
    }),
    z.object({
      type: z.literal("tags"),
      inputs: z.object({
        instructions: z.string(),
        description: z.string(),
        isAdmin: z.boolean(),
        tags: z.array(z.string()),
      }),
    }),
  ]);

export type BuilderSuggestionsRequestType = z.infer<
  typeof InternalPostBuilderSuggestionsRequestBodySchema
>;

export type BuilderSuggestionInputType =
  BuilderSuggestionsRequestType["inputs"];

export type BuilderSuggestionType = BuilderSuggestionsRequestType["type"];

const BuilderTextSuggestionTypeSchema = z
  .array(z.string())
  .nullable()
  .optional();

export type BuilderTextSuggestionsType = z.infer<
  typeof BuilderTextSuggestionTypeSchema
>;

export const BuilderSuggestionsResponseBodySchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ok"),
      suggestions: BuilderTextSuggestionTypeSchema,
    }),
    z.object({
      status: z.literal("unavailable"),
      reason: z.enum(["user_not_finished", "irrelevant"]),
    }),
  ]
);

export type BuilderSuggestionsType = z.infer<
  typeof BuilderSuggestionsResponseBodySchema
>;

export const BuilderEmojiSuggestionsResponseBodySchema = z.object({
  suggestions: z.array(
    z.object({ emoji: z.string(), backgroundColor: z.string() })
  ),
});
export type BuilderEmojiSuggestionsType = z.infer<
  typeof BuilderEmojiSuggestionsResponseBodySchema
>;

export const InternalPostBuilderGenerateSchemaRequestBodySchema = z.object({
  instructions: z.string(),
});
