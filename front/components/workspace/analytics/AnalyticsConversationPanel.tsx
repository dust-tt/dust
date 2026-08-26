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
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Button,
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
  ConversationPanel,
  Spinner,
  XClose,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

interface AnalyticsConversationPanelHeaderProps {
  onClose: () => void;
}

function AnalyticsConversationPanelHeader({
  onClose,
}: AnalyticsConversationPanelHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between px-4 py-3">
      <span className="text-sm font-semibold text-foreground">
        Ask @analyst
      </span>
      <Button variant="ghost" size="sm" icon={XClose} onClick={onClose} />
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
          Ask me about workspace usage — top agents, credit spend, or trends
          over time.
        </ConversationMessageContent>
      </div>
    </ConversationMessageContainer>
  );
}

interface AnalyticsConversationPanelBodyProps {
  owner: WorkspaceType;
  user: UserType;
  conversation: ConversationType | null;
  createConversation: ReturnType<
    typeof useAnalyticsConversation
  >["createConversation"];
  resetConversation: () => void;
  disabled: boolean;
}

function AnalyticsConversationPanelBody({
  owner,
  user,
  conversation,
  createConversation,
  resetConversation,
  disabled,
}: AnalyticsConversationPanelBodyProps) {
  const { agentConfiguration: analystAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: GLOBAL_AGENTS_SID.ANALYST,
      disabled,
    });

  const { currentPanel } = useConversationSidePanelContext();

  const stickyMentions = useMemo<RichMention[]>(
    () =>
      analystAgentConfiguration
        ? [toRichAgentMentionType(analystAgentConfiguration)]
        : [],
    [analystAgentConfiguration]
  );

  const agentBuilderContext = useMemo<
    VirtuosoMessageListContext["agentBuilderContext"]
  >(
    () => ({
      isSubmitting: false,
      resetConversation,
      actionsToShow: ["attachment"],
      disableAgentMentions: true,
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
          currentPanel ? "hidden" : "flex h-full w-full min-h-0 flex-col"
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversation ? (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              agentBuilderContext={agentBuilderContext}
              key={conversation.sId}
            />
          ) : (
            <div className="px-4 py-4">
              <AnalyticsConversationGreeting
                agentConfiguration={analystAgentConfiguration}
              />
            </div>
          )}
        </div>

        {!conversation && (
          <div className="w-full flex-shrink-0 p-2">
            <InputBar
              owner={owner}
              user={user}
              onSubmit={createConversation}
              stickyMentions={stickyMentions}
              draftKey="analytics-conversation-panel"
              actions={["attachment"]}
              disableAgentMentions
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
  /** Whether the panel is collapsed — skips fetching the agent configuration until open. */
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
  const { conversation, createConversation, resetConversation } =
    useAnalyticsConversation({ owner, user });

  return (
    <ConversationPanel
      header={<AnalyticsConversationPanelHeader onClose={onClose} />}
    >
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
                createConversation={createConversation}
                resetConversation={resetConversation}
                disabled={disabled}
              />
            </GenerationContextProvider>
          </BlockedActionsProvider>
        </ConversationSidePanelProvider>
      </FilePreviewProvider>
    </ConversationPanel>
  );
}
