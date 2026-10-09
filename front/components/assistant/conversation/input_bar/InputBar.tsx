import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { INPUT_BAR_ACTIONS } from "@app/components/assistant/conversation/input_bar/inputBarActions";
import { InputBarAttachments } from "@app/components/assistant/conversation/input_bar/InputBarAttachments";
import {
  INPUT_BAR_COMPACT_ENTER_ANIMATION_CLASSES,
  INPUT_BAR_COMPACT_MORPH_TRANSITION_CLASSES,
  INPUT_BAR_COMPACT_PILL_CLASSES,
} from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { InputBarUsageBanner } from "@app/components/assistant/conversation/input_bar/InputBarUsageBanner";
import { useConversationDrafts } from "@app/components/assistant/conversation/input_bar/useConversationDrafts";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { DustError } from "@app/lib/error";
import { compareStrings } from "@app/lib/i18n/format";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useAddConversationSelectedSpaces,
  useSelectableConversationSpaces,
} from "@app/lib/swr/conversation_selected_spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";
import {
  compareAgentsForSort,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import type {
  ConversationWithoutContentType,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import { isEqualNode } from "@app/types/data_source_view";
import type { Result } from "@app/types/shared/result";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import uniqWith from "lodash/uniqWith";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DEFAULT_INPUT_BAR_ACTIONS = [...INPUT_BAR_ACTIONS];

// Placeholder shown when a submitted message would be queued.
const INPUT_BAR_QUEUE_PLACEHOLDER = msg`Add a follow-up...`;

type SelectedSpacesState = {
  key: string;
  spaceIds: string[];
};

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

export type HomepageVariant = "classic" | "discovery";

interface InputBarProps {
  owner: WorkspaceType;
  user: UserType | null;
  onSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[],
    selectedSpaceIds?: string[],
    modelSelection?: ModelSelectionType
  ) => Promise<Result<undefined, DustError>>;
  draftKey: string;
  homepageVariant?: HomepageVariant;
  conversation?: ConversationWithoutContentType;
  space?: SpaceType;
  stickyMentions?: RichMention[];
  defaultAgentId?: string | null;
  isDefaultAgentLoading?: boolean;
  lastRequestedModel?: ModelSelectionType | null;
  defaultSkills?: InputBarContainerProps["defaultSkills"];
  isDefaultSkillsLoading?: boolean;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus: boolean;
  disableUserMentions?: boolean;
  disableAgentMentions?: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
  isSubmitting?: boolean;
  isAgentBuilder?: boolean;
  submitBlockMessage?: string | null;
  placeholder?: string;
  effectiveIsCompact?: boolean;
  onExpandInputBar?: () => void;
  onEditorFocusChange?: (focused: boolean) => void;
  onOverlayOpenChange?: (open: boolean) => void;
  onVoiceActiveChange?: (active: boolean) => void;
}

export const InputBar = React.memo(function InputBar({
  owner,
  user,
  onSubmit,
  conversation,
  draftKey,
  homepageVariant,
  space,
  stickyMentions,
  defaultAgentId,
  isDefaultAgentLoading,
  lastRequestedModel = null,
  defaultSkills,
  isDefaultSkillsLoading,
  actions = DEFAULT_INPUT_BAR_ACTIONS,
  disableAutoFocus = false,
  disableUserMentions,
  disableAgentMentions,
  isAgentBuilder = false,
  isFloating = true,
  isSubmitting = false,
  submitBlockMessage = null,
  placeholder,
  effectiveIsCompact = false,
  onExpandInputBar,
  onEditorFocusChange,
  onOverlayOpenChange,
  onVoiceActiveChange,
}: InputBarProps) {
  const { t } = useLingui();
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(isSubmitting);
  const [isShaking, setIsShaking] = useState(false);
  const { featureFlags } = useFeatureFlags();

  // Latest model-picker selection. The picker writes into this ref so we can
  // read it at submit without re-rendering the input bar. `undefined` means
  // no override (run the agent's configured model).
  const modelSelectionRef = useRef<ModelSelectionType | undefined>(undefined);

  const {
    selectedAgent,
    clearSelectedAgent,
    selectedSingleAgent,
    pendingInputText,
    setPendingInputText,
    fileUploaderService,
    isLoadingGoTemplate,
    onBeforeSubmit,
  } = useContext(InputBarContext);

  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations, isAgentConfigurationsLoading } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
    });

  const { droppedFiles, setDroppedFiles } = useFileDrop();

  const { saveDraft, getDraft, clearDraft } = useConversationDrafts({
    workspaceId: owner.sId,
    userId: user?.sId ?? null,
    draftKey,
    shouldUseDraft: !isAgentBuilder,
  });

  useEffect(() => {
    if (isLoadingGoTemplate) {
      clearDraft();
    }
  }, [isLoadingGoTemplate, clearDraft]);

  useEffect(() => {
    if (droppedFiles.length > 0) {
      // Handle the dropped files.
      void fileUploaderService.handleFilesUpload(droppedFiles);

      // Clear the dropped files after handling them.
      setDroppedFiles([]);
    }
  }, [droppedFiles, setDroppedFiles, fileUploaderService]);

  // Consume one-shot context values after children have observed them, so they
  // do not stick across subsequent renders / navigations. Cleanup also clears
  // on unmount so a stale one-shot cannot leak to a later InputBar mount.
  useEffect(() => {
    if (selectedAgent) {
      clearSelectedAgent();
    }
    return () => {
      clearSelectedAgent();
    };
  }, [selectedAgent, clearSelectedAgent]);

  useEffect(() => {
    if (pendingInputText) {
      setPendingInputText(null);
    }
    return () => {
      setPendingInputText(null);
    };
  }, [pendingInputText, setPendingInputText]);

  const { generatingMessages, getConversationGeneratingMessages } =
    useGenerationContext();
  const { getFirstBlockedActionForMessage } = useBlockedActionsContext();

  // In single-agent mode, block submission when the selected agent differs from
  // the agent that is currently generating a response.
  const agentSwitchBlockMessage = useMemo(() => {
    if (!selectedSingleAgent) {
      return null;
    }
    const conversationId = conversation?.sId ?? "";

    // Check actively generating messages (excludes blocked-action messages).
    const activeGenerating = getConversationGeneratingMessages(conversationId);
    const activeBlockingId = activeGenerating.find(
      (gm) => gm.agentId && gm.agentId !== selectedSingleAgent.id
    )?.agentId;
    if (activeBlockingId) {
      return t`Wait for current active agent to finish before calling another agent.`;
    }

    // Check messages with a pending blocked action from a different agent.
    const blockedActionMessage = generatingMessages.find(
      (m) =>
        m.conversationId === conversationId &&
        m.agentId &&
        m.agentId !== selectedSingleAgent.id &&
        getFirstBlockedActionForMessage(m.messageId)
    );
    if (blockedActionMessage) {
      const name = agentConfigurations.find(
        (a) => a.sId === blockedActionMessage.agentId
      )?.name;
      return name
        ? t`Resolve the pending action from @${name} before switching agents`
        : t`Resolve the pending action from another agent before switching agents`;
    }

    return null;
  }, [
    selectedSingleAgent,
    getConversationGeneratingMessages,
    generatingMessages,
    getFirstBlockedActionForMessage,
    conversation?.sId,
    agentConfigurations,
    t,
  ]);

  const isBlockedByAgentSwitch = agentSwitchBlockMessage !== null;
  const isBlockedForSubmission =
    isBlockedByAgentSwitch || submitBlockMessage !== null;

  // Same signal as the Stop button: a message sent while generating is queued.
  const willQueueMessage =
    !!conversation &&
    getConversationGeneratingMessages(conversation.sId).length > 0;

  const [selectedSpacesState, setSelectedSpacesState] =
    useState<SelectedSpacesState | null>(null);

  const spacesSelectionKey = conversation?.sId ?? `draft:${draftKey}`;
  const draftSelectedSpaceIds = useMemo(
    () => getDraft()?.selectedSpaceIds ?? [],
    [getDraft]
  );
  const localSelectedSpaceIds =
    selectedSpacesState?.key === spacesSelectionKey
      ? selectedSpacesState.spaceIds
      : null;
  const inputBarSpaceId = conversation?.spaceId ?? space?.sId ?? undefined;
  const shouldShowSpacesAction =
    actions.includes("spaces") &&
    featureFlags.includes("restricted_spaces_in_input_bar") &&
    !isAgentBuilder &&
    !inputBarSpaceId;

  const {
    spaces: conversationSelectableSpaces,
    isSelectableSpacesLoading: isConversationSelectableSpacesLoading,
    mutateSelectableSpaces,
  } = useSelectableConversationSpaces({
    owner,
    conversationId: conversation?.sId ?? null,
    disabled: !shouldShowSpacesAction || !conversation?.sId,
  });
  const addConversationSelectedSpaces = useAddConversationSelectedSpaces({
    owner,
    conversationId: conversation?.sId ?? null,
  });

  const {
    spaces: workspaceRegularSpaces,
    isSpacesLoading: isWorkspaceSpacesLoading,
  } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["regular"],
    disabled: !shouldShowSpacesAction || !!conversation?.sId,
  });

  const conversationSelectedSpaceIds = useMemo(() => {
    const selectedSpaceIds: string[] = [];
    for (const selectableSpace of conversationSelectableSpaces) {
      if (selectableSpace.selected) {
        selectedSpaceIds.push(selectableSpace.sId);
      }
    }

    return selectedSpaceIds;
  }, [conversationSelectableSpaces]);

  const rawSelectedSpaceIds = useMemo(
    () =>
      conversation?.sId
        ? Array.from(
            new Set([
              ...conversationSelectedSpaceIds,
              ...(localSelectedSpaceIds ?? []),
            ])
          )
        : (localSelectedSpaceIds ?? draftSelectedSpaceIds),
    [
      conversation?.sId,
      conversationSelectedSpaceIds,
      draftSelectedSpaceIds,
      localSelectedSpaceIds,
    ]
  );
  const rawSelectedSpaceIdSet = useMemo(
    () => new Set(rawSelectedSpaceIds),
    [rawSelectedSpaceIds]
  );

  const selectableSpaces: SelectableConversationSpaceType[] = useMemo(
    () =>
      conversation?.sId
        ? conversationSelectableSpaces
        : workspaceRegularSpaces
            .sort((a, b) => compareStrings(a.name, b.name))
            .map((regularSpace) => ({
              ...regularSpace,
              selected: rawSelectedSpaceIdSet.has(regularSpace.sId),
            })),
    [
      conversation?.sId,
      conversationSelectableSpaces,
      rawSelectedSpaceIdSet,
      workspaceRegularSpaces,
    ]
  );
  const selectableSpaceIds = useMemo(
    () => new Set(selectableSpaces.map((space) => space.sId)),
    [selectableSpaces]
  );
  const selectedSpaceIds = useMemo(() => {
    if (!shouldShowSpacesAction) {
      return [];
    }

    if (
      (conversation?.sId && isConversationSelectableSpacesLoading) ||
      (!conversation?.sId && isWorkspaceSpacesLoading)
    ) {
      return rawSelectedSpaceIds;
    }

    return rawSelectedSpaceIds.filter((spaceId) =>
      selectableSpaceIds.has(spaceId)
    );
  }, [
    conversation?.sId,
    isConversationSelectableSpacesLoading,
    isWorkspaceSpacesLoading,
    rawSelectedSpaceIds,
    selectableSpaceIds,
    shouldShowSpacesAction,
  ]);
  const selectedSpaceIdSet = useMemo(
    () => new Set(selectedSpaceIds),
    [selectedSpaceIds]
  );
  const isSelectableSpacesLoading = conversation?.sId
    ? isConversationSelectableSpacesLoading
    : isWorkspaceSpacesLoading;

  const handleSelectedSpaceIdsChange = useCallback(
    async (spaceIds: string[]): Promise<string[] | null> => {
      if (!shouldShowSpacesAction) {
        setSelectedSpacesState({
          key: spacesSelectionKey,
          spaceIds: [],
        });
        return [];
      }

      const nextSpaceIds = Array.from(new Set(spaceIds)).filter((spaceId) =>
        selectableSpaceIds.has(spaceId)
      );
      if (sameStringSet(selectedSpaceIds, nextSpaceIds)) {
        return selectedSpaceIds;
      }

      if (conversation?.sId) {
        const addedSpaceIds = nextSpaceIds.filter(
          (spaceId) => !selectedSpaceIdSet.has(spaceId)
        );
        if (addedSpaceIds.length === 0) {
          return selectedSpaceIds;
        }

        const response = await addConversationSelectedSpaces(addedSpaceIds);
        if (!response) {
          return null;
        }

        const persistedSpaceIds = response.selectedSpaces.map(
          (selectedSpace) => selectedSpace.sId
        );
        setSelectedSpacesState({
          key: spacesSelectionKey,
          spaceIds: persistedSpaceIds,
        });
        await mutateSelectableSpaces();
        return persistedSpaceIds;
      }

      setSelectedSpacesState({
        key: spacesSelectionKey,
        spaceIds: nextSpaceIds,
      });
      return nextSpaceIds;
    },
    [
      addConversationSelectedSpaces,
      conversation?.sId,
      mutateSelectableSpaces,
      spacesSelectionKey,
      selectableSpaceIds,
      selectedSpaceIds,
      selectedSpaceIdSet,
      shouldShowSpacesAction,
    ]
  );

  const activeAgents = useMemo(() => {
    const agents = agentConfigurations.filter((a) => a.status === "active");
    agents.sort(compareAgentsForSort);
    return agents;
  }, [agentConfigurations]);

  const handleSubmit: InputBarContainerProps["onEnterKeyDown"] = async (
    isEmpty,
    markdownAndMentions,
    resetEditorText,
    setLoading
  ) => {
    if (
      isLocalSubmitting ||
      isEmpty ||
      fileUploaderService.isProcessingFiles ||
      isBlockedForSubmission
    ) {
      return;
    }

    onBeforeSubmit?.();

    const {
      mentions: rawMentions,
      markdown,
      tools,
      knowledge,
    } = markdownAndMentions;
    const shouldInjectSelectedAgent =
      selectedSingleAgent &&
      !rawMentions.some((m) => m.id === selectedSingleAgent.id);

    const allMentions = shouldInjectSelectedAgent
      ? [selectedSingleAgent, ...rawMentions]
      : rawMentions;
    const mentions = uniqBy(allMentions, "id");
    const uploadedFiles = fileUploaderService.getFileBlobs();
    const mentionedAgents = agentConfigurations.filter((a) =>
      mentions.some((m) => m.id === a.sId && m.type === "agent")
    );

    const toolIdsToAttach = uniq(tools.map((tool) => tool.id));
    const trackedTools = tools.map((t) => t.name);

    const attachedContentNodes = uniqWith(knowledge, isEqualNode);

    trackEvent({
      area: TRACKING_AREAS.CONVERSATION,
      object: "message_send",
      action: "submit",
      extra: {
        conversation_id: conversation?.sId ?? "new",
        has_attachments:
          attachedContentNodes.length > 0 || uploadedFiles.length > 0,
        has_tools: trackedTools.length > 0,
        has_agents: mentionedAgents.length > 0,
        has_default_agent: mentionedAgents.some((a) => isGlobalAgentId(a.sId)),
        has_custom_agent: mentionedAgents.some((a) => !isGlobalAgentId(a.sId)),
        is_new_conversation: !conversation,
        agent_count: mentions.length,
        agent_ids: mentionedAgents.map((a) => a.sId).join(","),
        attachment_count: attachedContentNodes.length + uploadedFiles.length,
        tool_count: trackedTools.length,
        tool_names: trackedTools.join(","),
        message_length: markdown.length,
        ...(homepageVariant && { homepage_variant: homepageVariant }),
      },
    });

    // When we are creating a new conversation, we will disable the input bar, show a loading
    // spinner and in case of error, re-enable the input bar
    if (!conversation) {
      setLoading(true);
      setIsLocalSubmitting(true);

      try {
        const r = await onSubmit(
          markdown,
          mentions,
          {
            uploaded: fileUploaderService.getFileBlobs().map((cf) => {
              return {
                title: cf.filename,
                fileId: cf.fileId,
                contentType: cf.contentType,
                url: cf.sourceUrl,
              };
            }),
            contentNodes: attachedContentNodes,
          },
          toolIdsToAttach,
          selectedSpaceIds,
          modelSelectionRef.current
        );

        if (r.isOk()) {
          clearDraft();
          resetEditorText();
          fileUploaderService.resetUpload();
          setSelectedSpacesState({
            key: spacesSelectionKey,
            spaceIds: [],
          });
        }
      } finally {
        setLoading(false);
        setIsLocalSubmitting(false);
      }
    } else {
      setIsLocalSubmitting(true);

      try {
        const submitPromise = onSubmit(
          markdown,
          mentions,
          {
            uploaded: fileUploaderService.getFileBlobs().map((cf) => {
              return {
                title: cf.filename,
                fileId: cf.fileId,
                contentType: cf.contentType,
                url: cf.sourceUrl,
              };
            }),
            contentNodes: attachedContentNodes,
          },
          toolIdsToAttach.length > 0 ? toolIdsToAttach : undefined,
          selectedSpaceIds,
          modelSelectionRef.current
        );

        // Execute these operations in parallel with the submission.
        resetEditorText();
        clearDraft();
        fileUploaderService.resetUpload();

        await submitPromise;
      } finally {
        setIsLocalSubmitting(false);
      }
    }
  };

  const handleShake = useCallback(() => {
    setIsShaking(true);
  }, []);

  useEffect(() => {
    setIsLocalSubmitting(isSubmitting);
  }, [isSubmitting]);

  return (
    <div
      className={classNames(
        "flex w-full flex-col",
        effectiveIsCompact && "min-w-0 flex-1"
      )}
    >
      <InputBarUsageBanner owner={owner} />
      <div
        onAnimationEnd={() => setIsShaking(false)}
        onClick={(e) => {
          if (!effectiveIsCompact) {
            return;
          }
          if (
            e.target instanceof HTMLElement &&
            e.target.closest("[data-compact-voice]")
          ) {
            return;
          }
          onExpandInputBar?.();
        }}
        className={classNames(
          isShaking && "animate-shake",
          "relative flex flex-col items-stretch gap-0 md:flex-row",
          INPUT_BAR_COMPACT_MORPH_TRANSITION_CLASSES,
          !effectiveIsCompact && "w-full flex-1 self-stretch",
          effectiveIsCompact
            ? classNames(
                INPUT_BAR_COMPACT_PILL_CLASSES,
                INPUT_BAR_COMPACT_ENTER_ANIMATION_CLASSES,
                "cursor-pointer"
              )
            : classNames(
                "rounded-squircle-40 w-full overflow-hidden",
                "border",
                "bg-input-bar-background",
                "has-[.tiptap:focus]:bg-stone-25 dark:has-[.tiptap:focus]:bg-[oklch(0.310_0.007_75)]",
                isFloating
                  ? "max-md:border-border max-md:has-[.tiptap:focus]:border-border-dark max-md:dark:has-[.tiptap:focus]:border-stone-750"
                  : "border-border has-[.tiptap:focus]:border-border-dark dark:has-[.tiptap:focus]:border-stone-750",
                "transition-colors duration-100 ease-emphasized motion-reduce:transition-none",
                isFloating &&
                  classNames(
                    "md:border-white/90",
                    "md:transition-[background-color,box-shadow] md:duration-150 md:ease-emphasized md:motion-reduce:transition-none",
                    "md:shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.04),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]",
                    "md:has-[.tiptap:focus]:shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.07),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]",
                    "md:dark:border-transparent",
                    "md:dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]",
                    "md:dark:has-[.tiptap:focus]:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.035),inset_0px_0px_0px_1px_rgba(255,255,255,0.055),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]"
                  )
              )
        )}
      >
        {!effectiveIsCompact && isFloating && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px hidden rounded-[inherit] [corner-shape:inherit] shadow-[inset_0px_-3px_29px_2px_rgba(0,0,0,0.01)] md:block md:dark:hidden"
          />
        )}
        <div
          className={classNames(
            "relative flex flex-col",
            !effectiveIsCompact && "w-full flex-1"
          )}
        >
          {!effectiveIsCompact && (
            <InputBarAttachments
              owner={owner}
              files={{ service: fileUploaderService }}
            />
          )}
          <InputBarContainer
            actions={actions}
            disableAutoFocus={disableAutoFocus}
            disableUserMentions={disableUserMentions}
            disableAgentMentions={disableAgentMentions}
            allAgents={activeAgents}
            isAgentsLoading={isAgentConfigurationsLoading}
            owner={owner}
            conversation={conversation}
            space={space}
            selectedAgent={selectedAgent}
            pendingInputText={pendingInputText}
            onEnterKeyDown={handleSubmit}
            stickyMentions={stickyMentions}
            defaultAgentId={defaultAgentId}
            isDefaultAgentLoading={isDefaultAgentLoading}
            lastRequestedModel={lastRequestedModel}
            defaultSkills={defaultSkills}
            isDefaultSkillsLoading={isDefaultSkillsLoading}
            fileUploaderService={fileUploaderService}
            isSubmitting={
              isLocalSubmitting ||
              fileUploaderService.isProcessingFiles ||
              isLoadingGoTemplate
            }
            selectedSpaceIds={selectedSpaceIds}
            selectableSpaces={selectableSpaces}
            shouldShowSpacesAction={shouldShowSpacesAction}
            isSelectableSpacesLoading={isSelectableSpacesLoading}
            onSelectedSpaceIdsChange={handleSelectedSpaceIdsChange}
            modelSelectionRef={modelSelectionRef}
            isAgentBuilder={isAgentBuilder}
            saveDraft={saveDraft}
            getDraft={getDraft}
            user={user}
            disableAgentSelector={isBlockedByAgentSwitch}
            submitBlockMessage={submitBlockMessage ?? agentSwitchBlockMessage}
            placeholder={
              willQueueMessage ? t(INPUT_BAR_QUEUE_PLACEHOLDER) : placeholder
            }
            onShake={handleShake}
            isCompact={effectiveIsCompact}
            onExpandInputBar={onExpandInputBar}
            onEditorFocusChange={onEditorFocusChange}
            onOverlayOpenChange={onOverlayOpenChange}
            onVoiceActiveChange={onVoiceActiveChange}
          />
        </div>
      </div>
    </div>
  );
});
