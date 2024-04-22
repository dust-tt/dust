import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ContextItem,
  DropdownMenu,
  LightbulbIcon,
  MagicIcon,
  Markdown,
  MoreIcon,
  Page,
  Tab,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useContext, useEffect, useMemo, useState } from "react";

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

export default function AssistantBuilderPreviewDrawer({
  template,
  resetTemplate,
  owner,
  previewDrawerOpenedAt,
  builderState,
}: {
  template: FetchAssistantTemplateResponse | null;
  resetTemplate: () => Promise<void>;
  owner: WorkspaceType;
  previewDrawerOpenedAt: number | null;
  builderState: AssistantBuilderState;
}) {
  const confirm = useContext(ConfirmContext);
  const [previewDrawerCurrentTab, setPreviewDrawerCurrentTab] = useState<
    "Preview" | "Template"
  >(template ? "Template" : "Preview");

  const previewDrawerTabs = useMemo(
    () => [
      {
        label: "Template",
        current: previewDrawerCurrentTab === "Template",
        onClick: () => {
          setPreviewDrawerCurrentTab("Template");
        },
        icon: MagicIcon,
      },
      {
        label: "Preview",
        current: previewDrawerCurrentTab === "Preview",
        onClick: () => {
          setPreviewDrawerCurrentTab("Preview");
        },
        icon: ChatBubbleBottomCenterTextIcon,
      },
    ],
    [previewDrawerCurrentTab]
  );

  const {
    shouldAnimate: shouldAnimatePreviewDrawer,
    draftAssistant,
    isFading,
  } = usePreviewAssistant({ owner, builderState });

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
          <Tab
            tabs={previewDrawerTabs}
            variant="default"
            className="hidden lg:flex"
          />
        </div>
      )}
      <div
        className={classNames(
          template !== null
            ? "grow-1 mb-5 h-full overflow-y-auto rounded-b-xl border-x border-b border-structure-200 bg-structure-50 pt-5"
            : "grow-1 mb-5 mt-5 h-full overflow-y-auto rounded-xl border border-structure-200 bg-structure-50",
          shouldAnimatePreviewDrawer &&
            previewDrawerOpenedAt != null &&
            // Only animate the reload if the drawer has been open for at least 1 second.
            // This is to prevent the animation from triggering right after the drawer is opened.
            Date.now() - previewDrawerOpenedAt > 1000
            ? "animate-reload"
            : ""
        )}
      >
        {previewDrawerCurrentTab === "Preview" && user && draftAssistant && (
          <div className="flex h-full w-full flex-1 flex-col justify-between">
            <GenerationContextProvider>
              <div
                className="flex-grow overflow-y-auto overflow-x-hidden"
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
          </div>
        )}
        {previewDrawerCurrentTab === "Template" && (
          <div className="mb-72 flex flex-col gap-4 px-6">
            <div className="flex justify-between">
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
                <DropdownMenu.Items width={220} origin="topRight">
                  <DropdownMenu.Item
                    label="Close the template"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: "Are you sure you want to close the template?",
                        message:
                          "Once removed, you will no longer have access to the associated user manual.",
                        validateVariant: "primaryWarning",
                      });
                      if (confirmed) {
                        setPreviewDrawerCurrentTab("Preview");
                        await resetTemplate();
                      }
                    }}
                    icon={XMarkIcon}
                  />
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
            <Page.Separator />
            <div id="instructions-help-container">
              <ContextItem.SectionHeader
                title='"Instructions" guide'
                hasBorder={false}
              />
              <Markdown
                content={template?.helpInstructions ?? ""}
                className=""
              />
            </div>
            <Page.Separator />

            <div id="actions-help-container">
              <ContextItem.SectionHeader
                title='"Actions" guide'
                hasBorder={false}
              />
              <Markdown content={template?.helpActions ?? ""} className="" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
