import { z } from "zod";

// Define the structure similar to GitHub
export const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

export type JiraProject = z.infer<typeof JiraProjectSchema>;

export const JiraAdditionalDataSchema = z.object({
  projects: z.array(JiraProjectSchema),
  cloudId: z.string(),
  siteUrl: z.string(),
});

export type JiraAdditionalData = z.infer<typeof JiraAdditionalDataSchema>;

export function isJiraAdditionalData(
  data: unknown
): data is JiraAdditionalData {
  return JiraAdditionalDataSchema.safeParse(data).success;
}
