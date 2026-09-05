import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import {
  ConversationSidePanelProvider,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type { VirtuosoMessageListContext } from "@app/components/assistant/conversation/types";
import { useAnalyticsConversation } from "@app/hooks/useAnalyticsConversation";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { timeAgoFrom } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationListItemType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  ArrowLeft,
  Button,
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
  ConversationPicker,
  Robot,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

interface AnalyticsConversationPanelHeaderProps {
  onClose: () => void;
  onBack?: () => void;
}

function AnalyticsConversationPanelHeader({
  onClose,
  onBack,
}: AnalyticsConversationPanelHeaderProps) {
  return (
    <div className="flex h-14 w-full items-center justify-between px-2">
      {onBack && (
        <Button
          icon={ArrowLeft}
          size="sm"
          variant="ghost-secondary"
          tooltip="Back to conversations"
          onClick={onBack}
        />
      )}
      <Tabs value="analyst">
        <TabsList>
          <TabsTrigger value="analyst" label="Analyst" icon={Robot} />
        </TabsList>
      </Tabs>
      <Button
        icon={XClose}
        size="sm"
        variant="ghost-secondary"
        tooltip="Close panel"
        onClick={onClose}
      />
    </div>
  );
}

interface AnalyticsConversationGreetingProps {
  agentConfiguration: LightAgentConfigurationType;
}

function AnalyticsConversationGreeting({
  agentConfiguration,
}: AnalyticsConversationGreetingProps) {
  return (
    <ConversationMessageContainer messageType="agent" type="agent">
      <ConversationMessageAvatar
        type="agent"
        name={agentConfiguration.name}
        avatarUrl={agentConfiguration.pictureUrl}
      />
      <div className="flex flex-col gap-2">
        <ConversationMessageTitle
          name={agentConfiguration.name}
          renderName={(name) => name}
        />
        <ConversationMessageContent type="agent">
          I can help you understand your workspace usage and costs across your
          analytics data.
        </ConversationMessageContent>
      </div>
    </ConversationMessageContainer>
  );
}

interface AnalyticsConversationPanelBodyProps {
  owner: WorkspaceType;
  user: UserType;
  conversation: ConversationWithoutContentType | null;
  isConversationLoading: boolean;
  pastConversations: ConversationListItemType[];
  createConversation: ReturnType<
    typeof useAnalyticsConversation
  >["createConversation"];
  pickConversation: (conversationId: string) => void;
  resetConversation: () => void;
  disabled: boolean;
}

function AnalyticsConversationPanelBody({
  owner,
  user,
  conversation,
  isConversationLoading,
  pastConversations,
  createConversation,
  pickConversation,
  resetConversation,
  disabled,
}: AnalyticsConversationPanelBodyProps) {
  const { agentConfiguration: analystAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: GLOBAL_AGENTS_SID.ANALYST,
      disabled,
    });

  const { currentPanel, onPanelClosed } = useConversationSidePanelContext();

  // The side panel type lives in the URL hash and outlives the in-memory
  // conversation across a reload.
  useEffect(() => {
    if (!conversation && currentPanel) {
      onPanelClosed();
    }
  }, [conversation, currentPanel, onPanelClosed]);

  const stickyMentions = useMemo<RichMention[]>(
    () =>
      analystAgentConfiguration
        ? [toRichAgentMentionType(analystAgentConfiguration)]
        : [],
    [analystAgentConfiguration]
  );

  // Stub reuse of ConversationViewer's agentBuilderContext slot, whose only
  // fields we need are disableAgentMentions/actionsToShow.
  const analystAgentContext = useMemo<
    VirtuosoMessageListContext["agentBuilderContext"]
  >(
    () => ({
      isSubmitting: false,
      resetConversation,
      actionsToShow: [],
      disableAgentMentions: true,
      disableReactions: true,
    }),
    [resetConversation]
  );

  if (!analystAgentConfiguration) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <>
      <div
        className={
          currentPanel && conversation
            ? "hidden"
            : "flex h-full w-full min-h-0 flex-col"
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversation ? (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              agentBuilderContext={analystAgentContext}
              key={conversation.sId}
            />
          ) : isConversationLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-conversation px-5 pt-6 md:pt-10">
              <AnalyticsConversationGreeting
                agentConfiguration={analystAgentConfiguration}
              />
              <ConversationPicker
                className="mt-4"
                items={pastConversations.map((pastConversation) => ({
                  id: pastConversation.sId,
                  title: getConversationDisplayTitle(pastConversation),
                  timeLabel: timeAgoFrom(pastConversation.updated),
                }))}
                onPick={pickConversation}
              />
            </div>
          )}
        </div>

        {!conversation && !isConversationLoading && (
          <div className="relative z-20 mx-auto flex w-full flex-shrink-0 flex-col px-5 pt-4 pb-6 md:max-w-[calc(var(--container-conversation)+0.5rem)] md:px-1">
            <InputBar
              owner={owner}
              user={user}
              onSubmit={createConversation}
              stickyMentions={stickyMentions}
              draftKey="analytics-conversation-panel"
              placeholder="Ask about your workspace usage and costs"
              actions={[]}
              disableAgentMentions
              disableUserMentions
              disableAutoFocus
              isFloating={false}
            />
          </div>
        )}
      </div>

      {conversation && (
        <ConversationSidePanelContent
          conversation={conversation}
          owner={owner}
          currentPanel={currentPanel}
        />
      )}
    </>
  );
}

export interface AnalyticsConversationPanelProps {
  owner: WorkspaceType;
  user: UserType;
  onClose: () => void;
  /** Skips fetching the agent configuration while the panel is closed. */
  disabled?: boolean;
}

/**
 * The Analytics-page conversation panel: a normal, persisted, billed
 * conversation restricted to `@analyst`, rendered as a side panel.
 */
export function AnalyticsConversationPanel({
  owner,
  user,
  onClose,
  disabled = false,
}: AnalyticsConversationPanelProps) {
  const {
    conversation,
    isConversationLoading,
    pastConversations,
    createConversation,
    pickConversation,
    resetConversation,
  } = useAnalyticsConversation({ owner, user, disabled });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-panel-background/80 backdrop-blur-sm">
        <AnalyticsConversationPanelHeader
          onClose={onClose}
          onBack={conversation ? resetConversation : undefined}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FilePreviewProvider owner={owner}>
          <ConversationSidePanelProvider>
            <BlockedActionsProvider
              owner={owner}
              conversation={conversation ?? undefined}
            >
              <GenerationContextProvider>
                <AnalyticsConversationPanelBody
                  owner={owner}
                  user={user}
                  conversation={conversation}
                  isConversationLoading={isConversationLoading}
                  pastConversations={pastConversations}
                  createConversation={createConversation}
                  pickConversation={pickConversation}
                  resetConversation={resetConversation}
                  disabled={disabled}
                />
              </GenerationContextProvider>
            </BlockedActionsProvider>
          </ConversationSidePanelProvider>
        </FilePreviewProvider>
      </div>
    </div>
  );
}
