import { z } from "zod";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export const JiraResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  scopes: z.array(z.string()),
  avatarUrl: z.string(),
});

export type JiraResourceType = z.infer<typeof JiraResourceSchema>;

export const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  self: z.string(),
});

export type JiraProjectType = z.infer<typeof JiraProjectSchema>;

export function isJiraProject(data: unknown): data is JiraProjectType {
  const result = JiraProjectSchema.safeParse(data);
  return result.success;
}

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

export const JiraAdditionalDataSchema = z.object({
  projects: z.array(JiraProjectSchema),
});

export type JiraAdditionalData = z.infer<typeof JiraAdditionalDataSchema>;

export const JiraWebhookSchema = z.object({
  id: z.number(),
  url: z.string(),
  events: z.array(z.string()),
  jqlFilter: z.string(),
  expirationDate: z.string(),
  fieldIdsFilter: z.array(z.string()).optional(),
  issuePropertyKeysFilter: z.array(z.string()).optional(),
});

export type JiraWebhookType = z.infer<typeof JiraWebhookSchema>;

export const JiraWebhooksResponseSchema = z.object({
  isLast: z.boolean(),
  maxResults: z.number(),
  startAt: z.number(),
  total: z.number(),
  values: z.array(JiraWebhookSchema),
});

export type JiraWebhooksResponseType = z.infer<
  typeof JiraWebhooksResponseSchema
>;

export async function validateJiraApiResponse<T extends z.ZodTypeAny>(
  response: Response,
  schema: T
): Promise<Result<z.infer<T>, Error>> {
  if (!response.ok) {
    const errorText = await response.text();
    return new Err(
      new Error(`API request failed: ${response.statusText} - ${errorText}`)
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    return new Err(
      new Error(
        `Failed to parse JSON response: ${normalizeError(error).message}`
      )
    );
  }

  const parseResult = schema.safeParse(data);
  if (!parseResult.success) {
    return new Err(
      new Error(
        `API response validation failed: ${parseResult.error.message}. Response: ${JSON.stringify(data)}`
      )
    );
  }

  return new Ok(parseResult.data);
}
