import { z } from "zod";

export const JiraResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  scopes: z.array(z.string()),
  avatarUrl: z.string(),
});

export const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  self: z.string(),
});

export const JiraProjectsResponseSchema = z.object({
  values: z.array(JiraProjectSchema),
});

export const JiraWebhookRegistrationResultSchema = z.object({
  createdWebhookId: z.number().optional(),
  errors: z.array(z.string()).optional(),
});

export const JiraCreateWebhookResponseSchema = z.object({
  webhookRegistrationResult: z.array(JiraWebhookRegistrationResultSchema),
});

export type JiraResource = z.infer<typeof JiraResourceSchema>;
export type JiraProject = z.infer<typeof JiraProjectSchema>;
export type JiraProjectsResponse = z.infer<typeof JiraProjectsResponseSchema>;
export type JiraCreateWebhookResponse = z.infer<
  typeof JiraCreateWebhookResponseSchema
>;
