import { z } from "zod";

// Helper to accept both string and number IDs (Gong API returns numeric IDs)
const idSchema = z.coerce.string();

// Party/participant schema - only fields used in rendering
const GongPartySchema = z
  .object({
    name: z.string().optional().nullable(),
    emailAddress: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    affiliation: z.string().optional().nullable(),
    speakerId: idSchema.optional().nullable(),
  })
  .passthrough();

// Call schema - only fields used in rendering
const GongCallSchema = z
  .object({
    id: idSchema,
    url: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    started: z.string().optional().nullable(),
    duration: z.number().optional().nullable(),
    direction: z.string().optional().nullable(),
    scope: z.string().optional().nullable(),
    media: z.string().optional().nullable(),
    language: z.string().optional().nullable(),
    purpose: z.string().optional().nullable(),
    parties: z.array(GongPartySchema).optional().nullable(),
    content: z
      .object({
        brief: z.string().optional().nullable(),
        keyPoints: z
          .array(
            z.object({ text: z.string().optional().nullable() }).passthrough()
          )
          .optional()
          .nullable(),
        topics: z
          .array(
            z
              .object({
                name: z.string(),
                duration: z.number().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        callOutcome: z
          .object({
            category: z.string().optional().nullable(),
            name: z.string().optional().nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),
        pointsOfInterest: z
          .object({
            actionItems: z
              .array(
                z
                  .object({
                    snippet: z.string().optional().nullable(),
                  })
                  .passthrough()
              )
              .optional()
              .nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    interaction: z
      .object({
        interactionStats: z
          .array(
            z
              .object({
                name: z.string().optional().nullable(),
                value: z.unknown().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    collaboration: z
      .object({
        publicComments: z
          .array(
            z
              .object({
                comment: z.string().optional().nullable(),
                posted: z.string().optional().nullable(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough();

// Pagination schema
const GongRecordsSchema = z
  .object({
    totalRecords: z.number(),
  })
  .passthrough();

// Response schema for calls endpoints
export const GongCallsResponseSchema = z
  .object({
    calls: z.array(GongCallSchema),
    records: GongRecordsSchema.optional().nullable(),
    cursor: z.string().optional().nullable(),
  })
  .passthrough();

// Transcript schemas
const GongTranscriptSentenceSchema = z
  .object({
    text: z.string().optional().nullable(),
  })
  .passthrough();

const GongTranscriptSegmentSchema = z
  .object({
    speakerId: idSchema.optional().nullable(),
    topic: z.string().optional().nullable(),
    sentences: z.array(GongTranscriptSentenceSchema).optional().nullable(),
  })
  .passthrough();

const GongCallTranscriptSchema = z
  .object({
    callId: idSchema,
    transcript: z.array(GongTranscriptSegmentSchema),
  })
  .passthrough();

// Response schema for transcripts endpoint
export const GongTranscriptsResponseSchema = z
  .object({
    callTranscripts: z.array(GongCallTranscriptSchema),
  })
  .passthrough();

// Export types inferred from schemas
export type GongCall = z.infer<typeof GongCallSchema>;
export type GongCallTranscript = z.infer<typeof GongCallTranscriptSchema>;
export type GongTranscriptSentence = z.infer<
  typeof GongTranscriptSentenceSchema
>;
