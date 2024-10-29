import { useAuth } from "@app/extension/app/src/components/auth/AuthProvider";
import { ConversationContainer } from "@app/extension/app/src/components/conversation/ConversationContainer";
import { BarHeader, ChevronLeftIcon, Page, Spinner } from "@dust-tt/sparkle";
import { Link, useNavigate, useParams } from "react-router-dom";

export const ConversationPage = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, user } = useAuth();
  const { conversationId } = useParams();

  console.log(conversationId);

  if (isLoading) {
    return (
      <div className="h-full w-full">
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    navigate("/login");
    return;
  }

  const workspace = user.workspaces.find(
    (w) => w.sId === user.selectedWorkspace
  );

  if (!workspace) {
    navigate("/login");
    return;
  }

  if (!conversationId) {
    navigate("/");
    return;
  }

  return (
    <>
      <BarHeader
        title="Back"
        leftActions={
          <Link to="/">
            <ChevronLeftIcon />
          </Link>
        }
      />
      <div className="h-full w-full pt-4">
        <Page.SectionHeader title="Conversation" />
        <ConversationContainer
          owner={workspace}
          conversationId={conversationId}
        />
      </div>
    </>
  );
};
