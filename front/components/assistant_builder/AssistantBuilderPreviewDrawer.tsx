import {
  BarChartIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MagicIcon,
  Markdown,
  MoreIcon,
  Page,
  Tabs,
  TabsList,
  TabsTrigger,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Separator } from "@radix-ui/react-select";
import { useContext, useEffect, useRef, useState } from "react";

import { AssistantDetailsPerformance } from "@app/components/assistant/AssistantDetailsPerformance";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  usePreviewAssistant,
  useTryAssistantCore,
} from "@app/components/assistant_builder/TryAssistant";
import type {
  AssistantBuilderSetActionType,
  AssistantBuilderState,
  BuilderScreen,
  TemplateActionType,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import { useUser } from "@app/lib/swr/user";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type {
  AssistantBuilderRightPanelTabType,
  ModelConfigurationType,
  WorkspaceType,
} from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";
import { isAssistantBuilderRightPanelTab } from "@app/types";

interface AssistantBuilderRightPanelProps {
  screen: BuilderScreen;
  template: FetchAssistantTemplateResponse | null;
  removeTemplate: () => Promise<void>;
  resetToTemplateInstructions: () => Promise<void>;
  resetToTemplateActions: () => Promise<void>;
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  agentConfiguration: LightAgentConfigurationType | null;
  setAction: (action: AssistantBuilderSetActionType) => void;
  reasoningModels: ModelConfigurationType[];
}

export default function AssistantBuilderRightPanel({
  screen,
  template,
  removeTemplate,
  resetToTemplateInstructions,
  resetToTemplateActions,
  owner,
  builderState,
  agentConfiguration,
  setAction,
  reasoningModels,
}: AssistantBuilderRightPanelProps) {
  const [rightPanelTab, setRightPanelTab] =
    useState<AssistantBuilderRightPanelTabType>("Preview");

  const { draftAssistant, isSavingDraftAgent, createDraftAgent } =
    usePreviewAssistant({
      owner,
      builderState,
      reasoningModels,
    });

  const { user } = useUser();
  const { conversation, stickyMentions, setStickyMentions, handleSubmit } =
    useTryAssistantCore({
      owner,
      user,
      assistant: draftAssistant,
      createDraftAgent,
    });

  const isBuilderStateEmpty =
    !builderState.instructions?.trim() && !builderState.actions.length;

  const previousDraftSId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      draftAssistant?.sId &&
      previousDraftSId.current !== draftAssistant.sId
    ) {
      previousDraftSId.current = draftAssistant.sId;
      // Update sticky mentions to use the new draft assistant
      setStickyMentions([{ configurationId: draftAssistant.sId }]);
    }
  }, [draftAssistant?.sId, setStickyMentions]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 pt-4">
        <Tabs
          value={rightPanelTab ?? "Preview"}
          onValueChange={(t) => {
            if (isAssistantBuilderRightPanelTab(t)) {
              setRightPanelTab(t);
            }
          }}
          className="hidden lg:block"
        >
          <TabsList>
            {template && (
              <TabsTrigger value="Template" label="Template" icon={MagicIcon} />
            )}
            <TabsTrigger
              value="Preview"
              label="Preview"
              icon={ChatBubbleBottomCenterTextIcon}
            />
            {/* The agentConfigurationId is truthy if not a new agent */}
            {agentConfiguration && (
              <TabsTrigger
                value="Performance"
                label="Performance"
                icon={BarChartIcon}
              />
            )}
          </TabsList>
        </Tabs>
      </div>
      <div
        className={cn(
          "grow-1 mb-5 h-full overflow-y-auto",
          rightPanelTab === "Preview" ? "" : "border-b border-border"
        )}
      >
        {rightPanelTab === "Preview" && user && (
          <div className="flex h-full w-full flex-1 flex-col justify-between overflow-x-hidden">
            {isBuilderStateEmpty ? (
              <div className="flex h-full w-full items-center justify-center">
                <div className="text-center">
                  <span className="block cursor-pointer whitespace-nowrap px-4 py-2 text-muted-foreground">
                    Start configuring your assistant and try it out!
                  </span>
                </div>
              </div>
            ) : (
              <ConversationsNavigationProvider>
                <ActionValidationProvider owner={owner}>
                  <GenerationContextProvider>
                    <div className="flex-grow overflow-y-auto">
                      {conversation && (
                        <ConversationViewer
                          owner={owner}
                          user={user}
                          conversationId={conversation.sId}
                          onStickyMentionsChange={setStickyMentions}
                          isInModal
                          key={conversation.sId}
                        />
                      )}
                    </div>
                    <div className="shrink-0">
                      <AssistantInputBar
                        disableButton={isSavingDraftAgent}
                        owner={owner}
                        onSubmit={handleSubmit}
                        stickyMentions={stickyMentions}
                        conversationId={conversation?.sId || null}
                        additionalAgentConfiguration={
                          draftAssistant ?? undefined
                        }
                        actions={["attachment"]}
                        disableAutoFocus
                        isFloating={false}
                      />
                    </div>
                  </GenerationContextProvider>
                </ActionValidationProvider>
              </ConversationsNavigationProvider>
            )}
          </div>
        )}
        {rightPanelTab === "Template" &&
          template &&
          screen === "instructions" && (
            <div className="mb-72 flex flex-col gap-4">
              <div className="flex items-end justify-end pt-2">
                <TemplateDropDownMenu
                  screen={screen}
                  removeTemplate={removeTemplate}
                  resetToTemplateInstructions={resetToTemplateInstructions}
                  resetToTemplateActions={resetToTemplateActions}
                  setRightPanelTab={setRightPanelTab}
                />
              </div>
              {template?.helpInstructions && (
                <Markdown content={template?.helpInstructions ?? ""} />
              )}
            </div>
          )}
        {rightPanelTab === "Template" && template && screen === "actions" && (
          <div className="mb-72 flex flex-col gap-4">
            <div className="flex items-end justify-end pt-2">
              <TemplateDropDownMenu
                screen={screen}
                removeTemplate={removeTemplate}
                resetToTemplateInstructions={resetToTemplateInstructions}
                resetToTemplateActions={resetToTemplateActions}
                setRightPanelTab={setRightPanelTab}
              />
            </div>
            <Page.Separator />
            <div className="flex flex-col gap-4">
              {template && template.helpActions && (
                <>
                  <div>
                    <Markdown content={template?.helpActions ?? ""} />
                  </div>
                  <Separator />
                </>
              )}
              {template && template.presetActions.length > 0 && (
                <div className="flex flex-col gap-6">
                  <Page.SectionHeader title="Add those tools" />
                  {template.presetActions.map((presetAction, index) => (
                    <div className="flex flex-col gap-2" key={index}>
                      <div>{presetAction.help}</div>
                      <TemplateAddActionButton
                        action={presetAction}
                        addAction={(presetAction) => {
                          const action = getDefaultActionConfiguration(
                            presetAction.type
                          );
                          if (!action) {
                            // Unreachable
                            return;
                          }
                          action.name = presetAction.name;
                          action.description = presetAction.description;
                          setAction({
                            type: action.noConfigurationRequired
                              ? "insert"
                              : "pending",
                            action,
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {rightPanelTab === "Performance" && agentConfiguration && (
          <div className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
            <AssistantDetailsPerformance
              agentConfiguration={agentConfiguration}
              owner={owner}
              gridMode
            />
          </div>
        )}
      </div>
    </div>
  );
}

const TemplateAddActionButton = ({
  action,
  addAction,
}: {
  action: TemplateActionType;
  addAction: (action: TemplateActionType) => void;
}) => {
  const spec = ACTION_SPECIFICATIONS[action.type];
  if (!spec) {
    // Unreachable
    return null;
  }
  return (
    <div className="w-auto">
      <Button
        icon={spec.cardIcon}
        label={`Add tool “${spec.label}”`}
        size="sm"
        variant="outline"
        onClick={() => addAction(action)}
      />
    </div>
  );
};

interface TemplateDropDownMenuProps {
  setRightPanelTab: (tabName: AssistantBuilderRightPanelTabType) => void;
  removeTemplate: () => Promise<void>;
  resetToTemplateActions: () => Promise<void>;
  resetToTemplateInstructions: () => Promise<void>;
  screen: BuilderScreen;
}

const TemplateDropDownMenu = ({
  setRightPanelTab,
  removeTemplate,
  resetToTemplateActions,
  resetToTemplateInstructions,
  screen,
}: TemplateDropDownMenuProps) => {
  const confirm = useContext(ConfirmContext);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={MoreIcon} size="sm" variant="ghost" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="Close the template"
          onClick={async () => {
            const confirmed = await confirm({
              title: "Are you sure you want to close the template?",
              message:
                "Your agent will remain as it is but will not display template's help any more.",
              validateVariant: "warning",
            });
            if (confirmed) {
              setRightPanelTab("Preview");
              await removeTemplate();
            }
          }}
          icon={XMarkIcon}
        />
        {screen === "instructions" && (
          <DropdownMenuItem
            label="Reset instructions"
            description="Set instructions back to template's default"
            onClick={async () => {
              const confirmed = await confirm({
                title: "Are you sure?",
                message:
                  "You will lose the changes you have made to the agent's instructions and go back to the template's default settings.",
                validateVariant: "warning",
              });
              if (confirmed) {
                await resetToTemplateInstructions();
              }
            }}
            icon={MagicIcon}
          />
        )}
        {screen === "actions" && (
          <DropdownMenuItem
            label="Reset tools"
            description="Remove all tools"
            onClick={async () => {
              const confirmed = await confirm({
                title: "Are you sure?",
                message:
                  "You will lose the changes you have made to the agent's tools.",
                validateVariant: "warning",
              });
              if (confirmed) {
                await resetToTemplateActions();
              }
            }}
            icon={MagicIcon}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
