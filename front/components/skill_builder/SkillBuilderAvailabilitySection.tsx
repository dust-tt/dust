import { SkillBuilderAvailabilityMessage } from "@app/components/skill_builder/SkillBuilderAvailabilityMessage";
import type { SkillBuilderFormData } from "@app/components/skill_builder/skillBuilderFormSchema";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useController } from "react-hook-form";

const AVAILABILITY_OPTIONS: {
  label: MessageDescriptor;
  value: SkillAvailability;
  description?: MessageDescriptor;
}[] = [
  {
    label: msg`Editors only`,
    value: "editors",
  },
  {
    label: msg`Members`,
    value: "workspace_users",
  },
  {
    label: msg`Members and agents`,
    value: "users_and_agents",
    description: msg`Available to all members and agents with Discover Skills`,
  },
];

interface SkillBuilderAvailabilitySectionProps {
  owner: WorkspaceType;
}

export function SkillBuilderAvailabilitySection({
  owner,
}: SkillBuilderAvailabilitySectionProps) {
  const { t } = useLingui();
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
    ? t`You don’t have permission to change this skill’s availability`
    : isAvailabilityLocked
      ? t`You don’t have permission to change the availability of an auto-discoverable skill`
      : undefined;

  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">
        <Trans>Availability</Trans>
      </h3>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            label={currentOption ? t(currentOption.label) : undefined}
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
                key={option.value}
                label={t(option.label)}
                onClick={() => {
                  onChange(option.value);
                }}
                description={
                  option.description ? t(option.description) : undefined
                }
                disabled={isOptionDisabled}
                tooltip={
                  isOptionDisabled
                    ? t`You don’t have permission to make skills auto-discoverable`
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
          title={t`This skill has workspace-wide effects`}
          size="lg"
        >
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <Trans>
                All members can find it via the composer and agent builder
              </Trans>
            </li>
            <li>
              <Trans>
                Any agent with Discover Skills, including Dust, can use it
                automatically. See other skills available to agents in{" "}
                <Hoverable
                  href={`/w/${owner.sId}/builder/skills?availability=users_and_agents`}
                  target="_blank"
                  className="inline-flex items-center gap-1 underline"
                >
                  Manage skills
                  <Icon visual={LinkExternal01} size="xs" />
                </Hoverable>
              </Trans>
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
