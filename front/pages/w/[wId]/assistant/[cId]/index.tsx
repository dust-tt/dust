import type { UserMessageType, UserType } from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import { cloneDeep } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useContext, useEffect, useState } from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { submitMessage } from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useConversationMessages } from "@app/lib/swr";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    // Here, override conversationId.
    conversationId: string;
    user: UserType;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isUser() || !subscription) {
    return {
      redirect: {
        destination: `/w/${context.query.wId}/join?cId=${context.query.cId}`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      user,
      owner,
      subscription,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
      conversationId: context.params?.cId as string,
    },
  };
});

export default function AssistantConversation({
  conversationId,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([]);
  const [planLimitReached, setPlanLimitReached] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const { messages, mutateMessages } = useConversationMessages({
    conversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  useEffect(() => {
    function handleNewConvoShortcut(event: KeyboardEvent) {
      // Check for Command on Mac or Ctrl on others
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.key === "/") {
        void router.push(`/w/${owner.sId}/assistant/new`);
      }
    }

    window.addEventListener("keydown", handleNewConvoShortcut);
    return () => {
      window.removeEventListener("keydown", handleNewConvoShortcut);
    };
  }, [owner.sId, router]);

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragment?: {
      title: string;
      content: string;
      file: File;
    }
  ) => {
    const messageData = { input, mentions, contentFragment };

    // const lastMessageRank = messages.at(-1)?.messages.at(-1)?.rank;
    const placeholderMessage: UserMessageType = {
      id: -1,
      content: input,
      created: new Date().getTime(),
      mentions,
      user: { ...user },
      visibility: "visible",
      type: "user_message",
      sId: "placeholder",
      version: 0,
      // rank: (lastMessageRank ?? 0) + 1,
      context: {
        email: "flavien@dust.tt",
        fullName: "Flavien David",
        profilePictureUrl: null,
        timezone: "Europe/Paris",
        username: "flavien",
      },
    };

    await mutateMessages(
      async (m) => {
        console.log(">> post message", m);
        // return Promise.resolve([{ messages: [placeholderMessage] }]);

        const result = await submitMessage({
          owner,
          user,
          conversationId,
          messageData,
        });

        console.log(">> message saved!");

        if (result.isOk()) {
          const { value } = result;

          if (!m) {
            return [[value]];
          }

          const { message } = result.value;

          console.log(">> messages:", result.value);

          // Find index of message with the same id
          // const index = m[m.length - 1].messages.findIndex((msg) => {
          //   console.log(">> msg:", msg);
          //   return msg.rank === message.rank;
          // });

          // console.log(">> index:", index);

          // const lastMessage = copyOfData[copyOfData.length - 1].messages.at(-1);

          const copyOfData = cloneDeep(m);

          // if (index !== -1) {
          //   // Replace message with the same id

          //   copyOfData[copyOfData.length - 1].messages[
          //     copyOfData[copyOfData.length - 1].messages.length - 1
          //   ] = message;
          // } else {
          // Push new message to messages array of the last array item
          copyOfData[copyOfData.length - 1].messages.push(message);
          // }

          // const [firstPage, ...rest] = m;
          // const currentMessageIdx = firstPage.messages.findIndex(
          //   (m) => m.rank === message.rank
          // );
          // if (currentMessageIdx > -1) {
          //   console.log(">> message already exist", currentMessageIdx);
          //   firstPage.messages[currentMessageIdx] = message;
          // } else {
          //   firstPage.messages.push(result.value.message);
          // }

          // return [firstPage, ...rest];
          return copyOfData;
        }

        if (result.error.type === "plan_limit_reached_error") {
          setPlanLimitReached(true);
        } else {
          sendNotification({
            title: result.error.title,
            description: result.error.message,
            type: "error",
          });

          // TODO: We should throw an error!
        }

        // // TODO;
        return [undefined];
      },
      {
        // optimisticData: (m) => {
        //   if (!m) {
        //     return [[{ messages: [placeholderMessage] }]];
        //   }

        //   // const [firstPage, ...rest] = m;
        //   // const lastMessageRank = firstPage.messages.at(-1)?.rank;
        //   // firstPage.messages.push({
        //   //   ...placeholderMessage,
        //   //   rank: (lastMessageRank ?? 0) + 1,
        //   // });

        //   // console.log(">> returning:", [firstPage, ...rest]);

        //   const copyOfData = JSON.parse(JSON.stringify(m));

        //   // return [firstPage, ...rest];
        //   copyOfData[copyOfData.length - 1].messages.push(placeholderMessage);

        //   return copyOfData;
        // },
        revalidate: false,
        rollbackOnError: true,
        populateCache: true,
      }
    );

    // const placeholderMessage: UserMessageType = {
    //   id: -1,
    //   content: input,
    //   created: new Date().getTime(),
    //   mentions,
    //   user: { ...user },
    //   visibility: "visible",
    //   type: "user_message",
    //   sId: "placeholder",
    //   version: 0,
    //   context: {
    //     email: "flavien@dust.tt",
    //     fullName: "Flavien David",
    //     profilePictureUrl: null,
    //     timezone: "Europe/Paris",
    //     username: "flavien",
    //   },
    // };
    // if (!messages) {
    //   return [[{ messages: [placeholderMessage] }]];
    // }

    // const addPlaceholdeMessage = () => {
    //   console.log(">> optimistic data!");
    //   const placeholderMessage: UserMessageType = {
    //     id: -1,
    //     content: input,
    //     created: new Date().getTime(),
    //     mentions,
    //     user: { ...user },
    //     visibility: "visible",
    //     type: "user_message",
    //     sId: "placeholder",
    //     version: 0,
    //     context: {
    //       email: "flavien@dust.tt",
    //       fullName: "Flavien David",
    //       profilePictureUrl: null,
    //       timezone: "Europe/Paris",
    //       username: "flavien",
    //     },
    //   };
    //   if (!messages) {
    //     return [[{ messages: [placeholderMessage] }]];
    //   }

    //   const [firstPage, ...rest] = messages;
    //   const lastMessageRank = firstPage.messages.at(-1)?.rank;
    //   firstPage.messages.push({
    //     ...placeholderMessage,
    //     rank: (lastMessageRank ?? 0) + 1,
    //   });

    //   console.log(">> returning:", [firstPage, ...rest]);

    //   return [firstPage, ...rest];
    // };

    // await mutateMessages(addPlaceholdeMessage(), { revalidate: false });

    // const result = await submitMessage({
    //   owner,
    //   user,
    //   conversationId,
    //   messageData,
    // });
    // if (result.isOk()) {
    //   const [firstPage] = messages;
    //   firstPage.messages.push({ ...result.value.message, rank: 220 });

    //   try {
    //     // Update the local state immediately and fire the
    //     // request. Since the API will return the updated
    //     // data, there is no need to start a new revalidation
    //     // and we can directly populate the cache.
    //     // await mutateMessages([firstPage, ...otherPages], {
    //     await mutateMessages(() => Promise.resolve(messages), {
    //       revalidate: false,
    //     });
    //     // await mutateMessages();
    //     // toast.success("Successfully added the new item.");
    //   } catch (e) {
    //     // If the API errors, the original data will be
    //     // rolled back by SWR automatically.
    //     // toast.error("Failed to add the new item.");
    //   }
    //   return;
    // }
    // if (result.error.type === "plan_limit_reached_error") {
    //   setPlanLimitReached(true);
    // } else {
    //   sendNotification({
    //     title: result.error.title,
    //     description: result.error.message,
    //     type: "error",
    //   });
    // }
  };

  return (
    <>
      <ConversationViewer
        owner={owner}
        user={user}
        conversationId={conversationId}
        onStickyMentionsChange={setStickyMentions}
        key={conversationId}
      />
      <FixedAssistantInputBar
        owner={owner}
        onSubmit={handleSubmit}
        stickyMentions={stickyMentions}
        conversationId={conversationId}
      />
      <ReachedLimitPopup
        isOpened={planLimitReached}
        onClose={() => setPlanLimitReached(false)}
        subscription={subscription}
        owner={owner}
        code="message_limit"
      />
    </>
  );
}

AssistantConversation.getLayout = (page: ReactElement, pageProps: any) => {
  return <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>;
};
