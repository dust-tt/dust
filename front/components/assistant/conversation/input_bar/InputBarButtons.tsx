import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { CapabilitiesPicker } from "@app/components/assistant/CapabilitiesPicker";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import type { InputBarAction } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useAppRouter } from "@app/lib/platform";
import { setQueryParam } from "@app/lib/utils/router";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { getSupportedFileExtensions } from "@app/types/files";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Avatar, Button, cn, RobotV2, XCloseV2 } from "@dust-tt/sparkle";
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
  // When true, disables every picker (tools, attachment) in addition to the
  // agent selector which is muted via `disableAgentSelector`.
  isInputDisabled: boolean;
  onAgentRemove: () => void;
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  onSkillSelect: (skill: SkillWithoutInstructionsAndToolsType) => void;
  owner: WorkspaceType;
  selectedAgent: RichAgentMention | null;
  selectedMCPServerViews: MCPServerViewType[];
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
  isInputDisabled,
  onAgentRemove,
  onMCPServerViewSelect,
  onNodeSelect,
  onNodeUnselect,
  onSkillSelect,
  owner,
  selectedAgent,
  selectedMCPServerViews,
  space,
  user,
  onAgentPickerOpenChange,
  onCapabilitiesPickerOpenChange,
  onAttachmentsPickerOpenChange,
}: InputBarButtonsProps) {
  const router = useAppRouter();
  // Current space is taken from the conversation (if already set) or from the space prop (if provided).
  const spaceId = conversation?.spaceId ?? space?.sId ?? undefined;

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
              "inline-flex box-border items-center rounded-lg h-7 heading-xs px-2 gap-1.5 bg-muted-background border-border dark:bg-muted-background-night dark:border-border-night text-primary-900 dark:text-primary-900-night transition-colors duration-200",
              isInputDisabled
                ? "opacity-50 pointer-events-none"
                : "cursor-pointer hover:bg-hover dark:hover:bg-hover-night"
            )}
          >
            <Avatar size="xxs" visual={selectedAgent.pictureUrl} />
            <span className="grow truncate notranslate">
              {selectedAgent.label}
            </span>
            <button
              type="button"
              aria-label="Remove agent"
              className="p-0.5 text-faint dark:text-faint-night hover:text-foreground transition-colors duration-200"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAgentRemove();
              }}
            >
              <XCloseV2 className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={RobotV2}
            label="Agent"
            disabled={isInputDisabled}
            className={cn(
              disableAgentSelector && "bg-gray-150 dark:bg-gray-800"
            )}
          />
        )
      }
    />
  );
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
  const attachmentButton = actions.includes("attachment") &&
    clientType !== "extension" && (
      <>
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
        <InputBarAttachmentsPicker
          fileUploaderService={fileUploaderService}
          owner={owner}
          isLoading={false}
          onNodeSelect={onNodeSelect}
          onNodeUnselect={onNodeUnselect}
          attachedNodes={attachedNodes}
          buttonSize={buttonSize}
          onOpenChange={onAttachmentsPickerOpenChange}
          toolFileUpload={{
            useCase: "conversation",
            useCaseMetadata: {
              conversationId: conversation?.sId,
            },
          }}
          spaceId={spaceId}
          type="dropdown"
          disabled={isInputDisabled}
        />
      </>
    );
  return (
    <>
      {agentButton}
      {!hideCapabilities && toolsButton}
      {attachmentButton}
    </>
  );
});
