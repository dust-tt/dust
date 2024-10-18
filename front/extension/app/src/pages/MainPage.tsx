import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { useAuth } from "@app/extension/app/src/context/AuthProvider";
import { Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

export const MainPage = () => {
  const { token } = useAuth();
  if (!token) {
    return <div>Not logged in!!!</div>;
  }

  const owner: WorkspaceType = {
    id: 1,
    sId: "7ea8c3d99c",
    name: "test",
    role: "user",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    flags: [],
  };

  return (
    <div className="h-full w-full">
      <Page.SectionHeader title="Conversation" />
      <GenerationContextProvider>
        <FixedAssistantInputBar
          owner={owner}
          onSubmit={() => {}}
          stickyMentions={[]}
          actions={["attachment", "assistants-list"]}
          conversationId={null}
        />
      </GenerationContextProvider>
    </div>
  );
};
