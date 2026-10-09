import { AgentPicker } from "@app/components/assistant/AgentPicker";
import {
  CapabilitiesPicker,
  CapabilitySetupDialog,
} from "@app/components/assistant/CapabilitiesPicker";
import type { InputBarAction } from "@app/components/assistant/conversation/input_bar/inputBarActions";
import { InputBarModelPicker } from "@app/components/assistant/conversation/input_bar/InputBarModelPicker";
import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
} from "@app/components/assistant/conversation/input_bar/inputBarPillStyles";
import type { InputBarPlusMenuSlashMenu } from "@app/components/assistant/conversation/input_bar/InputBarPlusMenu";
import { InputBarPlusMenu } from "@app/components/assistant/conversation/input_bar/InputBarPlusMenu";
import { getInputBarSlashMenuMode } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerType, MCPServerViewLightType } from "@app/lib/api/mcp";
import { useAppRouter } from "@app/lib/platform";
import { useIsMobile, useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { setQueryParam } from "@app/lib/utils/router";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
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
import { useLingui } from "@lingui/react/macro";
import React from "react";

interface InputBarButtonsProps {
  actions: InputBarAction[];
  allAgents: LightAgentConfigurationType[];
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
  // When true, `selectedAgent` is still being resolved and the @dust pill stands in for it.
  isSelectedAgentPending: boolean;
  lastRequestedModel: ModelSelectionType | null;
  onAgentRemove: () => void;
  onMCPServerViewSelect: (serverView: MCPServerViewLightType) => void;
  // Read-at-submit sink for the model picker; prefer over a change callback
  // when the parent only needs the value at submit time.
  modelSelectionRef?: React.MutableRefObject<ModelSelectionType | undefined>;
  modelSelectionCommitRef?: React.MutableRefObject<
    ((selection: Selection) => void) | null
  >;
  onSkillSelect: (
    skill: Pick<SkillListItemType, "sId" | "name" | "icon">
  ) => void;
  owner: WorkspaceType;
  selectedAgent: RichAgentMention | null;
  space: SpaceType | undefined;
  user: UserType | null;
  onAgentPickerOpenChange?: (open: boolean) => void;
  onCapabilitiesPickerOpenChange?: (open: boolean) => void;
  onPlusMenuOpenChange?: (open: boolean) => void;
  slashMenu: InputBarPlusMenuSlashMenu;
}

// @dust is the most common resolved agent, so showing it while loading avoids a layout shift.
const LOADING_AGENT_PLACEHOLDER: RichAgentMention = {
  id: GLOBAL_AGENTS_SID.DUST,
  type: "agent",
  label: "dust",
  pictureUrl: DUST_AVATAR_URL,
  description: "",
};

// The pill for the selected agent, with a notice when the default agent had to be replaced.
function SelectedAgentPill({
  buttonSize,
  isDefaultAgentUnavailable,
  selectedAgent,
  space,
}: Pick<
  InputBarButtonsProps,
  "buttonSize" | "isDefaultAgentUnavailable" | "space"
> & { selectedAgent: RichAgentMention }) {
  const { t } = useLingui();
  const isMobile = useIsMobile();
  const isWidthConstrained = useIsWidthConstrained();
  const isPod = space ? isProjectType(space) : false;
  const defaultAgentUnavailableLabel = isPod
    ? t`This Pod's default agent isn't available to you, so @dust is used instead. Discuss with your Pod editors if you think this is an error.`
    : t`This conversation's default agent isn't available to you, so @dust is used instead. Discuss with your Workspace admin if you think this is an error.`;
  const selectedAgentName = selectedAgent.label;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t`Selected agent: ${selectedAgentName}`}
      className={cn(
        "inline-flex box-border items-center rounded-full heading-sm px-2 gap-1.5 text-primary-900 transition-colors duration-200",
        buttonSize === "xs" ? "h-6" : "h-8",
        INPUT_BAR_PILL_SURFACE_CLASSNAME,
        isWidthConstrained && "pl-1",
        "cursor-pointer",
        INPUT_BAR_PILL_HOVER_CLASSNAME
      )}
    >
      <Avatar size="3xs" visual={selectedAgent.pictureUrl} />
      {(!isWidthConstrained || isMobile) && (
        <span className="grow truncate notranslate">{selectedAgent.label}</span>
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
  );
}

// The agent pill or the "Agent" button, either opening the agent picker.
function InputBarAgentButton({
  allAgents,
  buttonSize,
  conversation,
  disableAgentSelector,
  handleSingleAgentSelect,
  isDefaultAgentUnavailable,
  isSelectedAgentPending,
  onAgentPickerOpenChange,
  onAgentRemove,
  owner,
  selectedAgent,
  showFooterButtons,
  space,
}: Pick<
  InputBarButtonsProps,
  | "allAgents"
  | "buttonSize"
  | "conversation"
  | "disableAgentSelector"
  | "handleSingleAgentSelect"
  | "isDefaultAgentUnavailable"
  | "isSelectedAgentPending"
  | "onAgentPickerOpenChange"
  | "onAgentRemove"
  | "owner"
  | "selectedAgent"
  | "space"
> & { showFooterButtons: boolean }) {
  const { t } = useLingui();
  const router = useAppRouter();
  const isWidthConstrained = useIsWidthConstrained();
  const displayedAgent =
    selectedAgent ??
    (isSelectedAgentPending ? LOADING_AGENT_PLACEHOLDER : null);

  return (
    <AgentPicker
      owner={owner}
      size={buttonSize}
      onAgentDetailsClick={(agentId) =>
        setQueryParam(router, "agentDetails", agentId)
      }
      onOpenChange={onAgentPickerOpenChange}
      onItemClick={(c) => {
        handleSingleAgentSelect(toRichAgentMentionType(c));
      }}
      agents={allAgents}
      selectedAgentId={selectedAgent?.id}
      onDeselect={onAgentRemove}
      showFavoritesFirst
      showDropdownArrow={false}
      side={conversation ? "top" : "bottom"}
      showFooterButtons={showFooterButtons}
      pickerButton={
        displayedAgent ? (
          <SelectedAgentPill
            buttonSize={buttonSize}
            isDefaultAgentUnavailable={isDefaultAgentUnavailable}
            selectedAgent={displayedAgent}
            space={space}
          />
        ) : (
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={Robot}
            label={
              !isWidthConstrained
                ? t({ message: "Agent", context: "button label" })
                : undefined
            }
            isRounded
            className={cn(
              INPUT_BAR_PILL_SURFACE_CLASSNAME,
              INPUT_BAR_PILL_HOVER_CLASSNAME,
              disableAgentSelector && "bg-primary-150"
            )}
          />
        )
      }
    />
  );
}

// The capabilities picker with the setup dialog a picked server may need.
function InputBarCapabilitiesButton({
  buttonSize,
  onCapabilitiesPickerOpenChange,
  onMCPServerViewSelect,
  onSkillSelect,
  owner,
  user,
}: Pick<
  InputBarButtonsProps,
  | "buttonSize"
  | "onCapabilitiesPickerOpenChange"
  | "onMCPServerViewSelect"
  | "onSkillSelect"
  | "owner"
  | "user"
>) {
  const [serverToSetup, setServerToSetup] =
    React.useState<MCPServerType | null>(null);

  return (
    <>
      <CapabilitiesPicker
        owner={owner}
        user={user}
        onSelect={onMCPServerViewSelect}
        onSkillSelect={onSkillSelect}
        onSetupServer={setServerToSetup}
        onOpenChange={onCapabilitiesPickerOpenChange}
        buttonSize={buttonSize}
      />
      {serverToSetup && (
        <CapabilitySetupDialog
          owner={owner}
          server={serverToSetup}
          onClose={() => setServerToSetup(null)}
          onServerViewAdded={onMCPServerViewSelect}
        />
      )}
    </>
  );
}

// Only reachable through the `/upload-file` slash command, which is gated on the same action.
function InputBarHiddenFileInput({
  editorService,
  fileInputRef,
  fileUploaderService,
}: Pick<
  InputBarButtonsProps,
  "editorService" | "fileInputRef" | "fileUploaderService"
>) {
  return (
    <input
      accept={fileUploaderService.acceptedFileExtensions.join(",")}
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
}

export const InputBarButtons = React.memo(function InputBarButtons({
  actions,
  allAgents,
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
  isSelectedAgentPending,
  lastRequestedModel,
  onAgentRemove,
  onMCPServerViewSelect,
  modelSelectionRef,
  modelSelectionCommitRef,
  onSkillSelect,
  owner,
  selectedAgent,
  space,
  user,
  onAgentPickerOpenChange,
  onCapabilitiesPickerOpenChange,
  onPlusMenuOpenChange,
  slashMenu,
}: InputBarButtonsProps) {
  const isExtension = clientType === "extension";
  const shouldShowPlusMenu = getInputBarSlashMenuMode(actions) !== null;

  const agentButton = (actions.includes("agents-list") ||
    actions.includes("agents-list-with-actions")) && (
    <InputBarAgentButton
      allAgents={allAgents}
      buttonSize={buttonSize}
      conversation={conversation}
      disableAgentSelector={disableAgentSelector}
      handleSingleAgentSelect={handleSingleAgentSelect}
      isDefaultAgentUnavailable={isDefaultAgentUnavailable}
      isSelectedAgentPending={isSelectedAgentPending}
      onAgentPickerOpenChange={onAgentPickerOpenChange}
      onAgentRemove={onAgentRemove}
      owner={owner}
      selectedAgent={selectedAgent}
      showFooterButtons={
        actions.includes("agents-list-with-actions") && !isExtension
      }
      space={space}
    />
  );

  const selectedAgentModel =
    (selectedAgent &&
      allAgents.find((a) => a.sId === selectedAgent.id)?.model) ??
    null;

  return (
    <>
      {actions.includes("attachment") && (
        <InputBarHiddenFileInput
          editorService={editorService}
          fileInputRef={fileInputRef}
          fileUploaderService={fileUploaderService}
        />
      )}
      {agentButton}
      {isExtension ? (
        <>
          {actions.includes("model-picker") && (
            <InputBarModelPicker
              agentModel={selectedAgentModel}
              agentId={selectedAgent?.id ?? null}
              lastRequestedModel={lastRequestedModel}
              owner={owner}
              buttonSize={buttonSize}
              side={conversation ? "top" : "bottom"}
              selectionRef={modelSelectionRef}
              commitApiRef={modelSelectionCommitRef}
            />
          )}
          {!hideCapabilities && actions.includes("capabilities") && (
            <InputBarCapabilitiesButton
              buttonSize={buttonSize}
              onCapabilitiesPickerOpenChange={onCapabilitiesPickerOpenChange}
              onMCPServerViewSelect={onMCPServerViewSelect}
              onSkillSelect={onSkillSelect}
              owner={owner}
              user={user}
            />
          )}
        </>
      ) : (
        shouldShowPlusMenu && (
          <InputBarPlusMenu
            buttonSize={buttonSize}
            onOpenChange={onPlusMenuOpenChange}
            owner={owner}
            slashMenu={slashMenu}
          />
        )
      )}
    </>
  );
});
