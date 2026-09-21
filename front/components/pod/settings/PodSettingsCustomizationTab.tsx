import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { CapabilitiesPickerItemsList } from "@app/components/assistant/CapabilitiesPicker";
import { ConfirmContext } from "@app/components/Confirm";
import { MarkdownFileEditor } from "@app/components/editor/MarkdownFileEditor";
import { PodTabsCustomizationSection } from "@app/components/pod/settings/PodTabsCustomizationSection";
import {
  getPodAgentsMdScopedPath,
  POD_AGENTS_MD_FILENAME,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "@app/lib/api/projects/constants";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { usePodMetadata, useUpdatePodMetadata } from "@app/lib/swr/pods";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { RichSpaceType } from "@app/types/api/spaces";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import { resolveDefaultAgentId } from "@app/types/user";
import {
  Avatar,
  Button,
  ChevronDown,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  InfoCircle,
  ShapesPlus,
  Tooltip,
  XCircle,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useState } from "react";

const DEFAULT_PILL_BASE_CLASSNAME =
  "inline-flex box-border w-fit items-center rounded-xl h-9 px-3 gap-2 border border-border bg-background text-sm text-primary transition-colors duration-200";
const DEFAULT_PILL_INTERACTIVE_CLASSNAME =
  "cursor-pointer hover:bg-primary-100 hover:border-primary-150";

interface PodSettingsCustomizationTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function PodSettingsCustomizationTab({
  owner,
  pod,
}: PodSettingsCustomizationTabProps) {
  const isPodEditor = pod.isEditor;
  const confirm = useContext(ConfirmContext);
  const { hasFeature } = useFeatureFlags();
  const hasWorkspaceDefaultAgentFeature = hasFeature("workspace_default_agent");

  // Pod metadata
  const { podMetadata, isPodMetadataLoading } = usePodMetadata({
    workspaceId: owner.sId,
    podId: pod.sId,
  });
  const doUpdateMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
  });

  // Default agent
  const { agentConfigurations, isLoading: isAgentConfigurationsLoading } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
    });
  const dustAgent =
    agentConfigurations.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ?? null;

  const isInheritingWorkspaceDefault =
    hasWorkspaceDefaultAgentFeature && !podMetadata?.defaultAgentId;
  const resolvedDefaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature,
  });
  const displayedDefaultAgent =
    (resolvedDefaultAgentId &&
      agentConfigurations.find((a) => a.sId === resolvedDefaultAgentId)) ||
    dustAgent;
  const isDefaultAgentUnavailable =
    !isAgentConfigurationsLoading &&
    !isPodMetadataLoading &&
    !!podMetadata?.defaultAgentId &&
    podMetadata.defaultAgentId !== GLOBAL_AGENTS_SID.DUST &&
    !agentConfigurations.some((a) => a.sId === podMetadata.defaultAgentId);

  const saveDefaultAgent = useCallback(
    async (agentId: string | null) => {
      if (agentId && agentId !== GLOBAL_AGENTS_SID.DUST) {
        const confirmed = await confirm({
          title: "Warning",
          message:
            "@dust is designed to give your users the best experience by default. A custom default agent may not handle every request as reliably. Do you want to set it as the default anyway?",
          validateVariant: "warning",
          validateLabel: "Yes",
          cancelLabel: "No",
        });
        if (!confirmed) {
          return;
        }
      }
      await doUpdateMetadata({ defaultAgentId: agentId });
    },
    [confirm, doUpdateMetadata]
  );

  // Default skills
  const { skills } = useSkills({
    owner,
    status: "active",
  });
  const [skillSearchText, setSkillSearchText] = useState("");
  const [isSkillPickerOpen, setIsSkillPickerOpen] = useState(false);

  const defaultSkillIds = useMemo(
    () => podMetadata?.defaultSkillIds ?? [],
    [podMetadata]
  );
  const selectedDefaultSkillIdSet = new Set(defaultSkillIds);
  const skillById = new Map(skills.map((skill) => [skill.sId, skill]));
  const selectedDefaultSkills = defaultSkillIds.flatMap((skillId) => {
    const skill = skillById.get(skillId);
    return skill ? [skill] : [];
  });
  const normalizedSkillSearch = skillSearchText.trim().toLowerCase();
  const addableSkills = skills
    .filter(
      (skill) =>
        !selectedDefaultSkillIdSet.has(skill.sId) &&
        (normalizedSkillSearch.length === 0 ||
          skill.name.toLowerCase().includes(normalizedSkillSearch) ||
          (skill.userFacingDescription ?? "")
            .toLowerCase()
            .includes(normalizedSkillSearch))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const addDefaultSkill = useCallback(
    async (skillId: string) => {
      await doUpdateMetadata({
        defaultSkillIds: [...defaultSkillIds, skillId],
      });
    },
    [doUpdateMetadata, defaultSkillIds]
  );

  const removeDefaultSkill = useCallback(
    async (skillId: string) => {
      await doUpdateMetadata({
        defaultSkillIds: defaultSkillIds.filter((id) => id !== skillId),
      });
    },
    [doUpdateMetadata, defaultSkillIds]
  );

  const skillPickerDropdownHeaders = useMemo(
    () => (
      <>
        <DropdownMenuSearchbar
          name="search-default-skills"
          placeholder="Search skills"
          value={skillSearchText}
          onChange={setSkillSearchText}
        />
        <DropdownMenuSeparator />
      </>
    ),
    [skillSearchText]
  );

  const renderDefaultAgentPill = (interactive: boolean) => (
    <div
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-label={
        isInheritingWorkspaceDefault
          ? `Default Agent: ${displayedDefaultAgent?.name ?? "Dust"} (workspace default)`
          : `Default Agent: ${displayedDefaultAgent?.name ?? "Dust"}`
      }
      aria-disabled={!interactive}
      className={cn(
        DEFAULT_PILL_BASE_CLASSNAME,
        interactive
          ? DEFAULT_PILL_INTERACTIVE_CLASSNAME
          : "opacity-50 pointer-events-none"
      )}
    >
      <Avatar size="xs" visual={displayedDefaultAgent?.pictureUrl} />
      <span className="grow truncate notranslate">
        {displayedDefaultAgent?.name ?? "Dust"}
        {isInheritingWorkspaceDefault && (
          <span className="ml-1 text-muted-foreground">
            · Workspace default
          </span>
        )}
      </span>
      {isDefaultAgentUnavailable && (
        <Tooltip
          tooltipTriggerAsChild
          trigger={
            <span
              className="flex items-center text-warning"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Icon visual={InfoCircle} size="xs" />
            </span>
          }
          label="This Pod's default agent isn't available to you, so @dust is used instead. Contact the editor of the pod for more information."
        />
      )}
      {interactive && (
        <Icon visual={ChevronDown} size="xs" className="-mr-1 text-faint" />
      )}
    </div>
  );

  return (
    <>
      {/* Tabs customization */}
      <PodTabsCustomizationSection
        owner={owner}
        podId={pod.sId}
        fileTabs={pod.frameTabs ?? []}
        tabsOrder={pod.tabsOrder}
        isEditor={isPodEditor}
      />

      {/* Instructions for Agents */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Pod instructions for Agents</div>
        <div className="text-sm text-muted-foreground">
          Seen by all agents in this Pod, stored as{" "}
          <span className="font-medium">{POD_AGENTS_MD_FILENAME}</span> in the
          Pod's files.
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2">
          <MarkdownFileEditor
            owner={owner}
            filePath={getPodAgentsMdScopedPath(pod.sId)}
            emptyWhenNotFound
            readOnly={!isPodEditor}
            placeholder="Enter instructions for agents"
            maxCharacterCount={POD_AGENTS_MD_MAX_CHARACTER_COUNT}
          />
        </div>
      </div>

      {/* Default agent */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Default agent</div>
        <p className="text-sm text-muted-foreground">
          The agent pre-selected when anyone starts a new conversation in this
          Pod.{" "}
          {hasWorkspaceDefaultAgentFeature &&
            "When unset, it inherits the Workspace default agent."}
        </p>
        <div className="flex items-center gap-2">
          {isPodEditor ? (
            <>
              <AgentPicker
                owner={owner}
                agents={agentConfigurations}
                showFooterButtons={false}
                onItemClick={(agent) => saveDefaultAgent(agent.sId)}
                pickerButton={renderDefaultAgentPill(true)}
              />
              {hasWorkspaceDefaultAgentFeature &&
                podMetadata?.defaultAgentId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={XCircle}
                    tooltip="Reset to workspace default"
                    onClick={() => void saveDefaultAgent(null)}
                  />
                )}
            </>
          ) : (
            renderDefaultAgentPill(false)
          )}
        </div>
      </div>

      {/* Default Skills */}
      <div className="flex w-full flex-col gap-2">
        <div className="heading-lg">Default Skills</div>
        <p className="text-sm text-muted-foreground">
          The skills pre-selected when anyone starts a new conversation in this
          Pod. Members can still edit the skills in each conversation.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {selectedDefaultSkills.map((skill) => (
            <div
              key={skill.sId}
              aria-label={`Default skill: ${skill.name}`}
              className={cn(
                DEFAULT_PILL_BASE_CLASSNAME,
                !isPodEditor && "opacity-50"
              )}
            >
              <Avatar size="xs" icon={getSkillAvatarIcon(skill)} />
              <span className="grow truncate notranslate">{skill.name}</span>
              {isPodEditor && (
                <button
                  type="button"
                  aria-label={`Remove ${skill.name}`}
                  className="-mr-1 flex items-center text-faint hover:text-primary"
                  onClick={() => void removeDefaultSkill(skill.sId)}
                >
                  <Icon visual={XCircle} size="xs" />
                </button>
              )}
            </div>
          ))}
          {isPodEditor && (
            <DropdownMenu
              open={isSkillPickerOpen}
              onOpenChange={(open) => {
                setIsSkillPickerOpen(open);
                if (open) {
                  setSkillSearchText("");
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Add a default skill"
                  className={cn(
                    DEFAULT_PILL_BASE_CLASSNAME,
                    DEFAULT_PILL_INTERACTIVE_CLASSNAME
                  )}
                >
                  <Icon visual={ShapesPlus} size="xs" />
                  <span className="grow truncate">Add skill</span>
                  <Icon
                    visual={ChevronDown}
                    size="xs"
                    className="-mr-1 text-faint"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-80"
                align="start"
                dropdownHeaders={skillPickerDropdownHeaders}
              >
                <CapabilitiesPickerItemsList
                  emptyMessage={
                    normalizedSkillSearch.length > 0
                      ? "No skills found"
                      : "No more skills to add"
                  }
                  items={addableSkills.map((skill) => {
                    const SkillAvatar = getSkillAvatarIcon(skill);

                    return {
                      kind: "skill" as const,
                      skill,
                      id: `pod-default-skills-picker-${skill.sId}`,
                      icon: <SkillAvatar size="xs" />,
                      label: skill.name,
                      sortName: skill.name.toLowerCase(),
                      description: skill.userFacingDescription ?? undefined,
                    };
                  })}
                  onItemSelect={(item) => {
                    if (item.kind === "skill") {
                      void addDefaultSkill(item.skill.sId);
                    }
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isPodEditor && selectedDefaultSkills.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No default skills configured.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
