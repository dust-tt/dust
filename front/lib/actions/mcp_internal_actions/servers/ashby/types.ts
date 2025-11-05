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
  data: z.array(z.record(z.unknown())),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    })
  ),
});

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
