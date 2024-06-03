import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  LightbulbIcon,
  MagicIcon,
  Markdown,
  MoreIcon,
  Page,
  Spinner,
  Tab,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  AssistantBuilderRightPanelStatus,
  AssistantBuilderRightPanelTab,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useMemo } from "react";

import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import {
  usePreviewAssistant,
  useTryAssistantCore,
} from "@app/components/assistant/TryAssistant";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import { useUser } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

export default function AssistantBuilderRightPanel({
  template,
  resetTemplate,
  resetToTemplateInstructions,
  resetToTemplateActions,
  owner,
  rightPanelStatus,
  openRightPanelTab,
  builderState,
}: {
  template: FetchAssistantTemplateResponse | null;
  resetTemplate: () => Promise<void>;
  resetToTemplateInstructions: () => Promise<void>;
  resetToTemplateActions: () => Promise<void>;
  owner: WorkspaceType;
  rightPanelStatus: AssistantBuilderRightPanelStatus;
  openRightPanelTab: (tabName: AssistantBuilderRightPanelTab) => void;
  builderState: AssistantBuilderState;
}) {
  const confirm = useContext(ConfirmContext);

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
        {rightPanelStatus.tab === "Preview" && user && (
          <div className="flex h-full w-full flex-1 flex-col justify-between overflow-x-hidden">
            {draftAssistant ? (
              <GenerationContextProvider>
                <div
                  className="flex-grow overflow-y-auto"
                  id={CONVERSATION_PARENT_SCROLL_DIV_ID.modal}
                >
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
        {rightPanelStatus.tab === "Template" && (
          <div className="mb-72 flex flex-col gap-4 px-6">
            <div className="flex items-end justify-between pt-2">
              <Page.Header
                icon={LightbulbIcon}
                title="Template's User manual"
              />
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
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
            <Page.Separator />
            {template?.helpInstructions && (
              <div id="instructions-help-container">
                <Page.SectionHeader title='"Instructions" guide' />
                <Markdown content={template?.helpInstructions ?? ""} />
              </div>
            )}
            {template?.helpInstructions && template?.helpActions && (
              <Page.Separator />
            )}
            {template?.helpActions && (
              <div id="actions-help-container">
                <Page.SectionHeader title='"Actions" guide' />
                <Markdown
                  content={template?.helpActions ?? ""}
                  className=""
                  size="sm"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
