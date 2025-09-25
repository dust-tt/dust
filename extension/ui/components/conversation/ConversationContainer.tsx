import { usePlatform } from "@app/shared/context/PlatformContext";
import { useMcpServer } from "@app/shared/hooks/useMcpServer";
import {
  createPlaceholderUserMessage,
  postConversation,
  postMessage,
  updateConversationWithOptimisticData,
} from "@app/shared/lib/conversation";
import { useDustAPI } from "@app/shared/lib/dust_api";
import { getRandomGreetingForName } from "@app/shared/lib/greetings";
import type { ContentFragmentsType } from "@app/shared/lib/types";
import type { StoredUser } from "@app/shared/services/auth";
import { AssistantFavorites } from "@app/ui/components/assistants/AssistantFavorites";
import { ConversationViewer } from "@app/ui/components/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/ui/components/conversation/GenerationContextProvider";
import { ReachedLimitPopup } from "@app/ui/components/conversation/ReachedLimitPopup";
import { usePublicConversation } from "@app/ui/components/conversation/usePublicConversation";
import { AssistantInputBar } from "@app/ui/components/input_bar/InputBar";
import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import { useSubmitFunction } from "@app/ui/components/utils/useSubmitFunction";
import type {
  AgentMentionType,
  ContentFragmentType,
  ExtensionWorkspaceType,
} from "@dust-tt/client";
import { cn, Page, useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ConversationContainerProps {
  conversationId: string | null;
  owner: ExtensionWorkspaceType;
  user: StoredUser;
}

export function ConversationContainer({
  conversationId,
  owner,
  user,
}: ConversationContainerProps) {
  const navigate = useNavigate();
  const platform = usePlatform();

  const [includeContent, setIncludeContent] = useState<boolean | undefined>();

  useEffect(() => {
    if (includeContent === undefined) {
      return;
    }
    void platform.setConversationsContext({
      [conversationId ?? "new"]: {
        includeCurrentPage: includeContent,
      },
    });
  }, [includeContent, conversationId]);

  useEffect(() => {
    const doAsync = async () => {
      const context = await platform.getConversationContext(
        conversationId ?? "new"
      );
      setIncludeContent(context.includeCurrentPage);
    };
    void doAsync();
  }, [conversationId]);

  const [planLimitReached, setPlanLimitReached] = useState(false);
  const [stickyMentions, setStickyMentions] = useState<AgentMentionType[]>([]);
  const dustAPI = useDustAPI();

  const { animate, setAnimate } = useContext(InputBarContext);
  const sendNotification = useSendNotification();

  const { conversation, mutateConversation } = usePublicConversation({
    conversationId,
  });

  useEffect(() => {
    if (animate) {
      setTimeout(() => setAnimate(false), 500);
    }
  });

  const { serverId } = useMcpServer();

  const handlePostMessage = async (
    input: string,
    mentions: AgentMentionType[],
    contentFragments: ContentFragmentsType
  ) => {
    if (!conversationId) {
      return null;
    }
    const messageData = {
      input,
      mentions,
      contentFragments,
      mcpServerIds: serverId ? [serverId] : [],
    };
    try {
      await mutateConversation(
        async (currentConversation) => {
          const result = await postMessage(platform, {
            dustAPI,
            conversationId,
            messageData,
          });

          if (result.isOk()) {
            const { message, contentFragments: createdContentFragments } =
              result.value;

            // Save content fragment IDs for tab contents to the local storage.
            await platform.saveFilesContentFragmentIds({
              conversationId,
              uploadedFiles: contentFragments.uploaded,
              createdContentFragments,
            });

            return updateConversationWithOptimisticData(
              currentConversation,
              message
            );
          }

          if (result.error.type === "plan_limit_reached_error") {
            setPlanLimitReached(true);
          } else {
            sendNotification({
              title: result.error.title,
              description: result.error.message,
              type: "error",
            });
          }

          throw result.error;
        },
        {
          optimisticData: (currentConversation) => {
            const placeholderMessage = createPlaceholderUserMessage({
              input,
              mentions,
              user,
            });
            return updateConversationWithOptimisticData(
              currentConversation,
              placeholderMessage
            );
          },
          revalidate: false,
          // Rollback optimistic update on errors.
          rollbackOnError: true,
          populateCache: true,
        }
      );
    } catch (err) {
      // If the API errors, the original data will be
      // rolled back by SWR automatically.
      console.error("Failed to post message:", err);
    }
  };

  const { submit: handlePostConversation, isSubmitting } = useSubmitFunction(
    useCallback(
      async (
        input: string,
        mentions: AgentMentionType[],
        contentFragments: ContentFragmentsType
      ) => {
        const conversationRes = await postConversation(platform, {
          dustAPI,
          messageData: {
            input,
            mentions,
            contentFragments,
            mcpServerIds: serverId ? [serverId] : [],
          },
        });
        if (conversationRes.isErr()) {
          if (conversationRes.error.type === "plan_limit_reached_error") {
            setPlanLimitReached(true);
          } else {
            sendNotification({
              title: conversationRes.error.title,
              description: conversationRes.error.message,
              type: "error",
            });
          }
        } else {
          // Get all content fragments from the conversation.
          const createdContentFragments: ContentFragmentType[] = [];
          for (const versions of conversationRes.value.content) {
            const latestVersion = versions[versions.length - 1];
            if (latestVersion.type === "content_fragment") {
              createdContentFragments.push(latestVersion);
            }
          }
          // Save the content fragment IDs for tab contents to the local storage.
          await platform.saveFilesContentFragmentIds({
            conversationId: conversationRes.value.sId,
            uploadedFiles: contentFragments.uploaded,
            createdContentFragments,
          });

          await platform.setConversationsContext({
            [conversationRes.value.sId]: {
              includeCurrentPage: !!includeContent,
            },
            new: { includeCurrentPage: false },
          });

          navigate(`/conversations/${conversationRes.value.sId}`, {
            replace: true,
          });
        }
      },
      [owner, sendNotification, includeContent, serverId]
    )
  );

  const onStickyMentionsChange = useCallback(
    (mentions: AgentMentionType[]) => {
      setStickyMentions(mentions);
    },
    [setStickyMentions]
  );

  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomGreetingForName(user.firstName));
  }, [user]);

  if (conversationId) {
    return (
      <GenerationContextProvider>
        <div className="h-full flex flex-col">
          <div className="flex-1">
            <ConversationViewer
              conversationId={conversationId}
              owner={owner}
              user={user}
              onStickyMentionsChange={onStickyMentionsChange}
            />
          </div>
          <div
            id="assistant-input-header"
            className={cn(
              "sticky bottom-0 pb-4 z-20  w-full",
              "bg-background text-foreground",
              "dark:bg-background-night dark:text-foreground-night"
            )}
          >
            <AssistantInputBar
              owner={owner}
              onSubmit={handlePostMessage}
              stickyMentions={stickyMentions}
              isTabIncluded={!!includeContent}
              setIncludeTab={(includeTab) => {
                setIncludeContent(includeTab);
              }}
              conversation={conversation ?? undefined}
            />
          </div>

          <ReachedLimitPopup
            isOpened={planLimitReached}
            onClose={() => setPlanLimitReached(false)}
            isTrialing={false}
          />
        </div>
      </GenerationContextProvider>
    );
  }

  return (
    <GenerationContextProvider>
      <div className="h-full flex flex-col">
        <div className="pb-4 w-full">
          <Page.Header title={greeting} />
        </div>
        <div id="assistant-input-header" className="w-full pb-4">
          <AssistantInputBar
            owner={owner}
            onSubmit={handlePostConversation}
            stickyMentions={stickyMentions}
            isTabIncluded={!!includeContent}
            setIncludeTab={(includeTab) => {
              setIncludeContent(includeTab);
            }}
            isSubmitting={isSubmitting}
            conversation={conversation ?? undefined}
          />
        </div>
        <AssistantFavorites user={user} />
        <ReachedLimitPopup
          isOpened={planLimitReached}
          onClose={() => setPlanLimitReached(false)}
          isTrialing={false} // TODO(Ext): Properly handle this from loading the subscription.
        />
      </div>
    </GenerationContextProvider>
  );
}
