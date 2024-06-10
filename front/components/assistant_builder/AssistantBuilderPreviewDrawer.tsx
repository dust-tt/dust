import {
  Button,
  CardButton,
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  Icon,
  IconButton,
  LightbulbIcon,
  MagicIcon,
  Markdown,
  MoreIcon,
  Page,
  PlusCircleStrokeIcon,
  Spinner,
  Tab,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  AssistantBuilderRightPanelStatus,
  AssistantBuilderRightPanelTab,
  WorkspaceType,
} from "@dust-tt/types";
import { Separator } from "@radix-ui/react-select";
import _ from "lodash";
import { useContext, useEffect, useMemo } from "react";

import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  usePreviewAssistant,
  useTryAssistantCore,
} from "@app/components/assistant/TryAssistant";
import type { BuilderScreen } from "@app/components/assistant_builder/AssistantBuilder";
import type {
  AssistantBuilderState,
  TemplateActionType,
} from "@app/components/assistant_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import { ACTION_SPECIFICATIONS } from "@app/lib/api/assistant/actions/utils";
import { useUser } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

export default function AssistantBuilderRightPanel({
  screen,
  template,
  resetTemplate,
  resetToTemplateInstructions,
  resetToTemplateActions,
  owner,
  rightPanelStatus,
  openRightPanelTab,
  builderState,
  multiActionsMode,
}: {
  screen: BuilderScreen;
  template: FetchAssistantTemplateResponse | null;
  resetTemplate: () => Promise<void>;
  resetToTemplateInstructions: () => Promise<void>;
  resetToTemplateActions: () => Promise<void>;
  owner: WorkspaceType;
  rightPanelStatus: AssistantBuilderRightPanelStatus;
  openRightPanelTab: (tabName: AssistantBuilderRightPanelTab) => void;
  builderState: AssistantBuilderState;
  multiActionsMode: boolean;
}) {
  const tabsConfig = useMemo(
    () => [
      {
        label: "Template",
        current: rightPanelStatus.tab === "Template",
        onClick: () => {
          openRightPanelTab("Template");
        },
        icon: MagicIcon,
      },
      {
        label: "Preview",
        current: rightPanelStatus.tab === "Preview",
        onClick: () => {
          openRightPanelTab("Preview");
        },
        icon: ChatBubbleBottomCenterTextIcon,
      },
    ],
    [rightPanelStatus.tab, openRightPanelTab]
  );

  const {
    shouldAnimate: shouldAnimatePreviewDrawer,
    draftAssistant,
    isFading,
  } = usePreviewAssistant({
    owner,
    builderState,
    isPreviewOpened: rightPanelStatus.tab === "Preview",
    multiActionsMode,
  });

  const { user } = useUser();
  const {
    conversation,
    setConversation,
    stickyMentions,
    setStickyMentions,
    handleSubmit,
  } = useTryAssistantCore({
    owner,
    user,
    assistant: draftAssistant,
  });

  useEffect(() => {
    setConversation(null);
  }, [draftAssistant?.sId, setConversation]);

  useEffect(() => {
    if (rightPanelStatus.tab === "Template" && screen === "naming") {
      openRightPanelTab("Preview");
    }
  }, [screen, rightPanelStatus.tab, openRightPanelTab]);

  return (
    <div className="flex h-full flex-col">
      {template && (
        <div className="shrink-0 bg-white pt-5">
          <Tab tabs={tabsConfig} variant="default" className="hidden lg:flex" />
        </div>
      )}
      <div
        className={classNames(
          template !== null
            ? "grow-1 mb-5 h-full overflow-y-auto rounded-b-xl border-x border-b border-structure-200 bg-structure-50 pt-5"
            : "grow-1 mb-5 mt-5 h-full overflow-y-auto rounded-xl border border-structure-200 bg-structure-50",
          shouldAnimatePreviewDrawer &&
            rightPanelStatus.tab === "Preview" &&
            rightPanelStatus.openedAt != null &&
            // Only animate the reload if the drawer has been open for at least 1 second.
            // This is to prevent the animation from triggering right after the drawer is opened.
            Date.now() - rightPanelStatus.openedAt > 1000
            ? "animate-reload"
            : ""
        )}
      >
        {(rightPanelStatus.tab === "Preview" || screen === "naming") &&
          user && (
            <div className="flex h-full w-full flex-1 flex-col justify-between overflow-x-hidden">
              {draftAssistant ? (
                <GenerationContextProvider>
                  <div className="flex-grow overflow-y-auto">
                    {conversation && (
                      <ConversationViewer
                        owner={owner}
                        user={user}
                        conversationId={conversation.sId}
                        onStickyMentionsChange={setStickyMentions}
                        isInModal
                        hideReactions
                        isFading={isFading}
                        key={conversation.sId}
                      />
                    )}
                  </div>
                  <div className="shrink-0">
                    <AssistantInputBar
                      owner={owner}
                      onSubmit={handleSubmit}
                      stickyMentions={stickyMentions}
                      conversationId={conversation?.sId || null}
                      additionalAgentConfiguration={draftAssistant}
                      hideQuickActions
                      disableAutoFocus
                      isFloating={false}
                    />
                  </div>
                </GenerationContextProvider>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Spinner />
                </div>
              )}
            </div>
          )}
        {rightPanelStatus.tab === "Template" &&
          template &&
          screen === "instructions" && (
            <div className="mb-72 flex flex-col gap-4 px-6">
              <div className="flex items-end justify-between pt-2">
                <Page.Header
                  icon={LightbulbIcon}
                  title="Template's Instructions manual"
                />
                <TemplateDropDownMenu
                  screen={screen}
                  resetTemplate={resetTemplate}
                  resetToTemplateInstructions={resetToTemplateInstructions}
                  resetToTemplateActions={resetToTemplateActions}
                  openRightPanelTab={openRightPanelTab}
                />
              </div>
              <Page.Separator />
              {template?.helpInstructions && (
                <Markdown content={template?.helpInstructions ?? ""} />
              )}
            </div>
          )}
        {rightPanelStatus.tab === "Template" &&
          template &&
          screen === "actions" && (
            <div className="mb-72 flex flex-col gap-4 px-6">
              <div className="flex items-end justify-between pt-2">
                <Page.Header
                  icon={LightbulbIcon}
                  title="Template's Actions manual"
                />
                <TemplateDropDownMenu
                  screen={screen}
                  resetTemplate={resetTemplate}
                  resetToTemplateInstructions={resetToTemplateInstructions}
                  resetToTemplateActions={resetToTemplateActions}
                  openRightPanelTab={openRightPanelTab}
                />
              </div>
              <Page.Separator />
              <div className="flex flex-col gap-4">
                {template && template.helpActions && (
                  <>
                    <div>
                      <Markdown
                        content={template?.helpActions ?? ""}
                        className=""
                        size="sm"
                      />
                    </div>
                    <Separator />
                  </>
                )}
                {template &&
                  multiActionsMode &&
                  template.presetActions.length > 0 && (
                    <div className="flex flex-col gap-6">
                      <Page.SectionHeader title="Add those actions" />
                      {template.presetActions.map((action, index) => (
                        <div className="flex flex-col gap-2" key={index}>
                          {action.description}:
                          <TemplateActionCard
                            action={action}
                            addAction={() =>
                              alert(
                                "Add action for multi-actions not implemented yet"
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

const TemplateActionCard = ({
  action,
  addAction,
}: {
  action: TemplateActionType;
  addAction: () => void;
}) => {
  const spec = ACTION_SPECIFICATIONS[action.type];
  if (!spec) {
    // Unreachable
    return null;
  }
  return (
    <CardButton
      variant="primary"
      onClick={addAction}
      className="inline-block w-72"
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full gap-1 font-medium text-element-900">
          <Icon visual={spec.cardIcon} size="sm" className="text-element-900" />
          <div className="w-full truncate">
            Add action &quot;{spec.label}&quot;
          </div>
          <IconButton
            icon={PlusCircleStrokeIcon}
            variant="tertiary"
            size="sm"
            onClick={addAction}
          />
        </div>
        <div className="w-full truncate text-base text-element-700">
          {_.capitalize(_.toLower(action.name).replace(/_/g, " "))}
        </div>
      </div>
    </CardButton>
  );
};

const TemplateDropDownMenu = ({
  screen,
  resetTemplate,
  resetToTemplateInstructions,
  resetToTemplateActions,
  openRightPanelTab,
}: {
  screen: BuilderScreen;
  resetTemplate: () => Promise<void>;
  resetToTemplateInstructions: () => Promise<void>;
  resetToTemplateActions: () => Promise<void>;
  openRightPanelTab: (tabName: AssistantBuilderRightPanelTab) => void;
}) => {
  const confirm = useContext(ConfirmContext);

  return (
    <DropdownMenu className="text-element-700">
      <DropdownMenu.Button>
        <Button
          icon={MoreIcon}
          label="Actions"
          labelVisible={false}
          disabledTooltip
          size="sm"
          variant="tertiary"
          hasMagnifying={false}
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items width={320} origin="topRight">
        <DropdownMenu.Item
          label="Close the template"
          onClick={async () => {
            const confirmed = await confirm({
              title: "Are you sure you want to close the template?",
              message:
                "Your assistant will remain as it is but will not display template's help any more.",
              validateVariant: "primaryWarning",
            });
            if (confirmed) {
              openRightPanelTab("Preview");
              await resetTemplate();
            }
          }}
          icon={XMarkIcon}
        />
        {screen === "instructions" && (
          <DropdownMenu.Item
            label="Reset instructions"
            description="Set instructions back to template's default"
            onClick={async () => {
              const confirmed = await confirm({
                title: "Are you sure?",
                message:
                  "You will lose the changes you have made to the assistant's instructions and go back to the template's default settings.",
                validateVariant: "primaryWarning",
              });
              if (confirmed) {
                await resetToTemplateInstructions();
              }
            }}
            icon={MagicIcon}
          />
        )}
        {screen === "actions" && (
          <DropdownMenu.Item
            label="Reset actions"
            description="Set actions back to template's default"
            onClick={async () => {
              const confirmed = await confirm({
                title: "Are you sure?",
                message:
                  "You will lose the changes you have made to the assistant's actions and go back to the template's default settings.",
                validateVariant: "primaryWarning",
              });
              if (confirmed) {
                await resetToTemplateActions();
              }
            }}
            icon={MagicIcon}
          />
        )}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
};
