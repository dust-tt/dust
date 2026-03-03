import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SpaceConversationsPage } from "@app/components/pages/conversation/SpaceConversationsPage";
import { ConversationLayout } from "@extension/ui/components/conversation/ConversationLayout";

export const SpaceMainPage = () => {
  return (
    <ConversationLayout>
      <InputBarProvider origin="extension">
        <SpaceConversationsPage />
      </InputBarProvider>
    </ConversationLayout>
  );
};
