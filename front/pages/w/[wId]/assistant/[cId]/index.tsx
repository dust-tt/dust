import { Page } from "@dust-tt/sparkle";
import type {
  AgentMessageWithRankType,
  LightAgentConfigurationType,
  UserMessageWithRankType,
  UserType,
} from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { cloneDeep } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import React from "react";

import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { ConversationContainer } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ContentFragmentInput } from "@app/components/assistant/conversation/lib";
import {
  createConversationWithMessage,
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { getRandomGreetingForName } from "@app/lib/client/greetings";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useConversationMessages } from "@app/lib/swr";
import { AssistantBrowserContainer } from "@app/pages/w/[wId]/assistant/AssistantBrowerContainer";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    // Here, override conversationId.
    conversationId: string | null;
    user: UserType;
  }
>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isUser() || !subscription) {
    const { cId } = context.query;

    if (typeof cId === "string") {
      return {
        redirect: {
          destination: `/w/${context.query.wId}/join?cId=${context.query.cId}`,
          permanent: false,
        },
      };
    }

    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  // TODO: We are missing some here.
  const { cId } = context.params;

  return {
    props: {
      user,
      owner,
      subscription,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
      conversationId: typeof cId === "string" && cId !== "new" ? cId : null,
    },
  };
});

export default function AssistantConversation({
  conversationId: initialConversationId,
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const router = useRouter();

  // TODO: This creates two extra re-rendering!!!
  useEffect(() => {
    const { cId } = router.query;
    const conversationId =
      typeof cId === "string" && cId !== "new" ? cId : null;

    console.log("> (V) initialConversationId:", initialConversationId);
    console.log("> (V) conversationId:", conversationId);

    if (conversationId && initialConversationId) {
      setConversationKey(conversationId);
    } else if (!conversationId && !initialConversationId) {
      setConversationKey("new");
    }
    // if (conversationId !== initialConversationId) {
    //   setCurrentConversationId(conversationId);

    //   if (cId === "new") {
    //     // Reset sticky mentions when switching back to new screen.
    //     setStickyMentions([]);
    //   }
    // }
  }, [router.query, setConversationKey, initialConversationId]);

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

  return (
    <>
      {/* // TODO: Do not display when loading existing conversation. */}
      <ConversationContainer
        key={conversationKey}
        conversationId={initialConversationId}
        owner={owner}
        subscription={subscription}
        user={user}
      />
    </>
  );
}

AssistantConversation.getLayout = (page: ReactElement, pageProps: any) => {
  return <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>;
};
