import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

/**
 * Get all versions of a single skill, including the current version.
 * Returns versions sorted by version number descending (newest first).
 */
export async function listSkillConfigurationVersions(
  auth: Authenticator,
  { skillId }: { skillId: string }
): Promise<SkillConfigurationType[]> {
  const workspace = auth.workspace();
  if (!workspace || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  return SkillResource.listVersions(auth, skillId);
}
