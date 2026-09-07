import { SkillBuilderAvailabilityMessage } from "@app/components/skill_builder/SkillBuilderAvailabilityMessage";
import { SkillBuilderEnableSuggestionsSection } from "@app/components/skill_builder/SkillBuilderEnableSuggestionsSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderSimilarDiscoverableSkills } from "@app/components/skill_builder/SkillBuilderSimilarDiscoverableSkills";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillEditorsAccessWarning } from "@app/components/skill_builder/SkillEditorsAccessWarning";
import { SkillEditorsSheetWithButton } from "@app/components/skill_builder/SkillEditorsSheetWithButton";
import { useSkillSpaceRestrictionsContext } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type {
  SkillAvailability,
  SkillType,
} from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hoverable,
  Icon,
  InfoCircle,
  LinkExternal01,
  LinkWrapper,
} from "@dust-tt/sparkle";
import { useController } from "react-hook-form";

const AVAILABILITY_OPTIONS: {
  label: string;
  value: SkillAvailability;
  description?: string;
}[] = [
  {
    label: "Editors only",
    value: "editors",
  },
  {
    label: "Members",
    value: "workspace_users",
  },
  {
    label: "Members and agents",
    value: "users_and_agents",
    description: "Available to all members and agents with Discover Skills",
  },
];

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
  const {
    field: { value: availability, onChange },
  } = useController<SkillBuilderFormData, "availability">({
    name: "availability",
  });

  const { hasPermission } = useWorkspacePermissions();

  // Even if you have permission to make skills discoverable, if you don't have permission to manage skill availabilty
  // you cannot perform the action, so we disable the dropdown.
  const canUpdateAvailability = hasPermission("publish", "skill");
  const canMakeSkillAutoDiscoverable = hasPermission(
    "make_discoverable",
    "skill"
  );
  const githubSkillFolderUrl = getGitHubSkillFolderUrl(skill);

  const { editorsWithoutSpaceAccess, nonGlobalSpacesWithRestrictions } =
    useSkillSpaceRestrictionsContext();

  const currentOption = AVAILABILITY_OPTIONS.find(
    (option) => option.value === availability
  );

  const isAutoDiscoverableOn = availability === "users_and_agents";

  const hasSpaceRestrictions = nonGlobalSpacesWithRestrictions.length > 0;

  // Auto-discoverable, workspace-wide skills get a dedicated "workspace-wide
  // effects" message instead of the generic "who can use this skill?" one, so
  // the two are mutually exclusive.
  const showWorkspaceWideEffectsMessage =
    isAutoDiscoverableOn && !hasSpaceRestrictions;

  // Without the make-discoverable permission, an editor can neither turn a skill
  // auto-discoverable nor change an already auto-discoverable skill's availability.
  const isAvailabilityLocked =
    isAutoDiscoverableOn && !canMakeSkillAutoDiscoverable;

  const availabilityTooltip = !canUpdateAvailability
    ? "You don’t have permission to change this skill’s availability"
    : isAvailabilityLocked
      ? "You don’t have permission to change the availability of an auto-discoverable skill"
      : undefined;

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
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Editors</h3>
        <div className="flex w-full flex-row flex-wrap items-center gap-2">
          <SkillEditorsSheetWithButton
            isEditorGateVisible={isEditorGateVisible}
            isAddingSelfAsEditor={isAddingSelfAsEditor}
            onAddSelfAsEditor={onAddSelfAsEditor}
          />
        </div>
        {editorsWithoutSpaceAccess.length > 0 && (
          <SkillEditorsAccessWarning
            editorsWithoutSpaceAccess={editorsWithoutSpaceAccess}
            owner={owner}
          />
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">
          Availability
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              label={currentOption?.label}
              variant="outline"
              isSelect
              disabled={!canUpdateAvailability || isAvailabilityLocked}
              tooltip={availabilityTooltip}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {AVAILABILITY_OPTIONS.map((option) => {
              const isOptionDisabled =
                option.value === "users_and_agents" &&
                !canMakeSkillAutoDiscoverable;
              return (
                <DropdownMenuItem
                  key={option.label}
                  label={option.label}
                  onClick={() => {
                    onChange(option.value);
                  }}
                  description={option.description}
                  disabled={isOptionDisabled}
                  tooltip={
                    isOptionDisabled
                      ? "You don’t have permission to make skills auto-discoverable"
                      : undefined
                  }
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {showWorkspaceWideEffectsMessage ? (
          <ContentMessage
            icon={InfoCircle}
            title="This skill has workspace-wide effects"
            size="lg"
          >
            <ul className="list-disc space-y-1 pl-5">
              <li>
                All members can find it via the composer and agent builder
              </li>
              <li>
                Any agent with Discover Skills, including Dust, can use it
                automatically. See other skills available to agents in{" "}
                <Hoverable
                  href={`/w/${owner.sId}/builder/skills?availability=users_and_agents`}
                  target="_blank"
                  className="inline-flex items-center gap-1 underline"
                >
                  Manage Skills
                  <Icon visual={LinkExternal01} size="xs" />
                </Hoverable>
              </li>
            </ul>
          </ContentMessage>
        ) : (
          <SkillBuilderAvailabilityMessage
            availability={availability}
            owner={owner}
            restrictedSpaces={nonGlobalSpacesWithRestrictions}
          />
        )}
        <SkillBuilderSimilarDiscoverableSkills />
      </div>

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
