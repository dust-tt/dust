import { z } from "zod";

// Helper to accept both string and number IDs (Gong API returns numeric IDs)
const idSchema = z.coerce.string();

const GongPartySchema = z
  .object({
    name: z.string().nullish(),
    emailAddress: z.string().nullish(),
    title: z.string().nullish(),
    affiliation: z.string().nullish(),
    speakerId: idSchema.nullish(),
  })
  .passthrough();

const GongCallSchema = z
  .object({
    id: idSchema,
    url: z.string().nullish(),
    title: z.string().nullish(),
    started: z.string().nullish(),
    duration: z.number().nullish(),
    direction: z.string().nullish(),
    scope: z.string().nullish(),
    media: z.string().nullish(),
    language: z.string().nullish(),
    purpose: z.string().nullish(),
    parties: z.array(GongPartySchema).nullish(),
    content: z
      .object({
        brief: z.string().nullish(),
        keyPoints: z
          .array(z.object({ text: z.string().nullish() }).passthrough())
          .optional()
          .nullable(),
        topics: z
          .array(
            z
              .object({
                name: z.string(),
                duration: z.number().nullish(),
              })
              .passthrough()
          )
          .optional()
          .nullable(),
        callOutcome: z
          .object({
            category: z.string().nullish(),
            name: z.string().nullish(),
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
                    snippet: z.string().nullish(),
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
                name: z.string().nullish(),
                value: z.unknown().nullish(),
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
                comment: z.string().nullish(),
                posted: z.string().nullish(),
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
    records: GongRecordsSchema.nullish(),
    cursor: z.string().nullish(),
  })
  .passthrough();

const GongTranscriptSentenceSchema = z
  .object({
    text: z.string().nullish(),
  })
  .passthrough();

const GongTranscriptSegmentSchema = z
  .object({
    speakerId: idSchema.nullish(),
    topic: z.string().nullish(),
    sentences: z.array(GongTranscriptSentenceSchema).nullish(),
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
