import { AgentMessageView } from "@app/components/poke/conversation/agent_message_view";
import { PokeConversationConsumptionInspector } from "@app/components/poke/conversation/consumption_inspectors";
import { ConversationActions } from "@app/components/poke/conversation/conversation_actions";
import { ConversationMessagesHeader } from "@app/components/poke/conversation/conversation_messages_header";
import {
  CompactionMessageView,
  ContentFragmentView,
  UserMessageView,
} from "@app/components/poke/conversation/message_views";
import { useConversationInspectorPanels } from "@app/components/poke/conversation/use_conversation_inspector_panels";
import { PokeConversationWakeUpsInspector } from "@app/components/poke/conversation/wakeups_inspector";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeConversation } from "@app/poke/swr";
import { usePokeConversationConfig } from "@app/poke/swr/conversation_config";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeSpaceDetails } from "@app/poke/swr/space_details";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  cn,
  LinkWrapper,
  NavTabPill,
  NavTabPillContent,
  Spinner,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";

export function ConversationPage() {
  const owner = useWorkspace();

  const conversationId = useRequiredPathParam("cId");
  const {
    data: conversationConfig,
    isLoading: isConfigLoading,
    isError: isConfigError,
  } = usePokeConversationConfig({
    owner,
    conversationId,
    disabled: false,
  });

  const { conversation } = usePokeConversation({
    workspaceId: owner.sId,
    conversationId,
  });

  usePokePageMetadata({
    name: conversation?.title,
    subtitle: owner.name,
    sId: conversationId,
  });

  const { data: spaceDetails } = usePokeSpaceDetails({
    owner,
    spaceId: conversation?.spaceId ?? "",
    disabled: !conversation?.spaceId,
  });
  const pod =
    spaceDetails?.space.kind === "project" ? spaceDetails.space : null;

  const [useMarkdown, setUseMarkdown] = useState(true);
  const activeMessagePanelRef = useRef<HTMLDivElement | null>(null);
  const stickyInspectorsRef = useRef<HTMLElement | null>(null);
  const {
    activeMessageId,
    completeMessagePanelExit,
    isConversationOpen,
    isMessageRailTakeover,
    isWakeUpsOpen,
    setConversationOpen,
    setMessageOpen,
    setWakeUpsOpen,
  } = useConversationInspectorPanels({
    activeMessagePanelRef,
    stickyInspectorsRef,
  });
  function handleMessagePanelRefChange(
    messageId: string,
    element: HTMLDivElement | null
  ) {
    if (element && messageId === activeMessageId) {
      activeMessagePanelRef.current = element;
      return;
    }

    if (
      !element &&
      activeMessagePanelRef.current?.dataset.messageConsumptionPanelId ===
        messageId
    ) {
      activeMessagePanelRef.current = null;
    }
  }

  if (isConfigLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isConfigError || !conversationConfig) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading conversation config.</p>
      </div>
    );
  }

  const { langfuseUiBaseUrl } = conversationConfig;

  const allMessages = conversation?.content.flat() ?? [];
  const pendingUserCount = allMessages.filter(
    (m) => m.type === "user_message" && m.visibility === "pending"
  ).length;
  const createdAgentCount = allMessages.filter(
    (m) => m.type === "agent_message" && m.status === "created"
  ).length;

  return (
    conversation && (
      <div
        className={cn(
          "mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 xl:max-w-492",
          "2xl:grid-cols-[minmax(16rem,1fr)_minmax(0,93.5rem)]"
        )}
      >
        <h3 className="text-xl font-bold 2xl:col-start-2">
          Conversation in workspace{" "}
          <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight">
            {owner.name}
          </LinkWrapper>
          {pod && (
            <>
              {" "}
              in pod{" "}
              <LinkWrapper
                href={`/poke/${owner.sId}/spaces/${pod.sId}`}
                className="text-highlight"
              >
                {pod.name}
              </LinkWrapper>
            </>
          )}
        </h3>
        <aside className="w-full min-w-0 max-w-5xl 2xl:col-start-1 2xl:row-start-2 2xl:self-start">
          <PluginList
            pluginResourceTarget={{
              resourceId: conversation.sId,
              resourceType: "conversations",
              workspace: owner,
            }}
          />
        </aside>
        <div className="flex min-w-0 flex-col gap-3 2xl:col-start-2 2xl:row-start-2">
          <ConversationActions
            owner={owner}
            conversationId={conversationId}
            conversation={conversation}
            conversationConfig={conversationConfig}
          />
          <div
            className={cn(
              "grid w-full grid-cols-1 gap-6 py-4",
              "[--poke-inspector-width:28rem]",
              "xl:grid-cols-[minmax(0,1fr)_var(--poke-inspector-width)]"
            )}
          >
            <aside
              ref={stickyInspectorsRef}
              className="z-20 xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1 xl:self-start"
            >
              <div
                aria-hidden={isMessageRailTakeover}
                className={cn(
                  "flex flex-col gap-4",
                  "transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none",
                  isMessageRailTakeover
                    ? "invisible opacity-0"
                    : "visible opacity-100"
                )}
              >
                <PokeConversationConsumptionInspector
                  conversationId={conversationId}
                  isOpen={isConversationOpen}
                  onOpenChange={setConversationOpen}
                  workspaceId={owner.sId}
                />
                <PokeConversationWakeUpsInspector
                  conversationId={conversationId}
                  isOpen={isWakeUpsOpen}
                  onOpenChange={setWakeUpsOpen}
                  owner={owner}
                />
              </div>
            </aside>
            <NavTabPill
              value={useMarkdown ? "markdown" : "raw"}
              onValueChange={(value) => setUseMarkdown(value === "markdown")}
              asChild
            >
              <div className="flex min-w-0 flex-col justify-start gap-8 xl:col-start-1 xl:row-start-1">
                <ConversationMessagesHeader
                  pendingUserCount={pendingUserCount}
                  createdAgentCount={createdAgentCount}
                />
                <NavTabPillContent value={useMarkdown ? "markdown" : "raw"}>
                  {conversation.content.map((messages, i) => {
                    return (
                      <div
                        key={`messages-${i}`}
                        className="flex flex-col gap-4"
                      >
                        {messages.map((m, j) => {
                          switch (m.type) {
                            case "agent_message": {
                              return (
                                <AgentMessageView
                                  key={`message-${i}-${j}`}
                                  conversationId={conversationId}
                                  isConsumptionOpen={activeMessageId === m.sId}
                                  message={m}
                                  onConsumptionOpenChange={(open) =>
                                    setMessageOpen(m.sId, open)
                                  }
                                  onConsumptionPanelExitComplete={() =>
                                    completeMessagePanelExit(m.sId)
                                  }
                                  onConsumptionPanelRefChange={(element) =>
                                    handleMessagePanelRefChange(m.sId, element)
                                  }
                                  useMarkdown={useMarkdown}
                                  owner={owner}
                                  langfuseUiBaseUrl={langfuseUiBaseUrl}
                                />
                              );
                            }
                            case "user_message": {
                              return (
                                <UserMessageView
                                  message={m}
                                  key={`message-${i}-${j}`}
                                  useMarkdown={useMarkdown}
                                />
                              );
                            }
                            case "content_fragment": {
                              return (
                                <ContentFragmentView
                                  message={m}
                                  key={`message-${i}-${j}`}
                                />
                              );
                            }
                            case "compaction_message": {
                              return (
                                <CompactionMessageView
                                  message={m}
                                  key={`message-${i}-${j}`}
                                />
                              );
                            }
                            default:
                              assertNeverAndIgnore(m);
                          }
                        })}
                      </div>
                    );
                  })}
                </NavTabPillContent>
              </div>
            </NavTabPill>
          </div>
        </div>
      </div>
    )
  );
}
