import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { CapabilitiesPicker } from "@app/components/assistant/CapabilitiesPicker";
import type { InputBarAction } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarModelPicker } from "@app/components/assistant/conversation/input_bar/InputBarModelPicker";
import { InputBarPlusMenu } from "@app/components/assistant/conversation/input_bar/InputBarPlusMenu";
import type useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useAppRouter } from "@app/lib/platform";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { setQueryParam } from "@app/lib/utils/router";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { getSupportedFileExtensions } from "@app/types/files";
import type { SpaceType } from "@app/types/space";
import { isProjectType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  cn,
  Icon,
  InfoCircle,
  Robot,
  Tooltip,
} from "@dust-tt/sparkle";
import React from "react";

interface InputBarButtonsProps {
  actions: InputBarAction[];
  allAgents: LightAgentConfigurationType[];
  attachedNodes: DataSourceViewContentNode[];
  buttonSize: "xs" | "sm";
  clientType: string;
  conversation?: ConversationWithoutContentType;
  disableAgentSelector: boolean;
  editorService: ReturnType<typeof useCustomEditor>["editorService"];
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  fileUploaderService: FileUploaderService;
  handleSingleAgentSelect: (mention: RichMention) => void;
  hideCapabilities: boolean;
  // When true, the pod's configured default agent isn't available to the
  // current member (unpublished/deleted), so @dust is shown instead. Surfaces
  // a notice on the agent pill.
  isDefaultAgentUnavailable: boolean;
  // When true, disables every picker (tools, attachment) in addition to the
  // agent selector which is muted via `disableAgentSelector`.
  isInputDisabled: boolean;
  lastRequestedModel: ModelSelectionType | null;
  onAgentRemove: () => void;
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onModelSelectionChange?: (
    modelSelection: ModelSelectionType | undefined
  ) => void;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  onSkillSelect: (skill: SkillWithoutInstructionsAndToolsType) => void;
  owner: WorkspaceType;
  selectedAgent: RichAgentMention | null;
  selectedMCPServerViews: MCPServerViewType[];
  selectedSpaceIds: string[];
  onSelectedSpaceIdsChange: (spaceIds: string[]) => void;
  space: SpaceType | undefined;
  user: UserType | null;
  onAgentPickerOpenChange?: (open: boolean) => void;
  onCapabilitiesPickerOpenChange?: (open: boolean) => void;
  onAttachmentsPickerOpenChange?: (open: boolean) => void;
}

export const InputBarButtons = React.memo(function InputBarButtons({
  actions,
  allAgents,
  attachedNodes,
  buttonSize,
  clientType,
  conversation,
  disableAgentSelector,
  editorService,
  fileInputRef,
  fileUploaderService,
  handleSingleAgentSelect,
  hideCapabilities,
  isDefaultAgentUnavailable,
  isInputDisabled,
  lastRequestedModel,
  onAgentRemove,
  onMCPServerViewSelect,
  onModelSelectionChange,
  onNodeSelect,
  onNodeUnselect,
  onSkillSelect,
  owner,
  selectedAgent,
  selectedMCPServerViews,
  selectedSpaceIds,
  onSelectedSpaceIdsChange,
  space,
  user,
  onAgentPickerOpenChange,
  onCapabilitiesPickerOpenChange,
  onAttachmentsPickerOpenChange,
}: InputBarButtonsProps) {
  const router = useAppRouter();
  const isWidthConstrained = useIsMobile() || clientType === "extension";
  // Current space is taken from the conversation (if already set) or from the space prop (if provided).
  const spaceId = conversation?.spaceId ?? space?.sId ?? undefined;

  const isPod = space ? isProjectType(space) : false;
  const defaultAgentUnavailableLabel = isPod
    ? "This Pod's default agent isn't available to you, so @dust is used instead. Discuss with your Pod editors if you think this is an error."
    : "This conversation's default agent isn't available to you, so @dust is used instead. Discuss with your Workspace admin if you think this is an error.";

  const handleAgentDetailsClick = (agentId: string) => {
    setQueryParam(router, "agentDetails", agentId);
  };

  const agentButton = (actions.includes("agents-list") ||
    actions.includes("agents-list-with-actions")) && (
    <AgentPicker
      owner={owner}
      size={buttonSize}
      onAgentDetailsClick={handleAgentDetailsClick}
      onOpenChange={onAgentPickerOpenChange}
      onItemClick={(c) => {
        handleSingleAgentSelect(toRichAgentMentionType(c));
      }}
      agents={allAgents}
      selectedAgentId={selectedAgent?.id}
      onDeselect={onAgentRemove}
      showDropdownArrow={false}
      side={conversation ? "top" : "bottom"}
      showFooterButtons={
        actions.includes("agents-list-with-actions") &&
        clientType !== "extension"
      }
      pickerButton={
        selectedAgent ? (
          <div
            role="button"
            tabIndex={isInputDisabled ? -1 : 0}
            aria-label={`Selected agent: ${selectedAgent.label}`}
            aria-disabled={isInputDisabled}
            className={cn(
              "inline-flex box-border items-center rounded-full h-7 heading-xs px-2 gap-1.5 text-primary-900 transition-colors duration-200",
              "border-[0.5px] border-border-dark bg-background dark:bg-[oklch(0.346_0.009_80.674)]",
              "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]",
              isWidthConstrained && "pl-1",
              isInputDisabled
                ? "opacity-50 pointer-events-none"
                : "cursor-pointer hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]"
            )}
          >
            <Avatar size="3xs" visual={selectedAgent.pictureUrl} />
            {!isWidthConstrained && (
              <span className="grow truncate notranslate">
                {selectedAgent.label}
              </span>
            )}
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
                label={defaultAgentUnavailableLabel}
              />
            )}
          </div>
        ) : (
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={Robot}
            label={!isWidthConstrained ? "Agent" : undefined}
            disabled={isInputDisabled}
            isRounded
            className={cn(
              "border-[0.5px] border-border-dark bg-background dark:bg-[oklch(0.346_0.009_80.674)]",
              "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]",
              "hover:bg-primary-100",
              disableAgentSelector && "bg-primary-150"
            )}
          />
        )
      }
    />
  );
  const isExtension = clientType === "extension";

  // The extension has its own separate attachment/capture flow, so it keeps
  // the pre-redesign left cluster (agent + model + capabilities, no
  // attachments) unchanged.
  const toolsButton = actions.includes("capabilities") && (
    <CapabilitiesPicker
      owner={owner}
      user={user}
      selectedMCPServerViews={selectedMCPServerViews}
      onSelect={onMCPServerViewSelect}
      onSkillSelect={onSkillSelect}
      onOpenChange={onCapabilitiesPickerOpenChange}
      buttonSize={buttonSize}
      disabled={isInputDisabled}
    />
  );

  const selectedAgentModel =
    (selectedAgent &&
      allAgents.find((a) => a.sId === selectedAgent.id)?.model) ??
    null;

  const modelPickerButton = actions.includes("model-picker") && (
    <InputBarModelPicker
      agentModel={selectedAgentModel}
      agentId={selectedAgent?.id ?? null}
      lastRequestedModel={lastRequestedModel}
      owner={owner}
      buttonSize={buttonSize}
      side={conversation ? "top" : "bottom"}
      disabled={isInputDisabled}
      onSelectionChange={onModelSelectionChange}
    />
  );

  const hiddenFileInput = (
    <input
      accept={getSupportedFileExtensions().join(",")}
      onChange={async (e) => {
        await fileUploaderService.handleFileChange(e);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        editorService.focusEnd();
      }}
      ref={fileInputRef}
      style={{ display: "none" }}
      type="file"
      multiple={true}
    />
  );

  return (
    <>
      {hiddenFileInput}
      {isExtension ? (
        <>
          {agentButton}
          {modelPickerButton}
          {!hideCapabilities && toolsButton}
        </>
      ) : (
        <>
          <InputBarPlusMenu
            owner={owner}
            user={user}
            buttonSize={buttonSize}
            disabled={isInputDisabled}
            hideCapabilities={
              hideCapabilities || !actions.includes("capabilities")
            }
            hideAttachments={!actions.includes("attachment")}
            selectedMCPServerViews={selectedMCPServerViews}
            onMCPServerViewSelect={onMCPServerViewSelect}
            onSkillSelect={onSkillSelect}
            fileUploaderService={fileUploaderService}
            onNodeSelect={onNodeSelect}
            onNodeUnselect={onNodeUnselect}
            attachedNodes={attachedNodes}
            conversation={conversation}
            spaceId={spaceId}
            selectedSpaceIds={selectedSpaceIds}
            onSelectedSpaceIdsChange={onSelectedSpaceIdsChange}
            onCapabilitiesPickerOpenChange={onCapabilitiesPickerOpenChange}
            onAttachmentsPickerOpenChange={onAttachmentsPickerOpenChange}
          />
          {agentButton}
        </>
      )}
    </>
  );
});
