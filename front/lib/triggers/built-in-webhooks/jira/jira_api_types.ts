import { z } from "zod";

import type {
  JiraProjectType,
  JiraResourceType,
  JiraWebhookType,
} from "@app/lib/api/jira";

export type { JiraProjectType, JiraResourceType, JiraWebhookType };

const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  self: z.string().optional(),
});

export function isJiraProject(data: unknown): data is JiraProjectType {
  const result = JiraProjectSchema.safeParse(data);
  return result.success;
}

export const JiraAdditionalDataSchema = z.object({
  projects: z.array(JiraProjectSchema),
});

export type JiraAdditionalData = z.infer<typeof JiraAdditionalDataSchema>;
