import { SkillBuilderEnableSuggestionsSection } from "@app/components/skill_builder/SkillBuilderEnableSuggestionsSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderIsDefaultSection } from "@app/components/skill_builder/SkillBuilderIsDefaultSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillEditorsSheet } from "@app/components/skill_builder/SkillEditorsSheet";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  Label,
  LinkExternal01,
  LinkWrapper,
} from "@dust-tt/sparkle";

interface SkillBuilderSettingsSectionProps {
  skill?: SkillType;
  hasSelfImprovingSkills: boolean;
}

export function SkillBuilderSettingsSection({
  skill,
  hasSelfImprovingSkills,
}: SkillBuilderSettingsSectionProps) {
  const githubSkillFolderUrl = getGitHubSkillFolderUrl(skill);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="heading-lg text-foreground dark:text-foreground-night">
          Skill settings
        </h2>
        {githubSkillFolderUrl && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
            <span>This skill was originally imported from</span>
            <LinkWrapper
              href={githubSkillFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground hover:underline dark:hover:text-foreground-night"
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
      <div className="flex flex-col space-y-3">
        <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
          Editors
        </Label>
        <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-2">
          <SkillEditorsSheet />
        </div>
      </div>
      {hasSelfImprovingSkills && (
        <div className="space-y-3">
          <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
            Self Improvement
          </Label>
          <SkillBuilderEnableSuggestionsSection
            selfImprovementLock={skill?.selfImprovementLock ?? false}
          />
        </div>
      )}
      {skill && (
        <>
          <Collapsible defaultOpen>
            <CollapsibleTrigger variant="secondary">
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 pt-3">
                <SkillBuilderIsDefaultSection />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
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
