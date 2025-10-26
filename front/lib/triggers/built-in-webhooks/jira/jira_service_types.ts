import { z } from "zod";

export const JiraProjectSchema = z
  .object({
    id: z.string().describe("A Jira project ID"),
    key: z.string().describe("A Jira project key"),
    name: z.string().describe("A Jira project name"),
  })
  .passthrough();

export const JiraAdditionalDataSchema = z.object({
  projects: z.array(JiraProjectSchema),
});

export function isJiraProject(data: unknown): data is JiraProject {
  const result = JiraProjectSchema.safeParse(data);
  return result.success;
}

export type JiraProject = z.infer<typeof JiraProjectSchema>;
export type JiraAdditionalData = z.infer<typeof JiraAdditionalDataSchema>;
