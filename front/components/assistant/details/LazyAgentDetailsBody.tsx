import { Spinner } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";
import { lazy, Suspense } from "react";

// The agent details body pulls in the instructions editor (tiptap), the insights charts (recharts)
// and the triggers editors. It is only shown on demand (sheet or side panel), so keep it out of
// the chunks of the always-mounted layouts that render it.
const AgentDetailsBody = lazy(() =>
  import("@app/components/assistant/details/AgentDetailsBody").then((m) => ({
    default: m.AgentDetailsBody,
  }))
);

export function LazyAgentDetailsBody(
  props: ComponentProps<typeof AgentDetailsBody>
) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <AgentDetailsBody {...props} />
    </Suspense>
  );
}
