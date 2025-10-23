import { z } from "zod";

export const GithubOrganizationSchema = z
  .string()
  .describe("A GitHub organization name");

export const GithubRepositorySchema = z
  .string()
  .describe("A GitHub full repository name, e.g. 'owner/repo'");

export const GithubAdditionalDataSchema = z.object({
  repositories: z.array(GithubRepositorySchema),
  organizations: z.array(GithubOrganizationSchema),
});

export function isGithubRepository(data: unknown): data is GithubRepository {
  const result = GithubRepositorySchema.safeParse(data);
  return result.success;
}

export function isGithubOrganization(
  data: unknown
): data is GithubOrganization {
  const result = GithubOrganizationSchema.safeParse(data);
  return result.success;
}

export type GithubOrganization = z.infer<typeof GithubOrganizationSchema>;
export type GithubRepository = z.infer<typeof GithubRepositorySchema>;
export type GithubAdditionalData = z.infer<typeof GithubAdditionalDataSchema>;
