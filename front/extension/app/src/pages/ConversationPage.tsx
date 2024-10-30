import type { ProtectedRouteChildrenProps } from "@app/extension/app/src/components/auth/ProtectedRoute";
import { ConversationContainer } from "@app/extension/app/src/components/conversation/ConversationContainer";
import { BarHeader, ChevronLeftIcon, Page } from "@dust-tt/sparkle";
import { Link, useNavigate, useParams } from "react-router-dom";

export const ConversationPage = ({
  workspace,
  user,
}: ProtectedRouteChildrenProps) => {
  const navigate = useNavigate();
  const { conversationId } = useParams();

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
          user={user}
        />
      </div>
    </>
  );
};
