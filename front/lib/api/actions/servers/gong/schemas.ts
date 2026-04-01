import { z } from "zod";

// Helper to accept both string and number IDs (Gong API returns numeric IDs)
const idSchema = z.coerce.string();

const GongPartySchema = z
  .object({
    name: z.string().optional().nullable(),
    emailAddress: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    affiliation: z.string().optional().nullable(),
    speakerId: idSchema.optional().nullable(),
  })
  .passthrough();

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

const GongRecordsSchema = z
  .object({
    totalRecords: z.number(),
  })
  .passthrough();

export const GongCallsResponseSchema = z
  .object({
    calls: z.array(GongCallSchema),
    records: GongRecordsSchema.optional().nullable(),
    cursor: z.string().optional().nullable(),
  })
  .passthrough();

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

export const GongTranscriptsResponseSchema = z
  .object({
    callTranscripts: z.array(GongCallTranscriptSchema),
  })
  .passthrough();

export type GongCall = z.infer<typeof GongCallSchema>;
export type GongCallTranscript = z.infer<typeof GongCallTranscriptSchema>;
