import type { ReactElement } from "react";

import ConversationLayout from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationContainer } from "@app/pages/w/[wId]/assistant/new3";

export function AssistantConversationTest(props) {
  return (
    <div>
      <ConversationContainer />
    </div>
  );
}

AssistantConversationTest.getLayout = (page: ReactElement, pageProps: any) => {
  return <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>;
};
