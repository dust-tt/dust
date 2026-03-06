import { z } from "zod";

export const BUTLER_SUGGESTION_TYPES = [
  "rename_title",
  "call_agent",
  "create_frame",
] as const;

export type ButlerSuggestionType = (typeof BUTLER_SUGGESTION_TYPES)[number];

export const BUTLER_SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "dismissed",
] as const;

export type ButlerSuggestionStatus =
  (typeof BUTLER_SUGGESTION_STATUSES)[number];

// Per-type metadata schemas (no suggestionType inside — that's the top-level discriminator).
const RenameTitleMetadataSchema = z.object({
  suggestedTitle: z.string(),
});

// Shared schema for suggestion types that invoke an agent with a prompt.
const AgentInvocationMetadataSchema = z.object({
  agentSId: z.string(),
  agentName: z.string(),
  prompt: z.string(),
});

export type RenameTitleMetadata = z.infer<typeof RenameTitleMetadataSchema>;
export type CallAgentMetadata = z.infer<typeof AgentInvocationMetadataSchema>;
export type CreateFrameMetadata = z.infer<typeof AgentInvocationMetadataSchema>;

// Discriminated union linking suggestionType to its metadata shape.
export const ButlerSuggestionDataSchema = z.discriminatedUnion(
  "suggestionType",
  [
    z.object({
      suggestionType: z.literal("rename_title"),
      metadata: RenameTitleMetadataSchema,
      status: z.enum(BUTLER_SUGGESTION_STATUSES),
    }),
    z.object({
      suggestionType: z.literal("call_agent"),
      metadata: AgentInvocationMetadataSchema,
      status: z.enum(BUTLER_SUGGESTION_STATUSES),
    }),
    z.object({
      suggestionType: z.literal("create_frame"),
      metadata: AgentInvocationMetadataSchema,
      status: z.enum(BUTLER_SUGGESTION_STATUSES),
    }),
  ]
);

export type ButlerSuggestionData = z.infer<typeof ButlerSuggestionDataSchema>;

// Union of all metadata payload shapes (useful for the Sequelize model field type).
export type ButlerSuggestionMetadata =
  | RenameTitleMetadata
  | CallAgentMetadata
  | CreateFrameMetadata;

export function parseButlerSuggestionData(data: unknown): ButlerSuggestionData {
  return ButlerSuggestionDataSchema.parse(data);
}

// Base fields shared by all suggestion types.
const BaseButlerSuggestionPublicSchema = z.object({
  sId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  sourceMessageSId: z.string(),
  resultMessageSId: z.string().nullable(),
  status: z.enum(BUTLER_SUGGESTION_STATUSES),
});

// Full public type = base fields ∩ discriminated (suggestionType + metadata).
export const ButlerSuggestionPublicSchema =
  BaseButlerSuggestionPublicSchema.and(ButlerSuggestionDataSchema);

export type ButlerSuggestionPublicType = z.infer<
  typeof ButlerSuggestionPublicSchema
>;

// Narrowed convenience types.
export type RenameTitleButlerSuggestion = Extract<
  ButlerSuggestionPublicType,
  { suggestionType: "rename_title" }
>;

export type CallAgentButlerSuggestion = Extract<
  ButlerSuggestionPublicType,
  { suggestionType: "call_agent" }
>;

export type CreateFrameButlerSuggestion = Extract<
  ButlerSuggestionPublicType,
  { suggestionType: "create_frame" }
>;
