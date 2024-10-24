import { useAuth } from "@app/extension/app/src/components/auth/AuthProvider";
import { ConversationContainer } from "@app/extension/app/src/components/conversation/ConversationContainer";
import { Page, Spinner } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useNavigate } from "react-router-dom";

export const MainPage = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, user } = useAuth();

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

  const owner: WorkspaceType = {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    role: workspace.role,
    segmentation: workspace.segmentation,
    whiteListedProviders: workspace.whiteListedProviders,
    defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
    flags: [],
  };

  return (
    <div className="h-full w-full">
      <Page.SectionHeader title="Conversation" />
      <ConversationContainer owner={owner} conversationId={null} />
    </div>
  );
};
