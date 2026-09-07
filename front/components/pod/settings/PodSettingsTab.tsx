import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { CapabilitiesPickerItemsList } from "@app/components/assistant/CapabilitiesPicker";
import { ConfirmContext } from "@app/components/Confirm";
import { MarkdownFileEditor } from "@app/components/editor/MarkdownFileEditor";
import { AdminControlledPodTile } from "@app/components/pod/settings/AdminControlledPodTile";
import { DeletePodDialog } from "@app/components/pod/settings/DeletePodDialog";
import { PodMembersTable } from "@app/components/pod/settings/PodMembersTable";
import { PodNetworkSection } from "@app/components/pod/settings/PodNetworkSection";
import { PodSettingsOptionLabel } from "@app/components/pod/settings/PodSettingsOptionLabel";
import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useArchivePod } from "@app/hooks/useArchivePod";
import {
  getPodAgentsMdScopedPath,
  POD_AGENTS_MD_FILENAME,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "@app/lib/api/projects/constants";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useCheckPodName,
  usePodMetadata,
  usePodRestrictionImpact,
  useUpdatePodMetadata,
} from "@app/lib/swr/pods";
import { useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import { POD_RESTRICTION_IMPACT_WINDOW_DAYS } from "@app/types/api/projects/restriction_impact";
import type {
  PatchPodMetadataBodyType,
  RichSpaceType,
} from "@app/types/api/spaces";
import { PatchPodMetadataBodySchema } from "@app/types/api/spaces";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import { resolveDefaultAgentId } from "@app/types/user";
import {
  Archive,
  Avatar,
  Button,
  ChevronDown,
  ContentMessage,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Globe01,
  Icon,
  InfoCircle,
  Input,
  ScrollArea,
  SearchInput,
  ShapesPlus,
  SliderToggle,
  TextArea,
  Tooltip,
  Upload01,
  Users01,
  XCircle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface PodSettingsTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  onOpenMembersPanel?: () => void;
}

const OPEN_POD_DISABLED_TOOLTIP =
  "Open Pods are disabled by your workspace admin.";

const DEFAULT_PILL_BASE_CLASSNAME =
  "inline-flex box-border w-fit items-center rounded-xl h-9 px-3 gap-2 border border-border bg-background text-sm text-primary transition-colors duration-200";
const DEFAULT_PILL_INTERACTIVE_CLASSNAME =
  "cursor-pointer hover:bg-primary-100 hover:border-primary-150";

export function PodSettingsTab({
  owner,
  pod: pod,
  onOpenMembersPanel,
}: PodSettingsTabProps) {
  const { members: podMembers, isEditor: isPodEditor, isRestricted } = pod;
  const isOpen = !isRestricted;
  const areWorkspaceOpenPodsAllowed = areOpenPodsAllowed(owner);
  const isPrivatePodAndOpenPodsDisallowed =
    !areWorkspaceOpenPodsAllowed && !isOpen;
  const isVisibilityToggleDisabled =
    !isPodEditor || isPrivatePodAndOpenPodsDisallowed;
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");

  const confirm = useContext(ConfirmContext);
  const { hasFeature } = useFeatureFlags();
  const { isAdmin } = useAuth();
  const hasWorkspaceDefaultAgentFeature = hasFeature("workspace_default_agent");
  const hasAdminControlledPodsFeature = hasFeature("admin_controlled_pods");
  // The pod env vars section stays workspace-admin only (matching the API,
  // which keeps env-vars admin-only). Mirrors that gate — change both together.
  const isPodSandboxAdminEnabled = isAdmin && hasFeature("frames_v2");
  // The pod network section is visible to anyone who can open this page once
  // the feature is on (the API opens the egress GET to Pod readers); editing
  // stays workspace-admin only. Mirrors the egress-policy route gates — change
  // both together.
  const canViewPodNetwork = hasFeature("frames_v2");
  const canEditPodNetwork = isPodSandboxAdminEnabled;

  const { podMetadata, isPodMetadataLoading } = usePodMetadata({
    workspaceId: owner.sId,
    podId: pod.sId,
  });
  const doUpdateMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
  });

  // Pod function callers who would lose access if the Pod were restricted. Only fetched on the
  // path where it can be acted on: an editor looking at a Pod that is still open.
  const { restrictionImpact, mutateRestrictionImpact } =
    usePodRestrictionImpact({
      workspaceId: owner.sId,
      podId: pod.sId,
      disabled: !isPodEditor || isRestricted,
    });
  const [isCheckingRestrictionImpact, setIsCheckingRestrictionImpact] =
    useState(false);

  // Default agent for new conversations started in this pod. Stored on pod metadata
  // (shared across pod members). Resolved downstream in `useHandleMentions`, falling
  // back to @dust.
  const { agentConfigurations, isLoading: isAgentConfigurationsLoading } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
    });
  const dustAgent =
    agentConfigurations.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ?? null;
  // When the pod has no default set, new conversations inherit the workspace
  // default agent, else then @dust.
  const isInheritingWorkspaceDefault =
    hasWorkspaceDefaultAgentFeature && !podMetadata?.defaultAgentId;
  const resolvedDefaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature,
  });
  // Fall back to @dust when the default agent isn't available to the
  // current user (e.g. unpublished/deleted). This is the agent shown in the
  // input bar and pod settings.
  const displayedDefaultAgent =
    (resolvedDefaultAgentId &&
      agentConfigurations.find((a) => a.sId === resolvedDefaultAgentId)) ||
    dustAgent;
  // The configured default may be an agent the current user can't access (e.g.
  // an unpublished agent). `agentConfigurations` only contains viewable agents,
  // so when the stored default is missing it falls back to @dust for this user.
  // Surface the same notice as the conversations input bar.
  const isDefaultAgentUnavailable =
    !isAgentConfigurationsLoading &&
    !isPodMetadataLoading &&
    !!podMetadata?.defaultAgentId &&
    podMetadata.defaultAgentId !== GLOBAL_AGENTS_SID.DUST &&
    !agentConfigurations.some((a) => a.sId === podMetadata.defaultAgentId);
  const saveDefaultAgent = useCallback(
    async (agentId: string | null) => {
      // Warn about the implications of using another default agentbefore switching.
      // Resetting back to @dust needs no confirmation.
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

  // Default skills for new conversations started in this pod. Stored on pod
  // metadata and pre-inserted into the input bar of every new conversation
  // by `useHandleMentions`, as if manually added.
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
  // Resolve the stored ids to skills the current user can see. Ids that no longer resolve
  // (archived / out of scope) are not rendered; saving the current
  // selection then drops them.
  const skillBySId = new Map(skills.map((skill) => [skill.sId, skill]));
  const selectedDefaultSkills = defaultSkillIds.flatMap((skillId) => {
    const skill = skillBySId.get(skillId);
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

  // Memoized so the (memoized) DropdownMenuContent doesn't re-render on every
  // parent render from a fresh JSX prop. Only changes when the search text does.
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

  // Trigger pill for the default agent, mirroring the conversations input bar:
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

  const [podName, setPodName] = useState(pod.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const {
    isNameAvailable,
    isChecking: isCheckingName,
    setValue: setNameToCheck,
  } = useCheckPodName({
    owner,
    whitelistedName: pod.name,
  });
  const nameNotAvailable =
    podName.trim().length > 0 && !isCheckingName && !isNameAvailable;
  const [podDescription, setPodDescription] = useState(
    podMetadata?.description ?? ""
  );
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const form = useForm<PatchPodMetadataBodyType>({
    resolver: zodResolver(PatchPodMetadataBodySchema),
    defaultValues: {},
  });

  // Sync form with loaded metadata
  useEffect(() => {
    if (podMetadata) {
      form.reset({});
      setPodDescription(podMetadata.description ?? "");
    }
  }, [podMetadata, form]);

  const doUpdate = useUpdateSpace({ owner });
  const { mutateSpaceInfoRegardlessOfQueryParams: mutatePodInfo } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: pod.sId,
    });
  const { mutate: mutateSpaceSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const onSaveName = async () => {
    const newPodName = podName.trim();
    if (!newPodName || newPodName === pod.name.trim()) {
      return;
    }
    const confirmed = await confirm({
      title: "Update Pod name?",
      message: `The Pod name will be changed to "${newPodName}".`,
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const updated = await doUpdate(
      pod,
      {
        isRestricted,
        memberIds: podMembers.filter((m) => !m.isEditor).map((m) => m.sId),
        editorIds: podMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: newPodName,
      },
      {
        title: "Successfully updated Pod name",
        description: "Pod name was successfully updated.",
      }
    );

    if (updated) {
      await mutatePodInfo();
      void mutateSpaceSummary();
      setIsEditingName(false);
    }
  };

  const onSaveDescription = async () => {
    setIsSavingDescription(true);
    try {
      await doUpdateMetadata({ description: podDescription });
      setIsEditingDescription(false);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const { archivePod, unarchivePod } = useArchivePod({
    owner,
    podId: pod.sId,
  });

  const handleArchiveToggle = useCallback(async () => {
    if (podMetadata?.archivedAt) {
      await unarchivePod();
    } else {
      await archivePod();
    }
  }, [archivePod, unarchivePod, podMetadata?.archivedAt]);

  const handleVisibilityToggle = useCallback(async () => {
    const newIsOpen = !isOpen;
    const title = newIsOpen ? "Switch to open?" : "Switch to restricted?";

    // Restricting can break non-members who drive this Pod's functions from their own Frames, so
    // warn with the count before it happens. Read fresh at the decision point, and awaited when
    // the background fetch has not landed yet, so the dialog never silently omits the warning.
    let impact = restrictionImpact;
    if (!newIsOpen && !impact) {
      setIsCheckingRestrictionImpact(true);
      try {
        const refreshed = await mutateRestrictionImpact();
        impact = refreshed?.restrictionImpact ?? null;
      } finally {
        setIsCheckingRestrictionImpact(false);
      }
    }
    const breakingImpact =
      !newIsOpen && impact && impact.brokenUserCount > 0 ? impact : null;

    const message = newIsOpen ? (
      "All workspace members will be able to join and see everything in the Pod — including existing conversations and files."
    ) : (
      <>
        <div>Access will be limited to invited members only.</div>
        {breakingImpact && (
          <div>
            {breakingImpact.brokenInvocationCount} Pod function{" "}
            {breakingImpact.brokenInvocationCount === 1 ? "call" : "calls"} in
            the last {POD_RESTRICTION_IMPACT_WINDOW_DAYS} days came from{" "}
            {breakingImpact.brokenUserCount}{" "}
            {breakingImpact.brokenUserCount === 1 ? "person" : "people"} who{" "}
            {breakingImpact.brokenUserCount === 1 ? "is" : "are"} not a member
            of this Pod. Those calls will stop working.
          </div>
        )}
      </>
    );

    const confirmed = await confirm({
      title,
      message,
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const updated = await doUpdate(
      pod,
      {
        isRestricted: !newIsOpen,
        memberIds: podMembers.filter((m) => !m.isEditor).map((m) => m.sId),
        editorIds: podMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: pod.name,
      },
      {
        title: "Successfully updated Pod visibility",
        description: `Pod is now ${newIsOpen ? "open" : "restricted"}.`,
      }
    );

    if (updated) {
      await mutatePodInfo();
    }
  }, [
    confirm,
    doUpdate,
    isOpen,
    mutateRestrictionImpact,
    podMembers,
    pod,
    mutatePodInfo,
    restrictionImpact,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-8">
        {pod.archivedAt && (
          <ContentMessage variant="info" size="lg">
            This Pod has been archived.
          </ContentMessage>
        )}
        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Name</div>
          <div className="flex w-full min-w-0 gap-2">
            <Input
              value={podName}
              disabled={!isPodEditor}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setPodName(e.target.value);
                setNameToCheck(e.target.value);
                setIsEditingName(e.target.value.trim() !== pod.name.trim());
              }}
              placeholder="Enter Pod name"
              containerClassName="flex-1"
            />
            {isEditingName && (
              <>
                <Button
                  label="Save"
                  variant="highlight"
                  onClick={onSaveName}
                  disabled={nameNotAvailable || isCheckingName}
                />
                <Button
                  label="Cancel"
                  variant="outline"
                  onClick={() => {
                    setPodName(pod.name);
                    setNameToCheck("");
                    setIsEditingName(false);
                  }}
                />
              </>
            )}
          </div>
          {isEditingName && nameNotAvailable && (
            <div className="text-xs text-warning-500">
              A Pod or space with this name already exists.
            </div>
          )}
        </div>
        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Description</div>
          <div className="flex w-full min-w-0 flex-col gap-2">
            <TextArea
              value={podDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setPodDescription(e.target.value);
                setIsEditingDescription(
                  e.target.value !== podMetadata?.description
                );
              }}
              placeholder={
                isPodMetadataLoading
                  ? "Loading..."
                  : "Describe what this Pod is about..."
              }
              disabled={isPodMetadataLoading || !isPodEditor}
              minRows={3}
              resize="vertical"
              className="flex-1"
            />
            {isEditingDescription && (
              <div className="flex gap-2">
                <Button
                  label="Save"
                  variant="highlight"
                  isLoading={isSavingDescription}
                  onClick={() => void onSaveDescription()}
                />
                <Button
                  label="Cancel"
                  variant="outline"
                  disabled={isSavingDescription}
                  onClick={() => {
                    setPodDescription(podMetadata?.description ?? "");
                    setIsEditingDescription(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Instructions for Agents</div>
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
                {/* Clearing the pod default reverts to inheriting the
                    workspace default. Only shown when the workspace-default
                    feature is on and an explicit pod default is set. */}
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

        <div className="flex w-full flex-col gap-2">
          <div className="heading-lg">Default Skills</div>
          <p className="text-sm text-muted-foreground">
            The skills pre-selected when anyone starts a new conversation in
            this Pod. Members can still edit the skills in each conversation.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Selected skills, each rendered as a pill matching conversation styling.
             Editors get an inline remove control. */}
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

        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col border-y border-border">
            <div className="flex items-center justify-between gap-4 py-4">
              <PodSettingsOptionLabel
                icon={Globe01}
                title="Open to everyone"
                description="Anyone in the workspace can find and join the Pod."
              />
              <div className="flex shrink-0 items-center gap-2">
                {isVisibilityToggleDisabled ? (
                  <Tooltip
                    label={OPEN_POD_DISABLED_TOOLTIP}
                    trigger={
                      <div>
                        <SliderToggle
                          selected={isOpen}
                          onClick={handleVisibilityToggle}
                          disabled
                        />
                      </div>
                    }
                  />
                ) : (
                  <SliderToggle
                    selected={isOpen}
                    onClick={handleVisibilityToggle}
                    disabled={
                      isVisibilityToggleDisabled || isCheckingRestrictionImpact
                    }
                  />
                )}
              </div>
            </div>

            {hasAdminControlledPodsFeature && (
              <div className="border-t border-border">
                <AdminControlledPodTile owner={owner} pod={pod} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="heading-lg flex-1">Members</h3>
            {isPodEditor && onOpenMembersPanel && (
              <Button
                label="Manage"
                variant="outline"
                icon={Users01}
                onClick={onOpenMembersPanel}
              />
            )}
          </div>
          {podMembers.length > 0 && (
            <>
              <SearchInput
                name="search"
                placeholder="Search (email)"
                value={searchSelectedMembers}
                onChange={setSearchSelectedMembers}
              />
              <ScrollArea className="h-full" orientation="horizontal">
                <PodMembersTable
                  owner={owner}
                  pod={pod}
                  selectedMembers={podMembers}
                  searchSelectedMembers={searchSelectedMembers}
                  isEditor={isPodEditor}
                  mutatePodInfo={() => mutatePodInfo()}
                />
              </ScrollArea>
            </>
          )}
        </div>

        {canViewPodNetwork && (
          <PodNetworkSection
            owner={owner}
            podId={pod.sId}
            canEdit={canEditPodNetwork}
          />
        )}

        {isPodSandboxAdminEnabled && (
          <div className="flex w-full flex-col gap-2">
            <SandboxEnvVarsSection owner={owner} spaceId={pod.sId} />
          </div>
        )}

        {isPodEditor && (
          <div className="flex w-full flex-col gap-3 border-t border-border pt-8">
            <h3 className="heading-lg">Danger Zone</h3>
            <h4 className="heading-base">Archive</h4>
            {podMetadata?.archivedAt ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground">
                  Archived on{" "}
                  <span className="font-medium">
                    {formatTimestampToFriendlyDate(
                      podMetadata.archivedAt,
                      "short"
                    )}
                  </span>
                  .
                </p>
                <Button
                  icon={Upload01}
                  variant="outline"
                  label="Unarchive"
                  onClick={handleArchiveToggle}
                  className="w-fit"
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This Pod will be removed from the sidebar. Its data stays
                  intact and can still be used as a data source.
                </p>
                <Button
                  icon={Archive}
                  variant="warning-secondary"
                  label="Archive"
                  onClick={handleArchiveToggle}
                  className="w-fit"
                />
              </>
            )}
            <h4 className="heading-base">Delete</h4>
            <p className="text-sm text-muted-foreground">
              This permanently removes all content—conversations, folders,
              websites, and data sources. Agents using this Pod's tools will be
              impacted. This cannot be undone.
            </p>
            <DeletePodDialog owner={owner} pod={pod} />
          </div>
        )}
      </div>
    </div>
  );
}
