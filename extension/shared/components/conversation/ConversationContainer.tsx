import type {
  AgentMentionType,
  ContentFragmentType,
  ExtensionWorkspaceType,
} from "@dust-tt/client";
import { Page, useSendNotification } from "@dust-tt/sparkle";
import { ConversationViewer } from "@extension/components/conversation/ConversationViewer";
import { GenerationContextProvider } from "@extension/components/conversation/GenerationContextProvider";
import { ReachedLimitPopup } from "@extension/components/conversation/ReachedLimitPopup";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { AssistantInputBar } from "@extension/components/input_bar/InputBar";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import {
  createPlaceholderUserMessage,
  postConversation,
  postMessage,
  updateConversationWithOptimisticData,
} from "@extension/lib/conversation";
import { useDustAPI } from "@extension/lib/dust_api";
import { getRandomGreetingForName } from "@extension/lib/greetings";
import type { StoredUser } from "@extension/lib/storage";
import {
  getConversationContext,
  getFileContentFragmentId,
  saveFilesContentFragmentIds,
  setConversationsContext,
} from "@extension/lib/storage";
import type {
  UploadedFileWithKind,
  UploadedFileWithSupersededContentFragmentId,
} from "@extension/lib/types";
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

  const [includeContent, setIncludeContent] = useState<boolean | undefined>();

  useEffect(() => {
    if (includeContent === undefined) {
      return;
    }
    void setConversationsContext({
      [conversationId ?? "new"]: {
        includeCurrentPage: includeContent,
      },
    });
  }, [includeContent, conversationId]);

  useEffect(() => {
    const doAsync = async () => {
      const context = await getConversationContext(conversationId ?? "new");
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

  const handlePostMessage = async (
    input: string,
    mentions: AgentMentionType[],
    files: UploadedFileWithKind[]
  ) => {
    if (!conversationId) {
      return null;
    }
    const messageData = { input, mentions };
    try {
      await mutateConversation(
        async (currentConversation) => {
          const contentFragmentFiles: UploadedFileWithSupersededContentFragmentId[] =
            [];

          for (const file of files) {
            // Get the content fragment ID to supersede for a given file.
            // Only for tab contents, we re-use the content fragment ID based on the URL and conversation ID.
            const supersededContentFragmentId: string | undefined =
              (await getFileContentFragmentId(conversationId, file)) ??
              undefined;

            contentFragmentFiles.push({
              fileId: file.fileId,
              title: file.title,
              url: file.url,
              supersededContentFragmentId,
            });
          }

          const result = await postMessage({
            dustAPI,
            conversationId,
            messageData,
            files: contentFragmentFiles,
          });

          if (result.isOk()) {
            const { message, contentFragments } = result.value;

            // Save content fragment IDs for tab contents to the local storage.
            await saveFilesContentFragmentIds({
              conversationId,
              uploadedFiles: files,
              createdContentFragments: contentFragments,
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
        files: UploadedFileWithKind[]
      ) => {
        const conversationRes = await postConversation({
          dustAPI,
          messageData: {
            input,
            mentions,
          },
          contentFragments: files.map((f) => ({
            fileId: f.fileId,
            title: f.title,
            url: f.url,
          })),
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
          const contentFragments: ContentFragmentType[] = [];
          for (const versions of conversationRes.value.content) {
            const latestVersion = versions[versions.length - 1];
            if (latestVersion.type === "content_fragment") {
              contentFragments.push(latestVersion);
            }
          }
          // Save the content fragment IDs for tab contents to the local storage.
          await saveFilesContentFragmentIds({
            conversationId: conversationRes.value.sId,
            uploadedFiles: files,
            createdContentFragments: contentFragments,
          });

          await setConversationsContext({
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
      [owner, sendNotification, includeContent]
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
            className="sticky bottom-0 pb-4 z-20  w-full bg-white dark:bg-slate-950"
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
      <div className="pb-2 w-full">
        <Page.Header title={greeting} />
        <Page.SectionHeader title="Start a conversation" />
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
      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        isTrialing={false} // TODO(Ext): Properly handle this from loading the subscription.
      />
    </GenerationContextProvider>
  );
}
