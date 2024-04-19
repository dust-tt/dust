import {
  ChatBubbleBottomCenterTextIcon,
  ContextItem,
  LightbulbIcon,
  Markdown,
  Page,
  Tab,
  TemplateIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useEffect, useMemo, useState } from "react";

import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import {
  usePreviewAssistant,
  useTryAssistantCore,
} from "@app/components/assistant/TryAssistant";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { useUser } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

export default function AssistantBuilderPreviewDrawer({
  template,
  owner,
  previewDrawerOpenedAt,
  builderState,
}: {
  template: FetchAssistantTemplateResponse | null;
  owner: WorkspaceType;
  previewDrawerOpenedAt: number | null;
  builderState: AssistantBuilderState;
}) {
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
        icon: TemplateIcon,
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
          "grow-1 h-full overflow-y-auto bg-structure-50 pt-5",
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
              <div className="shrink-0 pb-2">
                <AssistantInputBar
                  owner={owner}
                  onSubmit={handleSubmit}
                  stickyMentions={stickyMentions}
                  conversationId={conversation?.sId || null}
                  additionalAgentConfiguration={draftAssistant}
                  hideQuickActions
                  disableAutoFocus
                  isFloating={true}
                />
              </div>
            </GenerationContextProvider>
          </div>
        )}
        {previewDrawerCurrentTab === "Template" && (
          <div className="pb-6 pl-6 pt-2">
            <Page.Header icon={LightbulbIcon} title="Template's User manual" />
            <Page.Separator />
            <ContextItem.SectionHeader
              title='"Instructions" guide'
              hasBorder={false}
            />
            <Markdown
              content={template?.helpInstructions ?? ""}
              className="pr-8 pt-4"
            />
            <Page.Separator />
            <ContextItem.SectionHeader
              title='"Actions" guide'
              hasBorder={false}
            />
            <Markdown
              content={template?.helpActions ?? ""}
              className="pr-8 pt-4"
            />
          </div>
        )}
      </div>
    </div>
  );
}
