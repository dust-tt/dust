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

export const JiraWebhookSchema = z.object({
  id: z.number(),
  url: z.string(),
  events: z.array(z.string()),
  jqlFilter: z.string(),
  expirationDate: z.string(),
  fieldIdsFilter: z.array(z.string()).optional(),
  issuePropertyKeysFilter: z.array(z.string()).optional(),
});

export const JiraWebhooksResponseSchema = z.object({
  isLast: z.boolean(),
  maxResults: z.number(),
  startAt: z.number(),
  total: z.number(),
  values: z.array(JiraWebhookSchema),
});

export type JiraResourceType = z.infer<typeof JiraResourceSchema>;
export type JiraProjectType = z.infer<typeof JiraProjectSchema>;
export type JiraWebhookType = z.infer<typeof JiraWebhookSchema>;
