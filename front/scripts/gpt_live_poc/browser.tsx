/** @jsxRuntime automatic */
// Local browser fixture, loaded only by front-api/scripts/gpt_live_poc.ts.
import { LiveConversation } from "@app/components/assistant/conversation/LiveConversation";
import { LiveConversationButton } from "@app/components/assistant/conversation/LiveConversationButton";
import {
  LiveConversationProvider,
  useLiveConversationContext,
} from "@app/components/assistant/conversation/LiveConversationContext";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@app/lib/swr/fetcher";
import type { UserType, WorkspaceType } from "@app/types/user";
import { ArrowUp, Button, Composer, Robot } from "@dust-tt/sparkle";
import { createRoot } from "react-dom/client";
import "../../styles/global.css";
import "../../../front-spa/src/index.css";

interface FixtureProps {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
}

function FixtureComposer({ conversationId }: { conversationId: string }) {
  const voice = useLiveConversationContext();
  const active =
    !!voice &&
    ["connecting", "connected", "closing"].includes(voice.live.status);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-end p-8">
      <div className="mb-12 text-center">
        <h1 className="text-2xl font-semibold">What can we get done?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Write a message, or talk it through with Dust.
        </p>
      </div>
      <LiveConversation conversationId={conversationId} />
      <Composer
        variant="floating"
        isFocused={false}
        leftActions={
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={Robot}
            label="Dust"
            isRounded
          />
        }
        rightActions={
          <>
            {!active && (
              <LiveConversationButton
                size="xs"
                agentName="Dust"
                onClick={() => {
                  void voice?.start({
                    conversationId,
                    agent: { sId: "dust", name: "Dust" },
                  });
                }}
              />
            )}
            <Button
              variant="highlight"
              size="xs"
              aria-label="Send message"
              icon={ArrowUp}
              isRounded
              disabled
            />
          </>
        }
      >
        <p className="pb-2 text-base text-muted-foreground">
          Ask a question or share a task…
        </p>
      </Composer>
    </main>
  );
}

async function mountFixture() {
  const props: FixtureProps = await fetch("/live-fixture").then((response) =>
    response.json()
  );
  document.getElementById("loading")?.remove();
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
        <LiveConversationProvider {...props} onConversationCreated={() => {}}>
          <FixtureComposer conversationId={props.conversationId} />
        </LiveConversationProvider>
      </FetcherProvider>
    );
  }
}

void mountFixture();
