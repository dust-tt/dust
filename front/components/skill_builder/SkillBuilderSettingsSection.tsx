import { SkillBuilderAvailabilitySection } from "@app/components/skill_builder/SkillBuilderAvailabilitySection";
import { SkillBuilderEditorsSection } from "@app/components/skill_builder/SkillBuilderEditorsSection";
import { SkillBuilderEnableSuggestionsSection } from "@app/components/skill_builder/SkillBuilderEnableSuggestionsSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import { Icon, LinkExternal01, LinkWrapper } from "@dust-tt/sparkle";

interface SkillBuilderSettingsSectionProps {
  skill?: SkillType;
  hasSelfImprovingSkills: boolean;
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  onAddSelfAsEditor: () => void;
  owner: WorkspaceType;
}

export function SkillBuilderSettingsSection({
  skill,
  hasSelfImprovingSkills,
  isEditorGateVisible,
  isAddingSelfAsEditor,
  onAddSelfAsEditor,
  owner,
}: SkillBuilderSettingsSectionProps) {
  const githubSkillFolderUrl = getGitHubSkillFolderUrl(skill);

  return (
    <div className="space-y-4">
      <div className="space-y-1 pb-1">
        <h2 className="heading-lg font-semibold text-foreground">
          Skill settings
        </h2>
        {githubSkillFolderUrl && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>This skill was originally imported from</span>
            <LinkWrapper
              href={githubSkillFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
            >
              <span>GitHub</span>
              <Icon visual={LinkExternal01} size="xs" />
            </LinkWrapper>
            <span>.</span>
          </div>
        )}
      </div>
      <div className="flex items-end gap-8">
        <div className="flex-grow">
          <SkillBuilderNameSection />
        </div>
        <SkillBuilderIconSection />
      </div>
      <SkillBuilderUserFacingDescriptionSection />
      <SkillBuilderEditorsSection
        isEditorGateVisible={isEditorGateVisible}
        isAddingSelfAsEditor={isAddingSelfAsEditor}
        onAddSelfAsEditor={onAddSelfAsEditor}
        owner={owner}
      />
      <SkillBuilderAvailabilitySection owner={owner} />

      {hasSelfImprovingSkills && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">
            Self Improvement
          </h3>
          <SkillBuilderEnableSuggestionsSection
            selfImprovementLock={skill?.selfImprovementLock ?? false}
          />
        </div>
      )}
    </div>
  );
}

function getGitHubSkillFolderUrl(skill?: SkillType): string | null {
  if (skill?.source !== "github" || !skill.sourceMetadata?.repoUrl) {
    return null;
  }

  const parsedRepoUrl = parseGitHubRepoUrl(skill.sourceMetadata.repoUrl);
  if (parsedRepoUrl.isErr()) {
    return null;
  }

  const { owner, repo } = parsedRepoUrl.value;
  const repoUrl = `https://github.com/${owner}/${repo}`;

  if (!skill.sourceMetadata.filePath) {
    return repoUrl;
  }

  const folderPath = skill.sourceMetadata.filePath
    .split("/")
    .filter(Boolean)
    .slice(0, -1)
    .join("/");

  return `${repoUrl}/tree/main${folderPath ? `/${folderPath}` : ""}`;
}
