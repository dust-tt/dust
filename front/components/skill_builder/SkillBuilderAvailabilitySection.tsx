import { SkillBuilderAvailabilityMessage } from "@app/components/skill_builder/SkillBuilderAvailabilityMessage";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderSimilarDiscoverableSkills } from "@app/components/skill_builder/SkillBuilderSimilarDiscoverableSkills";
import { useSkillSpaceRestrictionsContext } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
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

interface SkillBuilderAvailabilitySectionProps {
  owner: WorkspaceType;
  // Availability follows the publish permission rather than the form's disabled flag, so a
  // surface that shows the skill without letting it be edited has to say so itself.
  isReadOnly?: boolean;
}

export function SkillBuilderAvailabilitySection({
  owner,
  isReadOnly = false,
}: SkillBuilderAvailabilitySectionProps) {
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

  const { nonGlobalSpacesWithRestrictions } =
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
    <div className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">Availability</h3>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            label={currentOption?.label}
            variant="outline"
            isSelect
            disabled={
              isReadOnly || !canUpdateAvailability || isAvailabilityLocked
            }
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
            <li>All members can find it via the composer and agent builder</li>
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
  );
}
