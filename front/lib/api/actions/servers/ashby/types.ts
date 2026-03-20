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
  results: z
    .union([
      z.object({
        requestId: z.string(),
        status: z.literal("complete"),
        reportData: z.object({
          data: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
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
      z.object({
        requestId: z.string(),
        status: z.enum(["failed", "in_progress"]),
        reportData: z.null(),
        failureReason: z.string().nullable(),
      }),
    ])
    .optional(),
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
  results: z.array(AshbyCandidateSchema).optional(),
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
    submittedAt: z.string().nullish(),
    submittedByUser: z
      .object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
      })
      .optional()
      .nullable(),
    interviewId: z.string().nullish(),
    interviewEventId: z.string().nullish(),
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

export const AshbyCandidateListNotesRequestSchema = z.object({
  candidateId: z.string(),
});

export type AshbyCandidateListNotesRequest = z.infer<
  typeof AshbyCandidateListNotesRequestSchema
>;

export const AshbyCandidateNoteSchema = z
  .object({
    id: z.string(),
    content: z.string().nullish(),
    createdAt: z.string(),
    author: z
      .object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().nullable(),
      })
      .optional()
      .nullable(),
  })
  .passthrough();

export type AshbyCandidateNote = z.infer<typeof AshbyCandidateNoteSchema>;

export const AshbyCandidateListNotesResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(AshbyCandidateNoteSchema),
});

export type AshbyCandidateListNotesResponse = z.infer<
  typeof AshbyCandidateListNotesResponseSchema
>;

export const AshbyApplicationInfoRequestSchema = z.object({
  applicationId: z.string(),
});

export type AshbyApplicationInfoRequest = z.infer<
  typeof AshbyApplicationInfoRequestSchema
>;

export const AshbyApplicationStatusSchema = z.enum([
  "Hired",
  "Archived",
  "Active",
  "Lead",
]);

export type AshbyApplicationStatus = z.infer<
  typeof AshbyApplicationStatusSchema
>;

export const AshbyApplicationInfoResponseSchema = z.object({
  success: z.boolean(),
  results: z
    .object({
      id: z.string(),
      status: AshbyApplicationStatusSchema,
      job: z.object({ id: z.string() }).passthrough().optional(),
      candidateId: z.string().optional(),
    })
    .passthrough(),
});

export type AshbyApplicationInfoResponse = z.infer<
  typeof AshbyApplicationInfoResponseSchema
>;

// Job list

export const AshbyJobSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
  })
  .passthrough();

export type AshbyJob = z.infer<typeof AshbyJobSchema>;

export const AshbyJobListResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(AshbyJobSchema),
  moreDataAvailable: z.boolean().optional(),
  nextCursor: z.string().optional(),
});

export type AshbyJobListResponse = z.infer<typeof AshbyJobListResponseSchema>;

// User search

export const AshbyUserSearchRequestSchema = z.object({
  email: z.string(),
});

export type AshbyUserSearchRequest = z.infer<
  typeof AshbyUserSearchRequestSchema
>;

export const AshbyUserSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    globalRole: z.string(),
    isEnabled: z.boolean(),
  })
  .passthrough();

export type AshbyUser = z.infer<typeof AshbyUserSchema>;

export const AshbyUserSearchResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(AshbyUserSchema),
});

export type AshbyUserSearchResponse = z.infer<
  typeof AshbyUserSearchResponseSchema
>;

// Referral form info

export const AshbyReferralFormFieldSchema = z.object({
  isRequired: z.boolean(),
  descriptionHtml: z.string().optional(),
  descriptionPlain: z.string().optional(),
  field: z.object({
    id: z.string(),
    type: z.string(),
    path: z.string(),
    humanReadablePath: z.string().optional(),
    title: z.string(),
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
});

export type AshbyReferralFormField = z.infer<
  typeof AshbyReferralFormFieldSchema
>;

export const AshbyReferralFormSectionSchema = z.object({
  title: z.string().optional(),
  descriptionHtml: z.string().optional(),
  descriptionPlain: z.string().optional(),
  fields: z.array(AshbyReferralFormFieldSchema),
});

export type AshbyReferralFormSection = z.infer<
  typeof AshbyReferralFormSectionSchema
>;

export const AshbyReferralFormInfoSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    formDefinition: z
      .object({
        sections: z.array(AshbyReferralFormSectionSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AshbyReferralFormInfo = z.infer<typeof AshbyReferralFormInfoSchema>;

export const AshbyReferralFormInfoResponseSchema = z.object({
  success: z.boolean(),
  results: AshbyReferralFormInfoSchema,
});

export type AshbyReferralFormInfoResponse = z.infer<
  typeof AshbyReferralFormInfoResponseSchema
>;

// Referral tool input (as sent by the agent to the create_referral tool)

export const AshbyCreateReferralInputSchema = z.object({
  fieldSubmissions: z
    .array(
      z.object({
        title: z
          .string()
          .describe("The human-readable field title (e.g. 'Candidate Name')."),
        value: z
          .union([z.string(), z.number(), z.boolean()])
          .describe("The value for this field."),
      })
    )
    .describe("Array of field values keyed by their human-readable title."),
});

export type AshbyCreateReferralInput = z.infer<
  typeof AshbyCreateReferralInputSchema
>;

export function isAshbyCreateReferralInput(
  input: Record<string, unknown>
): input is AshbyCreateReferralInput {
  return AshbyCreateReferralInputSchema.safeParse(input).success;
}

// Referral create

export const AshbyFieldSubmissionSchema = z.object({
  path: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type AshbyFieldSubmission = z.infer<typeof AshbyFieldSubmissionSchema>;

export const AshbyReferralCreateRequestSchema = z.object({
  id: z.string(),
  creditedToUserId: z.string(),
  fieldSubmissions: z.array(AshbyFieldSubmissionSchema),
});

export type AshbyReferralCreateRequest = z.infer<
  typeof AshbyReferralCreateRequestSchema
>;

export const AshbyReferralCreateResponseSchema = z.object({
  success: z.boolean(),
  results: z
    .object({
      id: z.string(),
      status: z.string(),
    })
    .passthrough()
    .optional(),
  errors: z.array(z.string()).optional(),
  errorInfo: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export type AshbyReferralCreateResponse = z.infer<
  typeof AshbyReferralCreateResponseSchema
>;

// Job posting list

export const AshbyJobPostingEmploymentTypeSchema = z.enum([
  "FullTime",
  "PartTime",
  "Intern",
  "Contract",
  "Temporary",
]);

export type AshbyJobPostingEmploymentType = z.infer<
  typeof AshbyJobPostingEmploymentTypeSchema
>;

export const AshbyJobPostingSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    jobId: z.string(),
    departmentName: z.string(),
    teamName: z.string(),
    locationName: z.string(),
    locationIds: z
      .object({
        primaryLocationId: z.string(),
        secondaryLocationIds: z.array(z.string()),
      })
      .optional(),
    workplaceType: z.string().nullish(),
    employmentType: z.string(),
    isListed: z.boolean(),
    publishedDate: z.string(),
    applicationDeadline: z.string().nullish(),
    externalLink: z.string().nullish(),
    applyLink: z.string(),
    compensationTierSummary: z.string().nullish(),
    shouldDisplayCompensationOnJobBoard: z.boolean(),
    updatedAt: z.string(),
  })
  .passthrough();

export type AshbyJobPosting = z.infer<typeof AshbyJobPostingSchema>;

export const AshbyJobPostingListRequestSchema = z.object({
  location: z.string().optional(),
  department: z.string().optional(),
  listedOnly: z.boolean().optional(),
  jobBoardId: z.string().optional(),
});

export type AshbyJobPostingListRequest = z.infer<
  typeof AshbyJobPostingListRequestSchema
>;

export const AshbyJobPostingListResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(AshbyJobPostingSchema),
});

export type AshbyJobPostingListResponse = z.infer<
  typeof AshbyJobPostingListResponseSchema
>;

// Job posting info

const AshbyDescriptionPartSchema = z.object({
  html: z.string(),
  plain: z.string(),
});

export const AshbyJobPostingInfoRequestSchema = z.object({
  jobPostingId: z.string(),
});

export type AshbyJobPostingInfoRequest = z.infer<
  typeof AshbyJobPostingInfoRequestSchema
>;

export const AshbyJobPostingInfoSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    descriptionPlain: z.string().optional(),
    descriptionHtml: z.string().optional(),
    descriptionParts: z
      .object({
        descriptionOpening: AshbyDescriptionPartSchema.nullish(),
        descriptionBody: AshbyDescriptionPartSchema.nullish(),
        descriptionClosing: AshbyDescriptionPartSchema.nullish(),
      })
      .optional(),
  })
  .passthrough();

export type AshbyJobPostingInfo = z.infer<typeof AshbyJobPostingInfoSchema>;

export const AshbyJobPostingInfoResponseSchema = z.object({
  success: z.boolean(),
  results: AshbyJobPostingInfoSchema.optional(),
});

export type AshbyJobPostingInfoResponse = z.infer<
  typeof AshbyJobPostingInfoResponseSchema
>;

// Job posting update

export const AshbyJobPostingWorkplaceTypeSchema = z
  .enum(["OnSite", "Hybrid", "Remote"])
  .nullable();

export type AshbyJobPostingWorkplaceType = z.infer<
  typeof AshbyJobPostingWorkplaceTypeSchema
>;

// Tool input schema (as sent by the agent to the update_job_posting tool).
export const AshbyUpdateJobPostingInputSchema = z.object({
  jobPostingId: z.string(),
  jobId: z.string(),
  title: z.string().optional(),
  descriptionHtml: z.string().optional(),
  workplaceType: AshbyJobPostingWorkplaceTypeSchema.optional(),
  suppressDescriptionOpening: z.boolean().optional(),
  suppressDescriptionClosing: z.boolean().optional(),
});

export type AshbyUpdateJobPostingInput = z.infer<
  typeof AshbyUpdateJobPostingInputSchema
>;

export function isAshbyUpdateJobPostingInput(
  input: Record<string, unknown>
): input is AshbyUpdateJobPostingInput {
  return AshbyUpdateJobPostingInputSchema.safeParse(input).success;
}

// API request schema (transformed from tool input).
export const AshbyJobPostingUpdateRequestSchema = z.object({
  jobPostingId: z.string(),
  title: z.string().optional(),
  description: z
    .object({
      type: z.literal("text/html"),
      content: z.string(),
    })
    .optional(),
  workplaceType: AshbyJobPostingWorkplaceTypeSchema.optional(),
  suppressDescriptionOpening: z.boolean().optional(),
  suppressDescriptionClosing: z.boolean().optional(),
});

export type AshbyJobPostingUpdateRequest = z.infer<
  typeof AshbyJobPostingUpdateRequestSchema
>;

export const AshbyJobPostingUpdateResponseSchema = z.object({
  success: z.boolean(),
  results: z
    .object({
      id: z.string(),
      title: z.string(),
    })
    .passthrough()
    .optional(),
  errors: z.array(z.string()).optional(),
  errorInfo: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export type AshbyJobPostingUpdateResponse = z.infer<
  typeof AshbyJobPostingUpdateResponseSchema
>;

// Candidate info (detailed)

export const AshbyCandidateInfoRequestSchema = z.object({
  id: z.string(),
});

export type AshbyCandidateInfoRequest = z.infer<
  typeof AshbyCandidateInfoRequestSchema
>;

export const AshbyCandidateInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
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
    emailAddresses: z
      .array(
        z.object({
          value: z.string(),
          type: z.string(),
          isPrimary: z.boolean(),
        })
      )
      .optional(),
    phoneNumbers: z
      .array(
        z.object({
          value: z.string(),
          type: z.string(),
          isPrimary: z.boolean(),
        })
      )
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
    location: z
      .object({
        city: z.string().nullish(),
        region: z.string().nullish(),
        country: z.string().nullish(),
      })
      .passthrough()
      .optional()
      .nullable(),
    customFields: z
      .array(
        z
          .object({
            id: z.string().optional(),
            title: z.string().optional(),
            value: z.unknown().optional(),
          })
          .passthrough()
      )
      .optional(),
    applicationIds: z.array(z.string()).optional(),
    createdAt: z.string().nullish(),
  })
  .passthrough();

export type AshbyCandidateInfo = z.infer<typeof AshbyCandidateInfoSchema>;

export const AshbyCandidateInfoResponseSchema = z.object({
  success: z.boolean(),
  results: AshbyCandidateInfoSchema.optional(),
});

export type AshbyCandidateInfoResponse = z.infer<
  typeof AshbyCandidateInfoResponseSchema
>;

// Offer list

export const AshbyOfferFormFieldValueSchema = z
  .object({
    title: z.string().optional(),
    value: z.unknown().optional(),
  })
  .passthrough();

export type AshbyOfferFormFieldValue = z.infer<
  typeof AshbyOfferFormFieldValueSchema
>;

export const AshbyOfferCustomFieldSchema = z
  .object({
    id: z.string().optional(),
    isPrivate: z.boolean().optional(),
    title: z.string().optional(),
    value: z.unknown().optional(),
    valueLabel: z.string().optional(),
  })
  .passthrough();

export type AshbyOfferCustomField = z.infer<typeof AshbyOfferCustomFieldSchema>;

export const AshbyOfferVersionSchema = z
  .object({
    id: z.string().optional(),
    createdAt: z.string().nullish(),
    startDate: z.string().nullish(),
    salary: z
      .object({
        value: z.number(),
        currencyCode: z.string(),
      })
      .optional(),
    formFieldValues: z.array(AshbyOfferFormFieldValueSchema).optional(),
    customFields: z.array(AshbyOfferCustomFieldSchema).optional(),
  })
  .passthrough();

export type AshbyOfferVersion = z.infer<typeof AshbyOfferVersionSchema>;

export const AshbyOfferSchema = z
  .object({
    id: z.string(),
    applicationId: z.string().optional(),
    status: z.string().optional(),
    decidedAt: z.string().nullish(),
    latestVersion: AshbyOfferVersionSchema.nullish(),
  })
  .passthrough();

export type AshbyOffer = z.infer<typeof AshbyOfferSchema>;

export const AshbyOfferListRequestSchema = z.object({
  applicationId: z.string().optional(),
});

export type AshbyOfferListRequest = z.infer<typeof AshbyOfferListRequestSchema>;

export const AshbyOfferListResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(AshbyOfferSchema),
  moreDataAvailable: z.boolean().optional(),
  nextCursor: z.string().optional(),
});

export type AshbyOfferListResponse = z.infer<
  typeof AshbyOfferListResponseSchema
>;

// Offer info

export const AshbyOfferInfoRequestSchema = z.object({
  offerId: z.string(),
});

export type AshbyOfferInfoRequest = z.infer<typeof AshbyOfferInfoRequestSchema>;

export const AshbyOfferInfoSchema = z
  .object({
    id: z.string(),
    decidedAt: z.string().nullish(),
    applicationId: z.string().optional(),
    acceptanceStatus: z.string().optional(),
    offerStatus: z.string().optional(),
    latestVersion: AshbyOfferVersionSchema.nullish(),
  })
  .passthrough();

export type AshbyOfferInfo = z.infer<typeof AshbyOfferInfoSchema>;

export const AshbyOfferInfoResponseSchema = z.object({
  success: z.boolean(),
  results: AshbyOfferInfoSchema.optional(),
});

export type AshbyOfferInfoResponse = z.infer<
  typeof AshbyOfferInfoResponseSchema
>;

// Job info (detailed)

export const AshbyJobInfoRequestSchema = z.object({
  id: z.string(),
});

export type AshbyJobInfoRequest = z.infer<typeof AshbyJobInfoRequestSchema>;

export const AshbyJobInfoSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    departmentName: z.string().nullish(),
    teamName: z.string().nullish(),
    locationName: z.string().nullish(),
    customFields: z
      .array(
        z
          .object({
            id: z.string().optional(),
            title: z.string().optional(),
            value: z.unknown().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

export type AshbyJobInfo = z.infer<typeof AshbyJobInfoSchema>;

export const AshbyJobInfoResponseSchema = z.object({
  success: z.boolean(),
  results: AshbyJobInfoSchema.optional(),
});

export type AshbyJobInfoResponse = z.infer<typeof AshbyJobInfoResponseSchema>;
