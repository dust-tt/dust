import { Button, Card, Lightbulb04, Page, XClose } from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import { mockAgents } from "../data";
import { KnowledgeComposer } from "./KnowledgeComposer";
import { PlaygroundScreen } from "./PlaygroundScreen";

// A playground stand-in for front/components/assistant/conversation/
// ConversationContainer.tsx in its "no active conversation" state — the Dust
// homepage. The real one is wired to SWR, the router and conversation
// creation, so this reproduces the chrome only: same max-w-conversation
// column, same greeting header, same sticky bottom input slot. The point is
// to exercise the "/" composer at the width and position it really gets.
const GREETINGS = [
  "Hey [Name]! 👋",
  "Good to see you, [Name]! 😊",
  "What's up, [Name]? 🙌",
  "How's it going, [Name]? 🚀",
  "Welcome back, [Name]! 🔄",
];

function AgentStrip() {
  const agents = useMemo(() => mockAgents.slice(0, 6), []);

  return (
    <div className="w-full max-w-conversation">
      <Page.SectionHeader title="Agents" />
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id} variant="primary" size="sm">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                style={{ backgroundColor: agent.backgroundColor }}
              >
                {agent.emoji}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate heading-sm text-foreground">
                  {agent.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {agent.description}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DustHomeView({ firstName = "Radja" }: { firstName?: string }) {
  const [isSuggestionVisible, setIsSuggestionVisible] = useState(true);

  // Production randomises this once on mount; a fixed pick keeps the story
  // stable to look at.
  const greeting = useMemo(
    () => GREETINGS[0].replace("[Name]", firstName),
    [firstName]
  );

  return (
    <PlaygroundScreen>
      <div className="flex min-h-full w-full flex-col items-center px-4">
        <div
          id="agent-input-header"
          className="flex h-fit w-full max-w-conversation flex-col items-center justify-end gap-4 py-4 md:min-h-[20vh]"
        >
          <Page.Header title={greeting} />
        </div>

        {/* Production keeps this sticky to the bottom of the viewport at the
            conversation column's width — which is what makes the popover's
            placement worth checking here. */}
        <div className="sticky bottom-0 z-20 flex max-h-dvh w-full max-w-conversation pb-2 md:pb-4">
          <KnowledgeComposer
            className="max-w-none"
            minRows={3}
            placeholder="Get work done"
          />
        </div>

        {isSuggestionVisible && (
          <div className="mt-1 w-full max-w-conversation">
            <Card
              variant="highlight"
              size="md"
              containerClassName="w-full group"
            >
              <div className="flex w-full flex-col gap-2 text-sm">
                <div className="flex w-full items-center gap-2 font-semibold text-highlight-600">
                  <Lightbulb04 className="h-5 w-5 text-highlight-600" />
                  <div className="w-full">Try attaching knowledge</div>
                  <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={XClose}
                      tooltip="Dismiss"
                      onClick={() => setIsSuggestionVisible(false)}
                      className="text-highlight-600"
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Type "/" in the input bar to pull in a capability, a file, or
                  anything from your spaces.
                </div>
              </div>
            </Card>
          </div>
        )}

        <div className="w-full py-8">
          <div className="flex w-full justify-center">
            <AgentStrip />
          </div>
        </div>
      </div>
    </PlaygroundScreen>
  );
}
