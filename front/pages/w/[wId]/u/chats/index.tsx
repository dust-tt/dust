import {
  Button,
  ChatBubbleBottomCenterPlusIcon,
  ChatBubbleBottomCenterTextIcon,
  Item,
  PageHeader,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationChat } from "@app/components/sparkle/navigation";
import {
  Authenticator,
  getSession,
  getUserFromSession,
  prodAPICredentialsForOwner,
} from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { useChatSessions } from "@app/lib/swr";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  hasManagedDatasources: boolean;
  gaTrackingId: string;
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
      notFound: true,
    };
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const prodAPI = new DustAPI(prodCredentials);

  const dsRes = await prodAPI.getDataSources(prodAPI.workspaceId());
  if (dsRes.isErr()) {
    return {
      notFound: true,
    };
  }

  const hasManagedDatasources = dsRes.value.some(
    (ds) => ds.connectorProvider !== null
  );

  return {
    props: {
      user,
      owner,
      hasManagedDatasources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

function ChatNewConversation({
  onNewConversation,
  canStartConversation,
}: {
  onNewConversation: () => void;
  canStartConversation: boolean;
}) {
  return (
    <div className="flex grow flex-col">
      <div className="flex flex-row px-2">
        <div className="flex grow"></div>
        <Button
          disabled={!canStartConversation}
          labelVisible={true}
          label="New Conversation"
          icon={ChatBubbleBottomCenterPlusIcon}
          onClick={onNewConversation}
          className="flex flex-initial"
        />
      </div>
    </div>
  );
}

export default function AppChatWorkspaceConversations({
  user,
  owner,
  hasManagedDatasources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const { sessions } = useChatSessions(owner, {
    limit: 256,
    offset: 0,
    workspaceScope: true,
  });

  const handleNew = async () => {
    void router.push(`/w/${owner.sId}/u/chat`);
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistant"
      topNavigationChildren={
        <ChatNewConversation
          onNewConversation={handleNew}
          canStartConversation={hasManagedDatasources}
        />
      }
      subNavigation={subNavigationChat({
        owner,
        current: "workspace_sessions",
      })}
    >
      <div className="pt-4">
        <>
          <PageHeader
            title="Workspace conversations"
            icon={ChatBubbleBottomCenterTextIcon}
          />
          <div className="mt-16">
            {sessions.length === 0 ? (
              <p className="text-sm">
                No conversations were yet shared for the workspace!
              </p>
            ) : (
              sessions.map((s) => {
                return (
                  <div key={s.sId}>
                    <Item
                      size="md"
                      label={s.title || ""}
                      className="w-full"
                      href={`/w/${owner.sId}/u/chat/${s.sId}`}
                    />
                    <div className="my-4 border-t border-gray-200" />
                  </div>
                );
              })
            )}
          </div>
        </>
      </div>
    </AppLayout>
  );
}
