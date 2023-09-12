import { ChatBubbleBottomCenterTextIcon, PageHeader } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import Conversation from "@app/components/assistant/conversation/Conversation";
import AssistantInputBar from "@app/components/assistant/InputBar";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
  conversationId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      conversationId: context.params?.cId as string,
    },
  };
};

export default function AssistantConversation({
  user,
  owner,
  gaTrackingId,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="lab"
      subNavigation={subNavigationLab({ owner, current: "assistant" })}
    >
      <PageHeader
        title="Welcome to Assistant"
        icon={ChatBubbleBottomCenterTextIcon}
      />
      <div className="fixed bottom-0 left-0 right-0 z-20 flex-initial lg:left-80">
        <div className="mx-auto max-w-4xl pb-8">
          <Conversation
            workspaceId={owner.sId}
            conversationId={conversationId}
          />
          <AssistantInputBar onSubmit={() => console.log("Handle Submit")} />
        </div>
      </div>
    </AppLayout>
  );
}
