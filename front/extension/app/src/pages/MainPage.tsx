import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { FixedAssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

export const MainPage = () => {
  const owner: WorkspaceType = {
    id: 1,
    sId: "IQw2NP0Anb",
    name: "test",
    role: "user",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    flags: [],
  };

  return (
    <div className="w-full h-full">
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
