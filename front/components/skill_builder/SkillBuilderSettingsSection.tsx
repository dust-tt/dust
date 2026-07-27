import { ConfirmContext } from "@app/components/Confirm";
import { SkillBuilderEnableSuggestionsSection } from "@app/components/skill_builder/SkillBuilderEnableSuggestionsSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderIsDefaultSection } from "@app/components/skill_builder/SkillBuilderIsDefaultSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillEditorsSheetWithButton } from "@app/components/skill_builder/SkillEditorsSheetWithButton";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hoverable,
  Icon,
  Label,
  LinkExternal01,
  LinkWrapper,
} from "@dust-tt/sparkle";
import { useContext } from "react";
import { useController } from "react-hook-form";

const AVAILABILITY_OPTIONS = [
  {
    label: "Editors only",
    values: ["editors"],
  },
  {
    label: "All workspace members",
    values: ["workspace_users", "users_and_agents"],
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

  const confirm = useContext(ConfirmContext);

  const { hasFeature } = useFeatureFlags();
  const isSkillPublicationEnabled = hasFeature(
    "admin_governance_skill_publication"
  );
  const { hasPermission } = useWorkspacePermissions();
  const canUpdateAvailability = hasPermission("publish", "skill");
  const githubSkillFolderUrl = getGitHubSkillFolderUrl(skill);

  const currentOption = AVAILABILITY_OPTIONS.find((option) =>
    option.values.includes(availability)
  );

  const isAutoDiscoverableOn = availability === "users_and_agents";

  const onAvailablityChange = async (
    option: (typeof AVAILABILITY_OPTIONS)[0],
    isAutoDiscoverableOn: boolean
  ) => {
    if (isAutoDiscoverableOn) {
      const confirmed = await confirm({
        title: "Auto-discovery will be off",
        message:
          "Editors only skill cannot be auto-discoverable. Are you sure to change the availablity?",
        validateLabel: "Confirm",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
    }
    if (option.values.includes("workspace_users")) {
      onChange("workspace_users");
    } else {
      onChange(option.values[0]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="heading-lg text-foreground">Skill settings</h2>
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
      <div className="flex gap-5">
        <div className="flex flex-col">
          <h3 className="text-base font-semibold text-foreground mb-2">
            Editors
          </h3>
          <div className="flex w-full flex-row flex-wrap items-center gap-2">
            <SkillEditorsSheetWithButton
              isEditorGateVisible={isEditorGateVisible}
              isAddingSelfAsEditor={isAddingSelfAsEditor}
              onAddSelfAsEditor={onAddSelfAsEditor}
            />
          </div>
        </div>
        {isSkillPublicationEnabled && (
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              Availability
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  label={currentOption?.label}
                  variant="outline"
                  isSelect
                  disabled={!canUpdateAvailability}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60" align="start">
                {AVAILABILITY_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.label}
                    label={option.label}
                    onClick={async () => {
                      await onAvailablityChange(option, isAutoDiscoverableOn);
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {isSkillPublicationEnabled && canUpdateAvailability && (
        <div className="text-muted-foreground text-sm">
          <p className="mb-1">
            <span className="font-semibold">
              Auto-discovery is {isAutoDiscoverableOn ? "on" : "off"}.{" "}
            </span>
            Agents with the Discover Skills tool{" "}
            {isAutoDiscoverableOn ? "can use" : "won’t find"} this skill
            automatically.
            <br />
          </p>
          <p>
            Edit in{" "}
            <Hoverable
              href={`/w/${owner.sId}/builder/skills#?selectedTab=default`}
              target="_blank"
              className="inline-flex items-center gap-1 underline"
            >
              Manage Skills <Icon visual={LinkExternal01} size="xs" />
            </Hoverable>
          </p>
        </div>
      )}

      {hasSelfImprovingSkills && (
        <div className="space-y-3">
          <Label className="text-base font-semibold text-foreground">
            Self Improvement
          </Label>
          <SkillBuilderEnableSuggestionsSection
            selfImprovementLock={skill?.selfImprovementLock ?? false}
          />
        </div>
      )}
      {skill && !isSkillPublicationEnabled && (
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
