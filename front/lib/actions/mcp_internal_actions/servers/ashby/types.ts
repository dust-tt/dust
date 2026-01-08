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

export const AshbyReportSynchronousRequestSchema = z.object({
  reportId: z.string().uuid(),
});

export type AshbyReportSynchronousRequest = z.infer<
  typeof AshbyReportSynchronousRequestSchema
>;

export const AshbyReportSynchronousResponseSchema = z.object({
  success: z.boolean(),
  results: z.object({
    requestId: z.string(),
    status: z.string(),
    reportData: z.object({
      data: z.array(z.array(z.union([z.string(), z.number()]))),
      columnNames: z.array(z.string()),
      metadata: z
        .object({
          updatedAt: z.string(),
          title: z.string(),
        })
        .passthrough(),
    }),
    failureReason: z.string().nullable(),
  }),
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

export const AshbyApplicationFeedbackListRequestSchema = z.object({
  applicationId: z.string(),
});

export type AshbyApplicationFeedbackListRequest = z.infer<
  typeof AshbyApplicationFeedbackListRequestSchema
>;

export const AshbyFeedbackSubmissionSchema = z
  .object({
    id: z.string(),
    submittedAt: z.string().optional().nullable(),
    submittedByUser: z
      .object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
      })
      .optional()
      .nullable(),
    interviewId: z.string().optional().nullable(),
    interviewEventId: z.string().optional().nullable(),
    formDefinition: z
      .object({
        sections: z
          .array(
            z.object({
              fields: z.array(
                z.object({
                  isRequired: z.boolean(),
                  field: z.object({
                    id: z.string(),
                    type: z.string(),
                    path: z.string(),
                    title: z.string(),
                    humanReadablePath: z.string().optional(),
                    isNullable: z.boolean(),
                    selectableValues: z
                      .array(
                        z.object({
                          label: z.string(),
                          value: z.string(),
                        })
                      )
                      .optional(),
                  }),
                })
              ),
            })
          )
          .optional(),
      })
      .passthrough(),
    submittedValues: z.record(z.unknown()).optional(),
    feedbackFormDefinitionId: z.string().optional(),
    applicationId: z.string().optional(),
    applicationHistoryId: z.string().optional(),
  })
  .passthrough();

export type AshbyFeedbackSubmission = z.infer<
  typeof AshbyFeedbackSubmissionSchema
>;

export const AshbyApplicationFeedbackListResponseSchema = z.object({
  results: z.array(AshbyFeedbackSubmissionSchema),
});

export type AshbyApplicationFeedbackListResponse = z.infer<
  typeof AshbyApplicationFeedbackListResponseSchema
>;

export const AshbyCandidateCreateNoteRequestSchema = z.object({
  candidateId: z.string(),
  note: z.object({
    type: z.literal("text/html"),
    value: z.string(),
  }),
});

export type AshbyCandidateCreateNoteRequest = z.infer<
  typeof AshbyCandidateCreateNoteRequestSchema
>;

export const AshbyCandidateCreateNoteResponseSchema = z.object({
  success: z.boolean(),
  results: z
    .object({
      id: z.string(),
    })
    .passthrough(),
});

export type AshbyCandidateCreateNoteResponse = z.infer<
  typeof AshbyCandidateCreateNoteResponseSchema
>;

export const AshbyApplicationInfoRequestSchema = z.object({
  applicationId: z.string(),
});

export type AshbyApplicationInfoRequest = z.infer<
  typeof AshbyApplicationInfoRequestSchema
>;

export const AshbyApplicationStatusSchema = z.enum(["active", "hired", "archived"]);

export type AshbyApplicationStatus = z.infer<typeof AshbyApplicationStatusSchema>;

export const AshbyApplicationInfoResponseSchema = z.object({
  success: z.boolean(),
  results: z
    .object({
      id: z.string(),
      status: AshbyApplicationStatusSchema,
      candidateId: z.string(),
    })
    .passthrough(),
});

export type AshbyApplicationInfoResponse = z.infer<
  typeof AshbyApplicationInfoResponseSchema
>;
