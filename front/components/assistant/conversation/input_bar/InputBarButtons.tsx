import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { CapabilitiesPicker } from "@app/components/assistant/CapabilitiesPicker";
import { InputBarAttachmentsPicker } from "@app/components/assistant/conversation/input_bar/InputBarAttachmentsPicker";
import type { InputBarAction } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { getSupportedFileExtensions } from "@app/types/files";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Avatar, Button, RobotIcon } from "@dust-tt/sparkle";
import React from "react";

interface InputBarButtonsProps {
  actions: InputBarAction[];
  allAgents: LightAgentConfigurationType[];
  attachedNodes: DataSourceViewContentNode[];
  buttonSize: "xs" | "sm";
  clientType: string;
  conversation?: ConversationWithoutContentType;
  disableInput: boolean;
  editorService: ReturnType<typeof useCustomEditor>["editorService"];
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  fileUploaderService: FileUploaderService;
  handleSingleAgentSelect: (mention: RichMention) => void;
  onMCPServerViewSelect: (serverView: MCPServerViewType) => void;
  onNodeSelect: (node: DataSourceViewContentNode) => void;
  onNodeUnselect: (node: DataSourceViewContentNode) => void;
  onSkillSelect: (skill: SkillType) => void;
  owner: WorkspaceType;
  selectedAgent: RichAgentMention | null;
  selectedMCPServerViews: MCPServerViewType[];
  selectedSkills: SkillType[];
  singleAgentInput: boolean;
  space: SpaceType | undefined;
  user: UserType | null;
}

export const InputBarButtons = React.memo(function InputBarButtons({
  actions,
  allAgents,
  attachedNodes,
  buttonSize,
  clientType,
  conversation,
  disableInput,
  editorService,
  fileInputRef,
  fileUploaderService,
  handleSingleAgentSelect,
  onMCPServerViewSelect,
  onNodeSelect,
  onNodeUnselect,
  onSkillSelect,
  owner,
  selectedAgent,
  selectedMCPServerViews,
  selectedSkills,
  singleAgentInput,
  space,
  user,
}: InputBarButtonsProps) {
  const agentButton = (actions.includes("agents-list") ||
    actions.includes("agents-list-with-actions")) && (
    <AgentPicker
      owner={owner}
      size={buttonSize}
      onItemClick={(c) => {
        if (singleAgentInput) {
          handleSingleAgentSelect(toRichAgentMentionType(c));
        } else {
          editorService.insertMention(toRichAgentMentionType(c));
        }
      }}
      agents={allAgents}
      showDropdownArrow={false}
      showFooterButtons={
        actions.includes("agents-list-with-actions") &&
        clientType !== "extension"
      }
      disabled={disableInput}
      pickerButton={
        singleAgentInput ? (
          selectedAgent ? (
            <Button
              variant="ghost-secondary"
              size={buttonSize}
              icon={() => (
                <Avatar size="xxs" visual={selectedAgent.pictureUrl} />
              )}
              label={selectedAgent.label}
            />
          ) : (
            <Button
              variant="ghost-secondary"
              size={buttonSize}
              icon={RobotIcon}
              label="Agent"
            />
          )
        ) : undefined
      }
    />
  );
  const toolsButton = actions.includes("capabilities") && (
    <CapabilitiesPicker
      owner={owner}
      user={user}
      selectedMCPServerViews={selectedMCPServerViews}
      onSelect={onMCPServerViewSelect}
      selectedSkills={selectedSkills}
      onSkillSelect={onSkillSelect}
      disabled={disableInput}
      buttonSize={buttonSize}
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
          disabled={disableInput}
          buttonSize={buttonSize}
          toolFileUpload={{
            useCase: "conversation",
            useCaseMetadata: {
              conversationId: conversation?.sId,
            },
          }}
          space={space}
          type="dropdown"
        />
      </>
    );
  return singleAgentInput ? (
    <>
      {agentButton}
      {toolsButton}
      {attachmentButton}
    </>
  ) : (
    <>
      {attachmentButton}
      {toolsButton}
      {agentButton}
    </>
  );
});
