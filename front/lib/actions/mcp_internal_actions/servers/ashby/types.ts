import z from "zod";

export const AshbyCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  primaryEmailAddress: z
    .object({
      value: z.string(),
      type: z.string(),
    })
    .optional(),
  phoneNumbers: z
    .array(
      z.object({
        value: z.string(),
        type: z.string(),
      })
    )
    .optional(),
  socialLinks: z
    .array(
      z.object({
        value: z.string(),
        type: z.string(),
      })
    )
    .optional(),
  createdAt: z.string(),
  applicationIds: z.array(z.string()).optional(),
});

export type AshbyCandidate = z.infer<typeof AshbyCandidateSchema>;

export const AshbyCandidateListResponseSchema = z.object({
  results: z.array(AshbyCandidateSchema),
  nextCursor: z.string().optional(),
});

export type AshbyCandidateListResponse = z.infer<
  typeof AshbyCandidateListResponseSchema
>;

export const AshbyFeedbackSubmitRequestSchema = z.object({
  applicationId: z.string().uuid(),
  feedbackFormDefinitionId: z.string().uuid(),
  feedbackForm: z.record(z.unknown()),
  userId: z.string().uuid().optional(),
});

export type AshbyFeedbackSubmitRequest = z.infer<
  typeof AshbyFeedbackSubmitRequestSchema
>;

export const AshbyFeedbackSubmitResponseSchema = z.object({
  submittedValues: z.record(z.unknown()),
});

export type AshbyFeedbackSubmitResponse = z.infer<
  typeof AshbyFeedbackSubmitResponseSchema
>;

export const AshbyReportSynchronousRequestSchema = z.object({
  reportId: z.string().uuid(),
});

export type AshbyReportSynchronousRequest = z.infer<
  typeof AshbyReportSynchronousRequestSchema
>;

export const AshbyReportSynchronousResponseSchema = z.object({
  data: z.array(z.record(z.unknown())),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    })
  ),
});

export type AshbyReportSynchronousResponse = z.infer<
  typeof AshbyReportSynchronousResponseSchema
>;

export const AshbyCandidateSearchRequestSchema = z.object({
  email: z.string().optional(),
  name: z.string().optional(),
});

export type AshbyCandidateSearchRequest = z.infer<
  typeof AshbyCandidateSearchRequestSchema
>;

export const AshbyCandidateSearchResponseSchema = z.object({
  results: z.array(AshbyCandidateSchema),
});

export type AshbyCandidateSearchResponse = z.infer<
  typeof AshbyCandidateSearchResponseSchema
>;

export const AshbyCandidateInfoRequestSchema = z.object({
  candidateId: z.string(),
});

export type AshbyCandidateInfoRequest = z.infer<
  typeof AshbyCandidateInfoRequestSchema
>;

export const AshbyCandidateInfoResponseSchema = AshbyCandidateSchema;

export type AshbyCandidateInfoResponse = z.infer<
  typeof AshbyCandidateInfoResponseSchema
>;

export const AshbyApplicationInfoRequestSchema = z.object({
  applicationId: z.string(),
});

export type AshbyApplicationInfoRequest = z.infer<
  typeof AshbyApplicationInfoRequestSchema
>;

export const AshbyApplicationInfoResponseSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  jobId: z.string(),
  status: z.string().optional(),
  archiveReason: z
    .object({
      id: z.string(),
      text: z.string(),
      reasonType: z.string(),
    })
    .optional()
    .nullable(),
  currentInterviewStage: z
    .object({
      id: z.string(),
      title: z.string(),
    })
    .optional()
    .nullable(),
});

export type AshbyApplicationInfoResponse = z.infer<
  typeof AshbyApplicationInfoResponseSchema
>;
