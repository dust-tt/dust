/** @jsxRuntime automatic */
// Local browser fixture, loaded only by front-api/scripts/gpt_live_poc.ts.
import { LiveConversation } from "@app/components/assistant/conversation/LiveConversation";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@app/lib/swr/fetcher";
import type { UserType, WorkspaceType } from "@app/types/user";
import { createRoot } from "react-dom/client";
import "../../styles/global.css";
import "../../../front-spa/src/index.css";

async function mountFixture() {
  const props: {
    owner: WorkspaceType;
    user: UserType;
    conversationId: string;
  } = await fetch("/live-fixture").then((response) => response.json());
  document.getElementById("loading")?.remove();
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <main className="mx-auto max-w-3xl p-8">
          <LiveConversation {...props} />
        </main>
      </FetcherProvider>
    );
  }
}

void mountFixture();
