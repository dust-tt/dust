import { z } from "zod";

const ClariUserSchema = z
  .object({
    userId: z.string(),
    userEmail: z.string(),
    isOrganizer: z.boolean().optional(),
    personId: z.union([z.string(), z.number()]).transform(String).optional(),
  })
  .passthrough();

const ClariExternalParticipantSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    personId: z.union([z.string(), z.number()]).transform(String).optional(),
  })
  .passthrough();

const ClariMetricsSchema = z
  .object({
    call_duration: z.number().optional(),
    talk_listen_ratio: z.number().optional(),
    num_questions_asked: z.number().optional(),
  })
  .passthrough();

// calls response

export const ClariCallSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    time: z.string().optional(),
    account_name: z.string().optional(),
    contact_names: z.array(z.string()).optional(),
    users: z.array(ClariUserSchema).optional(),
    externalParticipants: z.array(ClariExternalParticipantSchema).optional(),
    metrics: ClariMetricsSchema.optional(),
    call_review_page_url: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type ClariCall = z.infer<typeof ClariCallSchema>;

export const ClariCallsResponseSchema = z.object({
  calls: z.array(ClariCallSchema),
  pagination: z
    .object({
      matched: z.number().optional(),
      hasMore: z.boolean().optional(),
      nextPageSkip: z.number().optional(),
    })
    .optional(),
});

export type ClariCallsResponse = z.infer<typeof ClariCallsResponseSchema>;

// call-details response

const ClariTranscriptTurnSchema = z
  .object({
    text: z.string(),
    start: z.number().optional(),
    end: z.number().optional(),
    personId: z.union([z.string(), z.number()]).transform(String).optional(),
  })
  .passthrough();

const ClariTopicSchema = z
  .object({
    name: z.string().optional(),
    start_timestamp: z.number().optional(),
    end_timestamp: z.number().optional(),
    summary: z.string().optional(),
  })
  .passthrough();

const ClariActionItemSchema = z
  .object({
    action_item: z.string().optional(),
    speaker_name: z.string().optional(),
    start_timestamp: z.number().optional(),
    end_timestamp: z.number().optional(),
  })
  .passthrough();

const ClariSummarySchema = z
  .object({
    full_summary: z.string().optional(),
    topics_discussed: z.array(ClariTopicSchema).optional(),
    key_action_items: z.array(ClariActionItemSchema).optional(),
  })
  .passthrough();

const ClariCompetitorSentimentSchema = z
  .object({
    competitor_name: z.string().optional(),
    sentiment: z.string().optional(),
    reasoning: z.string().optional(),
    personId: z.union([z.string(), z.number()]).transform(String).optional(),
    turn_start_time: z.number().optional(),
  })
  .passthrough();

export const ClariCallDetailsSchema = ClariCallSchema.extend({
  transcript: z.array(ClariTranscriptTurnSchema).optional(),
  summary: ClariSummarySchema.optional(),
  competitor_sentiments: z.array(ClariCompetitorSentimentSchema).optional(),
});

export type ClariCallDetails = z.infer<typeof ClariCallDetailsSchema>;

export const ClariCallDetailsResponseSchema = z.object({
  call: ClariCallDetailsSchema,
});

export type ClariCallDetailsResponse = z.infer<
  typeof ClariCallDetailsResponseSchema
>;
