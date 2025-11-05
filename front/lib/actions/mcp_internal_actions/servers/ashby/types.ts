import z from "zod";

export const AshbyCandidateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    primaryEmailAddress: z
      .object({
        value: z.string(),
        type: z.string(),
        isPrimary: z.boolean(),
      })
      .optional(),
    primaryPhoneNumber: z
      .object({
        value: z.string(),
        type: z.string(),
        isPrimary: z.boolean(),
      })
      .optional(),
    socialLinks: z
      .array(
        z.object({
          type: z.string(),
          value: z.string().optional(),
          url: z.string().optional(),
        })
      )
      .optional(),
    createdAt: z.string(),
    applicationIds: z.array(z.string()).optional(),
  })
  .passthrough();

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

export const AshbyApplicationInfoResponseSchema = z
  .object({
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
      .passthrough()
      .optional()
      .nullable(),
    currentInterviewStage: z
      .object({
        id: z.string(),
        title: z.string(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough();

export type AshbyApplicationInfoResponse = z.infer<
  typeof AshbyApplicationInfoResponseSchema
>;

export const AshbyFeedbackFormDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  isArchived: z.boolean().optional(),
});

export type AshbyFeedbackFormDefinition = z.infer<
  typeof AshbyFeedbackFormDefinitionSchema
>;

export const AshbyFeedbackFormDefinitionListResponseSchema = z.object({
  results: z.array(AshbyFeedbackFormDefinitionSchema),
  moreDataAvailable: z.boolean().optional(),
});

export type AshbyFeedbackFormDefinitionListResponse = z.infer<
  typeof AshbyFeedbackFormDefinitionListResponseSchema
>;

export const AshbyInterviewInfoRequestSchema = z.object({
  interviewId: z.string(),
});

export type AshbyInterviewInfoRequest = z.infer<
  typeof AshbyInterviewInfoRequestSchema
>;

export const AshbyInterviewInfoResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    feedbackFormDefinitionId: z.string().optional().nullable(),
    isArchived: z.boolean().optional(),
  })
  .passthrough();

export type AshbyInterviewInfoResponse = z.infer<
  typeof AshbyInterviewInfoResponseSchema
>;

export const AshbyInterviewListRequestSchema = z.object({
  applicationId: z.string().optional(),
});

export type AshbyInterviewListRequest = z.infer<
  typeof AshbyInterviewListRequestSchema
>;

export const AshbyInterviewListResponseSchema = z.object({
  results: z.array(AshbyInterviewInfoResponseSchema),
  moreDataAvailable: z.boolean().optional(),
});

export type AshbyInterviewListResponse = z.infer<
  typeof AshbyInterviewListResponseSchema
>;
