import { z } from "zod";

export const GithubOrganizationSchema = z.object({
  id: z.number(),
  login: z.string(),
});

export const GithubRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
});

export const GithubAdditionalDataSchema = z.object({
  repositories: z.array(GithubRepositorySchema),
  organizations: z.array(GithubOrganizationSchema),
});

export function isGithubRepository(
  data: Record<string, unknown>
): data is GithubRepository {
  const result = GithubRepositorySchema.safeParse(data);
  return result.success;
}

export function isGithubOrganization(
  data: Record<string, unknown>
): data is GithubOrganization {
  const result = GithubOrganizationSchema.safeParse(data);
  return result.success;
}

export type GithubOrganization = z.infer<typeof GithubOrganizationSchema>;
export type GithubRepository = z.infer<typeof GithubRepositorySchema>;
export type GithubAdditionalData = z.infer<typeof GithubAdditionalDataSchema>;
